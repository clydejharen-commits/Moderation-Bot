import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ComponentType,
  ChannelType,
} from 'discord.js';
import { TrainingConfig } from '../db/models/TrainingConfig.js';
import { TrainingQuestion } from '../db/models/TrainingQuestion.js';

const MAX_QUESTIONS = 100;
const SITUATION_CHOICES = ['Warn', 'Mute', 'Call Higher-Up', 'Do Nothing'];
const TF_CHOICES = ['True', 'False'];

const setupPanels = new Map();
const questionWizards = new Map();

function panelKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

function getPanel(userId, channelId) {
  return setupPanels.get(panelKey(userId, channelId)) || null;
}

function setPanel(userId, channelId, guildId) {
  setupPanels.set(panelKey(userId, channelId), { userId, channelId, guildId });
}

function deletePanel(userId, channelId) {
  setupPanels.delete(panelKey(userId, channelId));
}

function wizardKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

function getWizard(userId, channelId) {
  return questionWizards.get(wizardKey(userId, channelId)) || null;
}

function setWizard(userId, channelId, data) {
  questionWizards.set(wizardKey(userId, channelId), data);
  setTimeout(() => questionWizards.delete(wizardKey(userId, channelId)), 5 * 60 * 1000);
}

function deleteWizard(userId, channelId) {
  questionWizards.delete(wizardKey(userId, channelId));
}

export function isTrainingSetupButton(customId) {
  return customId.startsWith('training_setup_') || customId.startsWith('training_qm_') || customId.startsWith('training_qw_') || customId.startsWith('training_del_') || customId === 'training_view_back';
}

export function isTrainingSetupModal(customId) {
  return customId.startsWith('training_modal_');
}

export function isTrainingSetupSelect(customId) {
  return customId.startsWith('training_select_') || customId.startsWith('training_qw_');
}

export function registerTrainingSetup(userId, channelId, guildId) {
  setPanel(userId, channelId, guildId);
}

export function buildMainPanelForCommand(config) {
  return buildMainPanel(config);
}

function buildMainPanel(config) {
  const embed = new EmbedBuilder()
    .setTitle('Training System Setup')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Training Channel', value: config.trainingChannelId ? `<#${config.trainingChannelId}>` : 'Not set', inline: true },
      { name: 'Trainer Role', value: config.trainerRoleId ? `<@&${config.trainerRoleId}>` : 'Not set', inline: true },
      { name: 'Passing Score', value: `${config.passingScore}%`, inline: true },
      { name: 'Questions Per Training', value: String(config.questionsPerTraining), inline: true },
      { name: 'Question Time Limit', value: formatTime(config.questionTimeLimit), inline: true },
      { name: 'Question Bank', value: 'Click "Question Management" to manage', inline: true },
    )
    .setFooter({ text: 'Only you can interact with this panel.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_setup_channel').setLabel('Training Channel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('training_setup_role').setLabel('Trainer Role').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('training_setup_passing').setLabel('Passing Score').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_setup_count').setLabel('Questions Count').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('training_setup_time').setLabel('Time Limit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('training_setup_questions').setLabel('Question Management').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_setup_done').setLabel('✅ Done').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('training_setup_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function formatTime(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${seconds}s`;
}

async function ensureDeferred(interaction, mode = 'update') {
  if (!interaction.deferred && !interaction.replied) {
    if (mode === 'update') {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ ephemeral: true });
    }
  }
}

