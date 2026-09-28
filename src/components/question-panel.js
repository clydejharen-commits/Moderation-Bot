import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ActiveQuestion } from '../db/models/ActiveQuestion.js';
import { resolveTraineeUserIds, getQuestConfig } from '../utils/questHelpers.js';

const PREFIX = 'question';
const ANSWER_BUTTON_ID = `${PREFIX}:btn:answer`;
const ANSWER_MODAL_ID = `${PREFIX}:modal:answer`;
const ANSWER_FIELD_ID = `${PREFIX}:mf:answer`;

export function isQuestionButton(customId) {
  return customId === ANSWER_BUTTON_ID;
}

export function isQuestionModal(customId) {
  return customId === ANSWER_MODAL_ID;
}

export function buildQuestionEmbed(question) {
  const answeredCount = question.answers?.length || 0;
  const totalEligible = question.eligibleTraineeIds?.length || 0;

  return new EmbedBuilder()
    .setTitle('\u{2753} Active Question')
    .setColor(0x2B6CB0)
    .setDescription(`**${question.text}**`)
    .addFields(
      { name: '\u{1F465} Eligible Trainees', value: String(totalEligible), inline: true },
      { name: '\u2705 Answers Submitted', value: String(answeredCount), inline: true },
      { name: '\u{1F464} Asked by', value: `<@${question.creatorId}>`, inline: true },
    )
    .setTimestamp(question.createdAt || new Date());
}

export function buildQuestionButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ANSWER_BUTTON_ID)
        .setLabel('Answer')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

export function buildResultsEmbed(question) {
  const answers = question.answers || [];
  const eligibleIds = question.eligibleTraineeIds || [];
  const answeredIds = new Set(answers.map((a) => a.userId));
  const missingIds = eligibleIds.filter((id) => !answeredIds.has(id));

  const embed = new EmbedBuilder()
    .setTitle('\u{1F4CB} Question Results')
    .setColor(0x2B6CB0)
    .setDescription(`**${question.text}**`)
    .setTimestamp();

  if (answers.length > 0) {
    const answerList = answers
      .map((a, i) => `**${i + 1}.** <@${a.userId}>: ${a.text}`)
      .join('\n');
    embed.addFields({ name: '\u{1F4DD} Answers', value: answerList.slice(0, 1024) });
  } else {
    embed.addFields({ name: '\u{1F4DD} Answers', value: 'No answers submitted.' });
  }

  if (missingIds.length > 0) {
    const missingList = missingIds.map((id) => `<@${id}>`).join(', ');
    embed.addFields({ name: '\u{274C} Missing', value: missingList.slice(0, 1024) });
  }

  return embed;
}

export async function handleQuestionButton(interaction) {
  if (interaction.customId !== ANSWER_BUTTON_ID) return;

  const modal = new ModalBuilder()
    .setCustomId(ANSWER_MODAL_ID)
    .setTitle('Answer Question');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(ANSWER_FIELD_ID)
        .setLabel('Your Answer')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000),
    ),
  );

  try {
    await interaction.showModal(modal);
  } catch (err) {
    console.error('[QUESTION] Failed to show answer modal:', err.message);
  }
}

export async function handleQuestionModal(interaction) {
  const answerText = interaction.fields.getTextInputValue(ANSWER_FIELD_ID).trim();

  let question;
  try {
    question = await ActiveQuestion.findOne({
      guildId: interaction.guild.id,
      completed: false,
    });
  } catch (err) {
    console.error('[QUESTION] Failed to fetch active question:', err.message);
    await interaction.reply({ content: '\u274C Failed to fetch the active question. Please try again later.', ephemeral: true });
    return;
  }

  if (!question) {
    await interaction.reply({ content: '\u274C No active question found.', ephemeral: true });
    return;
  }

  const cfg = await getQuestConfig(interaction.guild.id);
  if (!cfg) {
    await interaction.reply({ content: '\u274C Failed to load Quest configuration.', ephemeral: true });
    return;
  }

  const eligibleIds = await resolveTraineeUserIds(interaction.guild, cfg);
  if (!eligibleIds.includes(interaction.user.id)) {
    await interaction.reply({ content: '\u274C Only trainees can answer this question.', ephemeral: true });
    return;
  }

  const existingAnswer = question.answers?.find((a) => a.userId === interaction.user.id);
  if (existingAnswer) {
    existingAnswer.text = answerText;
  } else {
    if (!question.answers) question.answers = [];
    question.answers.push({ userId: interaction.user.id, text: answerText });
  }

  try {
    await question.save();
  } catch (err) {
    console.error('[QUESTION] Failed to save answer:', err.message);
    await interaction.reply({ content: '\u274C Failed to save your answer. Please try again later.', ephemeral: true });
    return;
  }

  try {
    const channel = await interaction.guild.channels.fetch(question.channelId).catch(() => null);
    if (channel) {
      const embed = buildQuestionEmbed(question);
      const buttons = buildQuestionButtons();
      const msg = await channel.messages.fetch(question.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: buttons });
      }
    }
  } catch (err) {
    console.error('[QUESTION] Failed to update question message:', err.message);
  }

  await interaction.reply({ content: '\u2705 Your answer has been recorded.', ephemeral: true });
}
