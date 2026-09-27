import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';

const setupPanels = new Map();

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

export function isQuestSetupButton(customId) {
  return customId.startsWith('quest_setup_') || customId.startsWith('quest_select_');
}

export function isQuestSetupModal(customId) {
  return customId.startsWith('quest_modal_');
}

export function isQuestSetupSelect(customId) {
  return customId.startsWith('quest_select_');
}

export function registerQuestSetup(userId, channelId, guildId) {
  setPanel(userId, channelId, guildId);
}

async function getOrCreateConfig(guildId) {
  let config = await QuestConfig.findOne({ guildId }).lean();
  if (!config) {
    config = await QuestConfig.findOneAndUpdate(
      { guildId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }
  return config;
}

function formatUserList(users, client) {
  if (!users || users.length === 0) return 'None';
  return users.map((id) => `<@${id}>`).join(', ');
}

function formatRoleList(roles) {
  if (!roles || roles.length === 0) return 'None';
  return roles.map((id) => `<@&${id}>`).join(', ');
}

export function buildMainPanelForCommand(config) {
  return buildMainPanel(config);
}

function buildMainPanel(config) {
  const embed = new EmbedBuilder()
    .setTitle('Quest System Setup')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Trainee Users', value: formatUserList(config.traineeUsers) || 'None', inline: false },
      { name: 'Trainee Roles', value: formatRoleList(config.traineeRoles) || 'None', inline: false },
      { name: 'Trainer Users', value: formatUserList(config.trainerUsers) || 'None', inline: false },
      { name: 'Trainer Roles', value: formatRoleList(config.trainerRoles) || 'None', inline: false },
      { name: 'Promotion %', value: `${config.promotionPercent}%`, inline: true },
      { name: 'Demotion %', value: `${config.demotionPercent}%`, inline: true },
    )
    .setFooter({ text: 'Only you can interact with this panel.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainee_users').setLabel('Trainee Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainee_roles').setLabel('Trainee Roles').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainer_users').setLabel('Trainer Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainer_roles').setLabel('Trainer Roles').setStyle(ButtonStyle.Primary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_promotion').setLabel('Promotion %').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_demotion').setLabel('Demotion %').setStyle(ButtonStyle.Primary),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_done').setLabel('✅ Done').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('quest_setup_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function handleQuestSetupButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  if (customId === 'quest_setup_cancel') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '❌ Quest setup cancelled.' });
    return;
  }

  if (customId === 'quest_setup_done') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '✅ Quest setup complete. All settings have been saved.' });
    return;
  }

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  switch (customId) {
    case 'quest_setup_trainee_users':
      await showUserSelect(interaction, 'quest_select_trainee_users', 'Select Trainee Users', 'Select users who are eligible trainees');
      break;
    case 'quest_setup_trainee_roles':
      await showRoleSelect(interaction, 'quest_select_trainee_roles', 'Select Trainee Roles', 'Select roles whose members are eligible trainees');
      break;
    case 'quest_setup_trainer_users':
      await showUserSelect(interaction, 'quest_select_trainer_users', 'Select Trainer Users', 'Select users who can manage questions');
      break;
    case 'quest_setup_trainer_roles':
      await showRoleSelect(interaction, 'quest_select_trainer_roles', 'Select Trainer Roles', 'Select roles whose members can manage questions');
      break;
    case 'quest_setup_promotion':
      await showPercentModal(interaction, panel.guildId, 'promotion');
      break;
    case 'quest_setup_demotion':
      await showPercentModal(interaction, panel.guildId, 'demotion');
      break;
  }
}

async function showUserSelect(interaction, customId, title, placeholder) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nSelect one or more users:`, components: [row], ephemeral: true });
}

async function showRoleSelect(interaction, customId, title, placeholder) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nSelect one or more roles:`, components: [row], ephemeral: true });
}

async function showPercentModal(interaction, guildId, type) {
  const config = await getOrCreateConfig(guildId);
  const isPromotion = type === 'promotion';
  const modal = new ModalBuilder()
    .setCustomId(isPromotion ? 'quest_modal_promotion' : 'quest_modal_demotion')
    .setTitle(isPromotion ? 'Promotion Percentage' : 'Demotion Percentage');

  const input = new TextInputBuilder()
    .setCustomId(isPromotion ? 'quest_promotion_value' : 'quest_demotion_value')
    .setLabel(isPromotion ? 'Promotion % (0-100)' : 'Demotion % (0-100)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(isPromotion ? config.promotionPercent : config.demotionPercent));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleQuestSetupSelect(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  const updateField = async (field, values) => {
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { [field]: values },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
  };

  switch (customId) {
    case 'quest_select_trainee_users':
      await updateField('traineeUsers', interaction.values);
      break;
    case 'quest_select_trainee_roles':
      await updateField('traineeRoles', interaction.values);
      break;
    case 'quest_select_trainer_users':
      await updateField('trainerUsers', interaction.values);
      break;
    case 'quest_select_trainer_roles':
      await updateField('trainerRoles', interaction.values);
      break;
  }
}

export async function handleQuestSetupModal(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  if (customId === 'quest_modal_promotion') {
    const raw = interaction.fields.getTextInputValue('quest_promotion_value').trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      await interaction.reply({ content: '❌ Promotion percentage must be a number between 0 and 100.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { promotionPercent: value },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Promotion percentage set to ${value}%.`, ephemeral: true });
    return;
  }

  if (customId === 'quest_modal_demotion') {
    const raw = interaction.fields.getTextInputValue('quest_demotion_value').trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      await interaction.reply({ content: '❌ Demotion percentage must be a number between 0 and 100.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { demotionPercent: value },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    const config = await getOrCreateConfig(panel.guildId);
    const panelData = buildMainPanel(config);
    await interaction.editReply({ ...panelData });
    await interaction.followUp({ content: `✅ Demotion percentage set to ${value}%.`, ephemeral: true });
    return;
  }
}
