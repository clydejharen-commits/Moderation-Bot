import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { buildMainEmbed, buildMainButtons } from '../components/quest-panel.js';
import { getQuestConfig, isTrainerOrAdmin } from '../utils/questHelpers.js';
import { endQuestionFromCommand, buildResultsEmbed } from '../components/question-panel.js';

export const data = new SlashCommandBuilder()
  .setName('quest')
  .setDescription('Quest System configuration and management.')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Open the Quest System configuration panel (Administrator only).'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('end')
      .setDescription('End the current active question and display all answers.'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    await handleSet(interaction);
    return;
  }

  if (subcommand === 'end') {
    await handleEnd(interaction);
    return;
  }
}

async function handleSet(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  let cfg;
  try {
    cfg = await QuestConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (err) {
    console.error('[QUEST SET] Failed to load quest config:', err);
    await interaction.reply({ content: '\u274C Failed to load the Quest configuration. Please try again later.', ephemeral: true });
    return;
  }

  const embed = buildMainEmbed(cfg);
  const buttons = buildMainButtons();

  try {
    await interaction.reply({ embeds: [embed], components: buttons, ephemeral: true });
  } catch (err) {
    console.error('[QUEST SET] Failed to send panel:', err);
    await interaction.reply({ content: '\u274C Failed to open the Quest configuration panel. Please try again later.', ephemeral: true }).catch(() => {});
  }
}

async function handleEnd(interaction) {
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

  const endedQuestion = await endQuestionFromCommand(interaction);

  if (!endedQuestion) {
    await interaction.reply({ content: '\u274C There is no ongoing question.', ephemeral: true });
    return;
  }

  const embed = buildResultsEmbed(endedQuestion);

  try {
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[QUEST END] Failed to send results:', err.message);
    await interaction.reply({ content: '\u274C Failed to display question results. Please try again later.', ephemeral: true }).catch(() => {});
  }
}
