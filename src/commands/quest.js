import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { buildMainEmbed, buildMainButtons } from '../components/quest-panel.js';

export const data = new SlashCommandBuilder()
  .setName('quest')
  .setDescription('Quest System configuration.')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Open the Quest System configuration panel (Administrator only).'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommand() !== 'set') return;

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
    await interaction.reply({ content: '\u274C Failed to open the Quest configuration panel. Please try again.', ephemeral: true }).catch(() => {});
  }
}
