import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { QuestQuestion } from '../db/models/QuestQuestion.js';
import { QuestAnswer } from '../db/models/QuestAnswer.js';
import { QuestConfig } from '../db/models/QuestConfig.js';

export function isQuestAnswerButton(customId) {
  return customId.startsWith('quest_answer:');
}

export function isQuestAnswerModal(customId) {
  return customId.startsWith('quest_answer_modal:');
}

export async function isTrainerOrAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config?.trainerUsers?.includes(member.id)) return true;
  if (config?.trainerRoles) {
    for (const roleId of config.trainerRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

export async function isEligibleTrainee(member, config) {
  if (config?.traineeUsers?.includes(member.id)) return true;
  if (config?.traineeRoles) {
    for (const roleId of config.traineeRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

export async function getActiveQuestion(guildId) {
  return QuestQuestion.findOne({ guildId, status: 'active' });
}

export async function hasActiveQuestion(guildId) {
  const count = await QuestQuestion.countDocuments({ guildId, status: 'active' });
  return count > 0;
}

export async function resolveEligibleTrainees(guild, config) {
  const traineeSet = new Set();

  for (const userId of config.traineeUsers || []) {
    traineeSet.add(userId);
  }

  for (const roleId of config.traineeRoles || []) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (role) {
      for (const member of role.members.values()) {
        if (!member.user.bot) {
          traineeSet.add(member.id);
        }
      }
    }
  }

  return Array.from(traineeSet);
}

export async function startQuestion(interaction, config, questionText) {
  const guildId = interaction.guild.id;

  if (await hasActiveQuestion(guildId)) {
    await interaction.reply({
      content: '❌ A question is already ongoing. End the current question before creating a new one.',
      ephemeral: true,
    });
    return;
  }

  const eligibleTrainees = await resolveEligibleTrainees(interaction.guild, config);

  if (eligibleTrainees.length === 0) {
    await interaction.reply({
      content: '❌ No eligible trainees found. Configure trainees in `/quest set` first.',
      ephemeral: true,
    });
    return;
  }

  let question;
  try {
    question = await QuestQuestion.create({
      guildId,
      questionText,
      status: 'active',
      createdBy: interaction.user.id,
      channelId: interaction.channelId,
      eligibleTrainees,
      answeredTrainees: [],
    });
  } catch (err) {
    console.error('[QUEST] Failed to create question:', err.message);
    await interaction.reply({ content: '❌ Database error. Failed to create the question.', ephemeral: true });
    return;
  }

  const embed = buildQuestionEmbed(questionText, eligibleTrainees.length, 0);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quest_answer:${question._id}`)
      .setLabel('Answer')
      .setStyle(ButtonStyle.Primary),
  );

  let sentMessage;
  try {
    sentMessage = await interaction.channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[QUEST] Failed to send question message:', err.message);
    await interaction.reply({ content: '❌ Failed to send the question message. Check my permissions.', ephemeral: true });
    await QuestQuestion.findByIdAndDelete(question._id);
    return;
  }

  await QuestQuestion.findByIdAndUpdate(question._id, {
    messageId: sentMessage.id,
    channelId: sentMessage.channelId,
  });

  await interaction.reply({ content: '✅ Question started.', ephemeral: true });
}

function buildQuestionEmbed(questionText, totalTrainees, answeredCount) {
  return new EmbedBuilder()
    .setTitle('Quest Question')
    .setColor(0x2ECC71)
    .setDescription(`**${questionText}**`)
    .addFields(
      { name: 'Trainees', value: String(totalTrainees), inline: true },
      { name: 'Answers', value: `${answeredCount}/${totalTrainees}`, inline: true },
    )
    .setFooter({ text: 'Click the Answer button to submit your response.' });
}

async function recalcEligibleTrainees(client, guildId, questionId) {
  let question;
  try {
    question = await QuestQuestion.findById(questionId).lean();
  } catch {
    return null;
  }

  if (!question || question.status !== 'active') return null;

  let config;
  try {
    config = await QuestConfig.findOne({ guildId }).lean();
  } catch {
    return null;
  }

  if (!config) return question;

  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch {
    return question;
  }

  const newEligible = await resolveEligibleTrainees(guild, config);

  try {
    await QuestQuestion.findByIdAndUpdate(questionId, {
      eligibleTrainees: newEligible,
    });
  } catch {
    // non-fatal
  }

  return { ...question, eligibleTrainees: newEligible };
}

export async function handleAnswerButton(interaction) {
  const questionId = interaction.customId.split(':')[1];

  let question;
  try {
    question = await QuestQuestion.findById(questionId).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!question || question.status !== 'active') {
    await interaction.reply({ content: '❌ This question is no longer active.', ephemeral: true });
    return;
  }

  if (question.guildId !== interaction.guild.id) {
    await interaction.reply({ content: '❌ This question does not belong to this server.', ephemeral: true });
    return;
  }

  let config;
  try {
    config = await QuestConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const isTrainee = await isEligibleTrainee(interaction.member, config);

  if (!isTrainee && !question.eligibleTrainees.includes(interaction.user.id)) {
    await interaction.reply({ content: '❌ You are not assigned as a trainee for this question.', ephemeral: true });
    return;
  }

  if (!question.eligibleTrainees.includes(interaction.user.id)) {
    const recalc = await recalcEligibleTrainees(interaction.client, interaction.guild.id, questionId);
    if (recalc && recalc.eligibleTrainees.includes(interaction.user.id)) {
      question = recalc;
    } else {
      await interaction.reply({ content: '❌ You are not assigned as a trainee for this question.', ephemeral: true });
      return;
    }
  }

  if (question.answeredTrainees.includes(interaction.user.id)) {
    await interaction.reply({ content: '❌ You have already submitted an answer for this question.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`quest_answer_modal:${questionId}`)
    .setTitle('Submit Your Answer');

  const input = new TextInputBuilder()
    .setCustomId('quest_answer_text')
    .setLabel('Your Answer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setPlaceholder('Type your answer here...');

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleAnswerModal(interaction) {
  const questionId = interaction.customId.split(':')[1];

  let question;
  try {
    question = await QuestQuestion.findById(questionId).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!question || question.status !== 'active') {
    await interaction.reply({ content: '❌ This question is no longer active.', ephemeral: true });
    return;
  }

  if (!question.eligibleTrainees.includes(interaction.user.id)) {
    const recalc = await recalcEligibleTrainees(interaction.client, interaction.guild.id, questionId);
    if (recalc && recalc.eligibleTrainees.includes(interaction.user.id)) {
      question = recalc;
    } else {
      await interaction.reply({ content: '❌ You are not assigned as a trainee for this question.', ephemeral: true });
      return;
    }
  }

  if (question.answeredTrainees.includes(interaction.user.id)) {
    await interaction.reply({ content: '❌ You have already submitted an answer for this question.', ephemeral: true });
    return;
  }

  const answerText = interaction.fields.getTextInputValue('quest_answer_text').trim();

  try {
    await QuestAnswer.create({
      guildId: interaction.guild.id,
      questionId,
      traineeId: interaction.user.id,
      answerText,
    });
  } catch (err) {
    if (err.code === 11000) {
      await interaction.reply({ content: '❌ You have already submitted an answer for this question.', ephemeral: true });
      return;
    }
    console.error('[QUEST] Failed to save answer:', err.message);
    await interaction.reply({ content: '❌ Database error. Failed to save your answer.', ephemeral: true });
    return;
  }

  try {
    await QuestQuestion.findByIdAndUpdate(questionId, {
      $addToSet: { answeredTrainees: interaction.user.id },
    });
  } catch (err) {
    console.error('[QUEST] Failed to update answeredTrainees:', err.message);
  }

  await interaction.reply({ content: '✅ Your answer has been submitted.', ephemeral: true });

  await checkAllAnswered(interaction.client, interaction.guild.id, questionId);
}

async function checkAllAnswered(client, guildId, questionId) {
  let question;
  try {
    question = await QuestQuestion.findById(questionId).lean();
  } catch {
    return;
  }

  if (!question || question.status !== 'active') return;

  const recalc = await recalcEligibleTrainees(client, guildId, questionId);
  if (recalc) {
    question = recalc;
  }

  if (question.answeredTrainees.length >= question.eligibleTrainees.length) {
    await endQuestion(client, guildId, questionId, 'auto', null);
  }
}

export async function endQuestion(client, guildId, questionId, reason, endedBy) {
  let question;
  try {
    question = await QuestQuestion.findById(questionId).lean();
  } catch {
    return false;
  }

  if (!question || question.status !== 'active') return false;

  const recalc = await recalcEligibleTrainees(client, guildId, questionId);
  if (recalc) {
    question = recalc;
  }

  try {
    await QuestQuestion.findByIdAndUpdate(questionId, {
      status: reason === 'auto' ? 'completed' : 'ended',
      endedBy,
      endedReason: reason,
      endedAt: new Date(),
    });
  } catch (err) {
    console.error('[QUEST] Failed to update question status:', err.message);
    return false;
  }

  let answers;
  try {
    answers = await QuestAnswer.find({ questionId }).lean();
  } catch {
    answers = [];
  }

  const embed = buildResultsEmbed(question, answers, reason, endedBy, client);

  let channel = null;
  try {
    if (question.channelId) {
      channel = await client.channels.fetch(question.channelId);
    }
  } catch {
    // channel may be gone
  }

  if (channel) {
    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[QUEST] Failed to send results:', err.message);
    }
  }

  try {
    if (question.messageId && channel) {
      const msg = await channel.messages.fetch(question.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ components: [] });
      }
    }
  } catch {
    // message may be gone
  }

  return true;
}

function resolveUsername(userId, client) {
  let user = null;
  try {
    user = client.users.cache.get(userId);
  } catch {
    // ignore
  }
  if (!user) {
    return `<@${userId}>`;
  }
  return `@${user.username}`;
}

function buildResultsEmbed(question, answers, reason, endedBy, client) {
  const answerMap = new Map();
  for (const a of answers) {
    answerMap.set(a.traineeId, a.answerText);
  }

  const isAuto = reason === 'auto';
  const title = isAuto ? 'Question — All Answers Submitted' : 'Question Ended';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(isAuto ? 0x2ECC71 : 0xE67E22)
    .addFields({ name: 'Question', value: question.questionText.slice(0, 1024), inline: false });

  const answeredLines = [];
  for (const traineeId of question.answeredTrainees) {
    const answer = answerMap.get(traineeId);
    const username = resolveUsername(traineeId, client);
    answeredLines.push(`**${username}**\n${(answer || '(no answer)').slice(0, 1024)}`);
  }

  if (answeredLines.length > 0) {
    const fieldText = answeredLines.join('\n\n');
    embed.addFields({ name: 'Answers', value: fieldText.slice(0, 1024), inline: false });
  } else {
    embed.addFields({ name: 'Answers', value: 'No answers were submitted.', inline: false });
  }

  const noAnswerTrainees = question.eligibleTrainees.filter(
    (id) => !question.answeredTrainees.includes(id),
  );

  if (noAnswerTrainees.length > 0) {
    const noAnswerLines = noAnswerTrainees.map((id) => {
      const username = resolveUsername(id, client);
      return `${username}`;
    });
    embed.addFields({ name: 'Did Not Answer', value: noAnswerLines.join('\n').slice(0, 1024), inline: false });
  }

  if (!isAuto && endedBy) {
    const enderUsername = resolveUsername(endedBy, client);
    embed.addFields({ name: 'Status', value: `Manually ended by ${enderUsername}`, inline: false });
  } else if (isAuto) {
    embed.addFields({ name: 'Status', value: 'All trainees answered — automatically completed.', inline: false });
  }

  return embed;
}

export async function restoreActiveQuestion(client, guildId) {
  let question;
  try {
    question = await QuestQuestion.findOne({ guildId, status: 'active' }).lean();
  } catch (err) {
    console.error('[QUEST] Failed to fetch active question for restore:', err.message);
    return;
  }

  if (!question) return;

  let channel = null;
  try {
    if (question.channelId) {
      channel = await client.channels.fetch(question.channelId);
    }
  } catch {
    // channel may be gone
  }

  if (!channel) return;

  try {
    if (question.messageId) {
      const msg = await channel.messages.fetch(question.messageId).catch(() => null);
      if (msg) {
        const embed = buildQuestionEmbed(
          question.questionText,
          question.eligibleTrainees.length,
          question.answeredTrainees.length,
        );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`quest_answer:${question._id}`)
            .setLabel('Answer')
            .setStyle(ButtonStyle.Primary),
        );
        await msg.edit({ embeds: [embed], components: [row] });
      }
    }
  } catch (err) {
    console.error('[QUEST] Failed to restore question message:', err.message);
  }

  console.log(`[QUEST] Restored active question ${question._id} for guild ${guildId}`);
}
