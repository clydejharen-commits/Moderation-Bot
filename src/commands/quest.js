import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { QuestQuestion } from '../db/models/QuestQuestion.js';
import {
  registerQuestSetup,
  buildMainPanelForCommand,
} from '../components/quest-setup.js';
import {
  isTrainerOrAdmin,
  getActiveQuestion,
  endQuestion,
} from '../components/quest-question.js';

export const data = new SlashCommandBuilder()
  .setName('quest')
  .setDescription('Quest system for staff training.')
  .addSubcommand((sub) =>
    sub.setName('set').setDescription('Open the Quest configuration dashboard. Administrator only.'),
  )
  .addSubcommand((sub) =>
    sub.setName('end').setDescription('End the currently active question.'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  switch (subcommand) {
    case 'set':
      await handleSet(interaction);
      break;
    case 'end':
      await handleEnd(interaction);
      break;
  }
}

async function handleSet(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need **Administrator** permission to use this command.', ephemeral: true });
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
    try {
      config = await QuestConfig.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {},
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    } catch {
      await interaction.reply({ content: '❌ Database error.', ephemeral: true });
      return;
    }
  }

  registerQuestSetup(interaction.user.id, interaction.channelId, interaction.guild.id);

  const panelData = buildMainPanelForCommand(config);
  await interaction.reply({ ...panelData, ephemeral: true });
}

async function handleEnd(interaction) {
  let config;
  try {
    config = await QuestConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const isTrainer = await isTrainerOrAdmin(interaction.member, config);
  if (!isTrainer) {
    await interaction.reply({ content: '❌ Only configured Trainers or Administrators can end questions.', ephemeral: true });
    return;
  }

  let activeQuestion;
  try {
    activeQuestion = await getActiveQuestion(interaction.guild.id);
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!activeQuestion) {
    await interaction.reply({ content: '❌ There is no ongoing question.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const success = await endQuestion(interaction.client, interaction.guild.id, activeQuestion._id, 'manual', interaction.user.id);

  if (success) {
    await interaction.editReply({ content: '✅ Question ended. Answers have been revealed.' });
  } else {
    await interaction.editReply({ content: '❌ Failed to end the question.' });
  }
}