async function respond(interaction, payload, isUpdate = false) {
  if (interaction.deferred) {
    await interaction.editReply(payload);
  } else if (interaction.replied) {
    await interaction.followUp({ ...payload, ephemeral: true });
  } else if (isUpdate) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

export async function handleTrainingSetupButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  if (customId === 'training_setup_cancel') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '❌ Training setup cancelled.' });
    return;
  }

  if (customId === 'training_setup_done') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '✅ Training setup complete. All settings have been saved.' });
    return;
  }

  if (customId === 'training_view_back') {
    const panel = getPanel(userId, channelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    let config;
    try {
      config = await getOrCreateConfig(panel.guildId);
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    return;
  }

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  switch (customId) {
    case 'training_setup_channel':
      await showChannelSelect(interaction);
      break;
    case 'training_setup_role':
      await showRoleSelect(interaction);
      break;
    case 'training_setup_passing':
      await showPassingScoreModal(interaction, panel.guildId);
      break;
    case 'training_setup_count':
      await showCountModal(interaction, panel.guildId);
      break;
    case 'training_setup_time':
      await showTimeLimitModal(interaction, panel.guildId);
      break;
    case 'training_setup_questions':
      await showQuestionManagement(interaction, panel.guildId);
      break;
    case 'training_qm_add':
      await startAddQuestion(interaction, panel.guildId);
      break;
    case 'training_qm_view':
      await showQuestionList(interaction, panel.guildId, 0);
      break;
    case 'training_qm_back':
      await showQuestionManagement(interaction, panel.guildId, true);
      break;
    case 'training_qm_edit_list':
      await showEditQuestionList(interaction, panel.guildId, 0);
      break;
    case 'training_qm_delete_list':
      await showDeleteQuestionList(interaction, panel.guildId, 0);
      break;
    default:
      if (customId.startsWith('training_del_confirm:')) {
        await handleDeleteConfirm(interaction, customId.split(':')[1], panel.guildId);
      } else if (customId === 'training_del_cancel') {
        await interaction.deferUpdate();
        await showQuestionManagement(interaction, panel.guildId, true);
      } else if (customId === 'training_qm_list_prev' || customId === 'training_qm_list_next') {
        const wizard = getWizard(userId, channelId);
        const page = (wizard?.listPage || 0) + (customId === 'training_qm_list_next' ? 1 : -1);
        await showQuestionList(interaction, panel.guildId, Math.max(0, page));
      }
      break;
  }
}

export async function handleTrainingSetupSelect(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  if (customId === 'training_select_channel') {
    const selectedChannelId = interaction.values[0];
    await interaction.deferUpdate();
    try {
      await TrainingConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { trainingChannelId: selectedChannelId },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Training channel set to <#${selectedChannelId}>.`, ephemeral: true });
    return;
  }

  if (customId === 'training_select_role') {
    const roleId = interaction.values[0];
    await interaction.deferUpdate();
    try {
      await TrainingConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { trainerRoleId: roleId },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Trainer role set to <@&${roleId}>.`, ephemeral: true });
    return;
  }

  if (customId.startsWith('training_qw_type:')) {
    await handleQuestionTypeSelect(interaction, customId, panel.guildId);
    return;
  }

  if (customId.startsWith('training_qw_correct:')) {
    await handleCorrectAnswerSelect(interaction, customId, panel.guildId);
    return;
  }

  if (customId.startsWith('training_select_edit:')) {
    const questionId = interaction.values[0];
    await startEditQuestion(interaction, panel.guildId, questionId);
    return;
  }

  if (customId.startsWith('training_select_delete:')) {
    const questionId = interaction.values[0];
    await showDeleteConfirmation(interaction, questionId, panel.guildId);
    return;
  }
}

export async function handleTrainingSetupModal(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  if (customId === 'training_modal_passing') {
    const raw = interaction.fields.getTextInputValue('training_passing_value').trim();
    const score = parseInt(raw, 10);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      await interaction.reply({ content: '❌ Passing score must be a number between 0 and 100.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await TrainingConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { passingScore: score },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Passing score set to ${score}%.`, ephemeral: true });
    return;
  }

  if (customId === 'training_modal_count') {
    const raw = interaction.fields.getTextInputValue('training_count_value').trim();
    const count = parseInt(raw, 10);
    if (Number.isNaN(count) || count < 1 || count > 100) {
      await interaction.reply({ content: '❌ Questions per training must be a number between 1 and 100.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await TrainingConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { questionsPerTraining: count },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Questions per training set to ${count}.`, ephemeral: true });
    return;
  }

  if (customId === 'training_modal_time') {
    const raw = interaction.fields.getTextInputValue('training_time_value').trim();
    const seconds = parseInt(raw, 10);
    if (Number.isNaN(seconds) || seconds < 1 || seconds > 300) {
      await interaction.reply({ content: '❌ Time limit must be between 1 and 300 seconds.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await TrainingConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { questionTimeLimit: seconds },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Question time limit set to ${formatTime(seconds)}.`, ephemeral: true });
    return;
  }

  if (customId === 'training_modal_qtext') {
    const text = interaction.fields.getTextInputValue('training_qtext_value').trim();
    const explanation = interaction.fields.getTextInputValue('training_qexplanation_value')?.trim() || null;

    let count;
    try {
      count = await TrainingQuestion.countDocuments({ guildId: panel.guildId });
    } catch {
      await interaction.reply({ content: '❌ Database error.', ephemeral: true });
      return;
    }

    const wizard = getWizard(userId, channelId);
    if (!wizard) {
      await interaction.reply({ content: '❌ The question wizard has expired. Please start again.', ephemeral: true });
      return;
    }

    if (wizard.mode === 'add' && count >= MAX_QUESTIONS) {
      await interaction.reply({ content: `❌ The question bank is full (max ${MAX_QUESTIONS}). Delete some questions before adding new ones.`, ephemeral: true });
      return;
    }

    if (wizard.mode === 'add') {
      wizard.questionText = text;
      wizard.explanation = explanation;
      await showQuestionTypeSelect(interaction);
    } else if (wizard.mode === 'edit') {
      wizard.questionText = text;
      wizard.explanation = explanation;
      await showEditTypeSelect(interaction);
    }
    return;
  }

  if (customId === 'training_modal_qchoices') {
    const wizard = getWizard(userId, channelId);
    if (!wizard) {
      await interaction.reply({ content: '❌ The question wizard has expired.', ephemeral: true });
      return;
    }

    const choices = [];
    for (let i = 1; i <= 4; i++) {
      const val = interaction.fields.getTextInputValue(`training_choice_${i}`)?.trim();
      if (val) choices.push(val);
    }

    if (choices.length < 2) {
      await interaction.reply({ content: '❌ You must provide at least 2 answer choices.', ephemeral: true });
      return;
    }

    wizard.choices = choices;
    await showCorrectAnswerSelect(interaction, choices);
    return;
  }

  if (customId === 'training_modal_edit_choices') {
    const wizard = getWizard(userId, channelId);
    if (!wizard) {
      await interaction.reply({ content: '❌ The question wizard has expired.', ephemeral: true });
      return;
    }

    const choices = [];
    const numChoices = wizard.choices.length;
    for (let i = 0; i < numChoices; i++) {
      const val = interaction.fields.getTextInputValue(`training_edit_choice_${i}`)?.trim();
      if (val) choices.push(val);
    }

    if (choices.length < 2) {
      await interaction.reply({ content: '❌ You must provide at least 2 answer choices.', ephemeral: true });
      return;
    }

    wizard.choices = choices;
    await showCorrectAnswerSelect(interaction, choices, true);
    return;
  }
}

async function getOrCreateConfig(guildId) {
  let config;
  try {
    config = await TrainingConfig.findOne({ guildId }).lean();
  } catch {
    // fall through
  }
  if (!config) {
    config = {
      guildId,
      trainingChannelId: null,
      trainerRoleId: null,
      passingScore: 80,
      questionsPerTraining: 10,
      questionTimeLimit: 60,
    };
  }
  return config;
}

async function showChannelSelect(interaction) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId('training_select_channel')
    .setPlaceholder('Select a training channel')
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: 'Select a channel for training sessions:', components: [row], ephemeral: true });
}

async function showRoleSelect(interaction) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId('training_select_role')
    .setPlaceholder('Select the trainer role')
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: 'Select the role that can start and manage training:', components: [row], ephemeral: true });
}

async function showPassingScoreModal(interaction, guildId) {
  let config;
  try {
    config = await getOrCreateConfig(guildId);
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder().setCustomId('training_modal_passing').setTitle('Passing Score');
  const input = new TextInputBuilder()
    .setCustomId('training_passing_value')
    .setLabel('Passing Score (0-100 %)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(config.passingScore));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCountModal(interaction, guildId) {
  let config;
  try {
    config = await getOrCreateConfig(guildId);
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder().setCustomId('training_modal_count').setTitle('Questions Per Training');
  const input = new TextInputBuilder()
    .setCustomId('training_count_value')
    .setLabel('Number of Questions (1-100)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(config.questionsPerTraining));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showTimeLimitModal(interaction, guildId) {
  let config;
  try {
    config = await getOrCreateConfig(guildId);
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder().setCustomId('training_modal_time').setTitle('Question Time Limit');
  const input = new TextInputBuilder()
    .setCustomId('training_time_value')
    .setLabel('Time per question in seconds (1-300)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(config.questionTimeLimit));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showQuestionManagement(interaction, guildId, isUpdate = false) {
  await ensureDeferred(interaction, isUpdate ? 'update' : 'reply');
  let count;
  try {
    count = await TrainingQuestion.countDocuments({ guildId });
  } catch {
    await respond(interaction, { content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Question Management')
    .setColor(0x2ECC71)
    .setDescription(`**Questions in bank:** ${count}/${MAX_QUESTIONS}`)
    .setFooter({ text: 'Use the buttons below to manage questions.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_add').setLabel('➕ Add Question').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('training_qm_edit_list').setLabel('✏️ Edit Question').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_delete_list').setLabel('🗑️ Delete Question').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('training_qm_view').setLabel('📋 View Questions').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_back').setLabel('◀ Back to Setup').setStyle(ButtonStyle.Secondary),
  );

  const payload = { embeds: [embed], components: [row1, row2, row3] };
  await respond(interaction, payload, isUpdate);
}

async function startAddQuestion(interaction, guildId) {
  let count;
  try {
    count = await TrainingQuestion.countDocuments({ guildId });
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (count >= MAX_QUESTIONS) {
    await interaction.reply({ content: `❌ The question bank is full (max ${MAX_QUESTIONS}). Delete some questions first.`, ephemeral: true });
    return;
  }

  setWizard(interaction.user.id, interaction.channelId, { mode: 'add', guildId });

  const modal = new ModalBuilder().setCustomId('training_modal_qtext').setTitle('Add Question — Step 1 of 3');
  const textInput = new TextInputBuilder()
    .setCustomId('training_qtext_value')
    .setLabel('Question Text')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setPlaceholder('Enter the question text...');

  const explanationInput = new TextInputBuilder()
    .setCustomId('training_qexplanation_value')
    .setLabel('Explanation (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('Shown after the trainee answers...');

  modal.addComponents(
    new ActionRowBuilder().addComponents(textInput),
    new ActionRowBuilder().addComponents(explanationInput),
  );

  await interaction.showModal(modal);
}

async function showQuestionTypeSelect(interaction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('training_qw_type:add')
    .setPlaceholder('Select question type')
    .addOptions(
      { label: 'Multiple Choice', value: 'multiple_choice', description: '2-4 custom answer choices' },
      { label: 'True / False', value: 'true_false', description: 'True or False as the choices' },
      { label: 'Situation', value: 'situation', description: 'Warn, Mute, Call Higher-Up, Do Nothing' },
    );

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: '**Add Question — Step 2 of 3**\nSelect the question type:', components: [row], ephemeral: true });
}

async function showEditTypeSelect(interaction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('training_qw_type:edit')
    .setPlaceholder('Select question type')
    .addOptions(
      { label: 'Multiple Choice', value: 'multiple_choice', description: '2-4 custom answer choices' },
      { label: 'True / False', value: 'true_false', description: 'True or False as the choices' },
      { label: 'Situation', value: 'situation', description: 'Warn, Mute, Call Higher-Up, Do Nothing' },
    );

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: '**Edit Question — Step 2**\nSelect the question type:', components: [row], ephemeral: true });
}

async function handleQuestionTypeSelect(interaction, customId, guildId) {
  const mode = customId.split(':')[1];
  const questionType = interaction.values[0];
  const wizard = getWizard(interaction.user.id, interaction.channelId);
  if (!wizard) {
    await interaction.reply({ content: '❌ The question wizard has expired.', ephemeral: true });
    return;
  }

  wizard.questionType = questionType;

  if (questionType === 'multiple_choice') {
    await showChoicesModal(interaction, mode);
  } else {
    const choices = questionType === 'true_false' ? TF_CHOICES : SITUATION_CHOICES;
    wizard.choices = choices;
    await showCorrectAnswerSelect(interaction, choices, mode === 'edit');
  }
}

async function showChoicesModal(interaction, mode) {
  const title = mode === 'edit' ? 'Edit Question — Choices' : 'Add Question — Step 3 of 3';
  const modalId = mode === 'edit' ? 'training_modal_edit_choices' : 'training_modal_qchoices';
  const wizard = getWizard(interaction.user.id, interaction.channelId);

  const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);

  const existingChoices = wizard?.choices || [];
  for (let i = 0; i < 4; i++) {
    const input = new TextInputBuilder()
      .setCustomId(mode === 'edit' ? `training_edit_choice_${i}` : `training_choice_${i + 1}`)
      .setLabel(`Choice ${i + 1}${i >= 2 ? ' (optional)' : ''}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(i < 2)
      .setMaxLength(200);

    if (existingChoices[i]) {
      input.setValue(existingChoices[i]);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

async function showCorrectAnswerSelect(interaction, choices, isEdit = false) {
  const wizard = getWizard(interaction.user.id, interaction.channelId);
  if (!wizard) {
    await interaction.reply({ content: '❌ The question wizard has expired.', ephemeral: true });
    return;
  }

  const options = choices.map((c) => ({
    label: c.length > 100 ? c.slice(0, 97) + '...' : c,
    value: c,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(isEdit ? 'training_qw_correct:edit' : 'training_qw_correct:add')
    .setPlaceholder('Select the correct answer')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  const title = isEdit ? 'Edit Question — Correct Answer' : 'Add Question — Final Step';
  await interaction.reply({ content: `**${title}**\nSelect the correct answer:`, components: [row], ephemeral: true });
}

async function handleCorrectAnswerSelect(interaction, customId, guildId) {
  const mode = customId.split(':')[1];
  const correctAnswer = interaction.values[0];
  const wizard = getWizard(interaction.user.id, interaction.channelId);
  if (!wizard) {
    await interaction.reply({ content: '❌ The question wizard has expired.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  if (mode === 'add') {
    try {
      await TrainingQuestion.create({
        guildId,
        questionText: wizard.questionText,
        questionType: wizard.questionType,
        choices: wizard.choices,
        correctAnswer,
        explanation: wizard.explanation,
      });
    } catch (err) {
      console.error('[TRAINING SETUP] Failed to create question:', err.message);
      await interaction.editReply({ content: '❌ Database error. Failed to save the question.', embeds: [], components: [] });
      return;
    }

    deleteWizard(interaction.user.id, interaction.channelId);
    await showQuestionManagement(interaction, guildId, true);
  } else if (mode === 'edit') {
    try {
      await TrainingQuestion.findByIdAndUpdate(wizard.questionId, {
        questionText: wizard.questionText,
        questionType: wizard.questionType,
        choices: wizard.choices,
        correctAnswer,
        explanation: wizard.explanation,
      });
    } catch (err) {
      console.error('[TRAINING SETUP] Failed to update question:', err.message);
      await interaction.editReply({ content: '❌ Database error. Failed to update the question.', embeds: [], components: [] });
      return;
    }

    deleteWizard(interaction.user.id, interaction.channelId);
    await showQuestionManagement(interaction, guildId, true);
  }
}

async function showQuestionList(interaction, guildId, page) {
  await ensureDeferred(interaction);
  let questions;
  try {
    questions = await TrainingQuestion.find({ guildId }).sort({ createdAt: 1 }).lean();
  } catch {
    await respond(interaction, { content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  if (questions.length === 0) {
    await respond(interaction, { content: '❌ No questions have been added yet.', embeds: [], components: [] });
    return;
  }

  setWizard(interaction.user.id, interaction.channelId, { mode: 'view', listPage: page, guildId });

  const pageSize = 5;
  const totalPages = Math.ceil(questions.length / pageSize) || 1;
  const startIdx = page * pageSize;
  const pageQuestions = questions.slice(startIdx, startIdx + pageSize);

  const embed = new EmbedBuilder()
    .setTitle(`Question Bank — ${questions.length} total`)
    .setColor(0x2ECC71)
    .setFooter({ text: `Page ${page + 1}/${totalPages}` });

  for (let i = 0; i < pageQuestions.length; i++) {
    const q = pageQuestions[i];
    const num = startIdx + i + 1;
    const typeLabel = {
      multiple_choice: 'MC',
      true_false: 'T/F',
      situation: 'Sit',
    }[q.questionType] || 'Q';

    embed.addFields({
      name: `${num}. [${typeLabel}] ${q.questionText.slice(0, 80)}${q.questionText.length > 80 ? '...' : ''}`,
      value: `**Choices:** ${q.choices.join(' | ')}\n**Correct:** ||${q.correctAnswer}||${q.explanation ? `\n**Explanation:** ${q.explanation.slice(0, 100)}` : ''}`,
      inline: false,
    });
  }

  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('training_qm_list_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('training_qm_list_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_back').setLabel('◀ Back').setStyle(ButtonStyle.Secondary),
  ));

  await respond(interaction, { embeds: [embed], components }, true);
}

async function showEditQuestionList(interaction, guildId, page) {
  await ensureDeferred(interaction);
  let questions;
  try {
    questions = await TrainingQuestion.find({ guildId }).sort({ createdAt: 1 }).lean();
  } catch {
    await respond(interaction, { content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  if (questions.length === 0) {
    await respond(interaction, { content: '❌ No questions have been added yet.', embeds: [], components: [] });
    return;
  }

  const options = questions.slice(0, 25).map((q) => ({
    label: q.questionText.slice(0, 100),
    value: q._id.toString(),
    description: `Type: ${q.questionType}`,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('training_select_edit:list')
    .setPlaceholder('Select a question to edit')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_back').setLabel('◀ Back').setStyle(ButtonStyle.Secondary),
  );

  await respond(interaction, { content: 'Select a question to edit:', embeds: [], components: [row, backRow] }, true);
}

async function showDeleteQuestionList(interaction, guildId, page) {
  await ensureDeferred(interaction);
  let questions;
  try {
    questions = await TrainingQuestion.find({ guildId }).sort({ createdAt: 1 }).lean();
  } catch {
    await respond(interaction, { content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  if (questions.length === 0) {
    await respond(interaction, { content: '❌ No questions have been added yet.', embeds: [], components: [] });
    return;
  }

  const options = questions.slice(0, 25).map((q) => ({
    label: q.questionText.slice(0, 100),
    value: q._id.toString(),
    description: `Type: ${q.questionType}`,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('training_select_delete:list')
    .setPlaceholder('Select a question to delete')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('training_qm_back').setLabel('◀ Back').setStyle(ButtonStyle.Secondary),
  );

  await respond(interaction, { content: 'Select a question to delete:', embeds: [], components: [row, backRow] }, true);
}

async function startEditQuestion(interaction, guildId, questionId) {
  let question;
  try {
    question = await TrainingQuestion.findById(questionId).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!question) {
    await interaction.reply({ content: '❌ That question no longer exists.', ephemeral: true });
    return;
  }

  setWizard(interaction.user.id, interaction.channelId, {
    mode: 'edit',
    questionId,
    guildId,
    questionText: question.questionText,
    questionType: question.questionType,
    choices: question.choices,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  });

  const modal = new ModalBuilder().setCustomId('training_modal_qtext').setTitle('Edit Question — Step 1');
  const textInput = new TextInputBuilder()
    .setCustomId('training_qtext_value')
    .setLabel('Question Text')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setValue(question.questionText);

  const explanationInput = new TextInputBuilder()
    .setCustomId('training_qexplanation_value')
    .setLabel('Explanation (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  if (question.explanation) {
    explanationInput.setValue(question.explanation);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(textInput),
    new ActionRowBuilder().addComponents(explanationInput),
  );

  await interaction.showModal(modal);
}

async function showDeleteConfirmation(interaction, questionId, guildId) {
  await ensureDeferred(interaction);
  let question;
  try {
    question = await TrainingQuestion.findById(questionId).lean();
  } catch {
    await respond(interaction, { content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  if (!question) {
    await respond(interaction, { content: '❌ That question no longer exists.', embeds: [], components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Delete Question?')
    .setColor(0xE74C3C)
    .setDescription(`**${question.questionText.slice(0, 200)}**\n\nThis action cannot be undone.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`training_del_confirm:${questionId}`).setLabel('🗑️ Confirm Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('training_del_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  await respond(interaction, { embeds: [embed], components: [row] }, true);
}

async function handleDeleteConfirm(interaction, questionId, guildId) {
  await interaction.deferUpdate();
  try {
    await TrainingQuestion.findByIdAndDelete(questionId);
  } catch (err) {
    console.error('[TRAINING SETUP] Failed to delete question:', err.message);
    await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
    return;
  }

  await showQuestionManagement(interaction, guildId, true);
}
