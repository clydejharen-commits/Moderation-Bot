import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import {
  isTrainerOrAdmin,
  hasActiveQuestion,
  startQuestion,
} from '../components/quest-question.js';

export const data = new SlashCommandBuilder()
  .setName('question')
  .setDescription('Create a new quest question for trainees to answer.')
  .addStringOption((opt) =>
    opt.setName('question').setDescription('The question text.').setRequired(true).setMaxLength(2000),
  );

export async function execute(interaction) {
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  let config;
  try {
    config = await QuestConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!config) {
    await interaction.reply({ content: '❌ Quest has not been configured. An administrator needs to run `/quest set` first.', ephemeral: true });
    return;
  }

  const isTrainer = await isTrainerOrAdmin(interaction.member, config);
  if (!isTrainer) {
    await interaction.reply({ content: '❌ Only configured Trainers or Administrators can create questions.', ephemeral: true });
    return;
  }

  if (await hasActiveQuestion(interaction.guild.id)) {
    await interaction.reply({
      content: '❌ A question is already ongoing. End the current question before creating a new one.',
      ephemeral: true,
    });
    return;
  }

  const questionText = interaction.options.getString('question');

  await startQuestion(interaction, config, questionText);
}
