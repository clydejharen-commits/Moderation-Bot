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
      .map((a) => `**<@${a.userId}> (${a.username}):**\n${a.answer}`)
      .join('\n\n');
    embed.addFields({ name: `\u{1F4DD} Submitted Answers (${answers.length})`, value: answerList.slice(0, 1024) });
  } else {
    embed.addFields({ name: '\u{1F4DD} Submitted Answers', value: 'No answers were submitted.' });
  }

  if (missingIds.length > 0) {
    const missingList = missingIds.map((id) => `<@${id}>`).join(', ');
    embed.addFields({ name: `\u274C Did Not Answer (${missingIds.length})`, value: missingList.slice(0, 1024) });
  } else if (answers.length > 0) {
    embed.addFields({ name: '\u2705 Did Not Answer', value: 'All eligible trainees answered!' });
  }

  return embed;
}

export async function handleQuestionButton(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  let activeQuestion;
  try {
    activeQuestion = await ActiveQuestion.findOne({
      guildId: guild.id,
      completed: false,
    }).lean();
  } catch (err) {
    console.error('[QUESTION PANEL] Failed to fetch active question:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!activeQuestion) {
    await interaction.reply({ content: '\u274C There is no active question right now.', ephemeral: true });
    return;
  }

  const eligibleIds = activeQuestion.eligibleTraineeIds || [];
  if (!eligibleIds.includes(member.id)) {
    await interaction.reply({ content: '\u274C You are not assigned as a trainee for this question.', ephemeral: true });
    return;
  }

  const hasAnswered = (activeQuestion.answers || []).some((a) => a.userId === member.id);
  if (hasAnswered) {
    await interaction.reply({ content: '\u274C You have already answered this question.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(ANSWER_MODAL_ID)
    .setTitle('Answer the Question');

  const answerInput = new TextInputBuilder()
    .setCustomId(ANSWER_FIELD_ID)
    .setLabel('Your Answer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setPlaceholder('Type your answer here...');

  modal.addComponents(new ActionRowBuilder().addComponents(answerInput));

  try {
    await interaction.showModal(modal);
  } catch (err) {
    console.error('[QUESTION PANEL] Failed to show answer modal:', err.message);
    await interaction.reply({ content: '\u274C Failed to open the answer form. Please try again.', ephemeral: true }).catch(() => {});
  }
}

export async function handleQuestionModal(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  const answerText = interaction.fields.getTextInputValue(ANSWER_FIELD_ID).trim();
  if (!answerText) {
    await interaction.reply({ content: '\u274C Your answer cannot be empty.', ephemeral: true });
    return;
  }

  let activeQuestion;
  try {
    activeQuestion = await ActiveQuestion.findOne({
      guildId: guild.id,
      completed: false,
    });
  } catch (err) {
    console.error('[QUESTION PANEL] Failed to fetch active question for modal:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!activeQuestion) {
    await interaction.reply({ content: '\u274C There is no active question right now.', ephemeral: true });
    return;
  }

  const eligibleIds = activeQuestion.eligibleTraineeIds || [];
  if (!eligibleIds.includes(member.id)) {
    await interaction.reply({ content: '\u274C You are not assigned as a trainee for this question.', ephemeral: true });
    return;
  }

  const hasAnswered = (activeQuestion.answers || []).some((a) => a.userId === member.id);
  if (hasAnswered) {
    await interaction.reply({ content: '\u274C You have already answered this question.', ephemeral: true });
    return;
  }

  activeQuestion.answers.push({
    userId: member.id,
    username: member.user.username,
    answer: answerText,
    answeredAt: new Date(),
  });

  const allAnswered = activeQuestion.eligibleTraineeIds.every(
    (id) => activeQuestion.answers.some((a) => a.userId === id),
  );

  if (allAnswered) {
    activeQuestion.completed = true;
  }

  try {
    await activeQuestion.save();
  } catch (err) {
    console.error('[QUESTION PANEL] Failed to save answer:', err.message);
    await interaction.reply({ content: '\u274C Failed to submit your answer. Please try again later.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '\u2705 Your answer has been submitted.', ephemeral: true });

  if (allAnswered) {
    await endQuestionInChannel(interaction, activeQuestion);
  } else {
    try {
      const embed = buildQuestionEmbed(activeQuestion.toObject());
      const buttons = buildQuestionButtons();
      if (interaction.message) {
        await interaction.message.edit({ embeds: [embed], components: buttons });
      }
    } catch (err) {
      console.error('[QUESTION PANEL] Failed to update question message:', err.message);
    }
  }
}

export async function endQuestionInChannel(interaction, question) {
  const embed = buildResultsEmbed(question.toObject ? question.toObject() : question);

  try {
    if (interaction.message) {
      await interaction.message.edit({ embeds: [embed], components: [] });
    } else {
      await interaction.channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[QUESTION PANEL] Failed to post question results:', err.message);
    try {
      await interaction.channel.send({ embeds: [embed] });
    } catch {
      // channel may be unavailable
    }
  }
}

export async function endQuestionFromCommand(interaction) {
  const guild = interaction.guild;

  let activeQuestion;
  try {
    activeQuestion = await ActiveQuestion.findOne({
      guildId: guild.id,
      completed: false,
    });
  } catch (err) {
    console.error('[QUESTION END] Failed to fetch active question:', err.message);
    return null;
  }

  if (!activeQuestion) {
    return null;
  }

  activeQuestion.completed = true;
  try {
    await activeQuestion.save();
  } catch (err) {
    console.error('[QUESTION END] Failed to mark question as completed:', err.message);
    return null;
  }

  return activeQuestion.toObject();
}

export { ANSWER_BUTTON_ID, ANSWER_MODAL_ID, ANSWER_FIELD_ID };
