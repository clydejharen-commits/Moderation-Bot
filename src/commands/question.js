import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { ActiveQuestion } from '../db/models/ActiveQuestion.js';
import { getQuestConfig, isTrainerOrAdmin, resolveTraineeUserIds } from '../utils/questHelpers.js';
import { buildQuestionEmbed, buildQuestionButtons } from '../components/question-panel.js';
import { randomUUID } from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('question')
  .setDescription('Create a new active question for trainees to answer.')
  .addStringOption((opt) =>
    opt
      .setName('question')
      .setDescription('The question text to ask trainees.')
      .setRequired(true)
      .setMaxLength(2000),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const cfg = await getQuestConfig(interaction.guild.id);
  if (!cfg) {
    await interaction.reply({ content: '\u274C Failed to load the Quest configuration. Please try again later.', ephemeral: true });
    return;
  }

  if (!isTrainerOrAdmin(interaction.member, cfg)) {
    await interaction.reply({ content: '\u274C Only **Administrators** and configured **Trainers** can use this command.', ephemeral: true });
    return;
  }

  let existing;
  try {
    existing = await ActiveQuestion.findOne({
      guildId: interaction.guild.id,
      completed: false,
    }).lean();
  } catch (err) {
    console.error('[QUESTION] Failed to check for active question:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existing) {
    await interaction.reply({ content: '\u274C A question is already ongoing. End the current question before creating a new one.', ephemeral: true });
    return;
  }

  const questionText = interaction.options.getString('question', true);

  const eligibleTraineeIds = await resolveTraineeUserIds(interaction.guild, cfg);
  if (eligibleTraineeIds.length === 0) {
    await interaction.reply({ content: '\u274C No eligible trainees are configured. Use `/quest set` to add trainees first.', ephemeral: true });
    return;
  }

  const questionId = randomUUID();

  try {
    await ActiveQuestion.create({
      questionId,
      guildId: interaction.guild.id,
      text: questionText,
      creatorId: interaction.user.id,
      creatorUsername: interaction.user.username,
      eligibleTraineeIds,
      answers: [],
      completed: false,
    });
  } catch (err) {
    console.error('[QUESTION] Failed to save active question:', err.message);
    await interaction.reply({ content: '\u274C Failed to create the question. Please try again later.', ephemeral: true });
    return;
  }

  const question = {
    questionId,
    guildId: interaction.guild.id,
    text: questionText,
    creatorId: interaction.user.id,
    creatorUsername: interaction.user.username,
    createdAt: new Date(),
    eligibleTraineeIds,
    answers: [],
    completed: false,
  };

  const embed = buildQuestionEmbed(question);
  const buttons = buildQuestionButtons();

  try {
    await interaction.reply({ embeds: [embed], components: buttons });
  } catch (err) {
    console.error('[QUESTION] Failed to send question message:', err.message);
    await interaction.reply({ content: '\u274C Failed to display the question. Please try again later.', ephemeral: true }).catch(() => {});
    return;
  }

  try {
    const reply = await interaction.fetchReply();
    if (reply && reply.id) {
      await ActiveQuestion.updateOne(
        { questionId },
        { channelId: interaction.channelId, messageId: reply.id },
      );
    }
  } catch (err) {
    console.error('[QUESTION] Failed to store message reference:', err.message);
  }
}
