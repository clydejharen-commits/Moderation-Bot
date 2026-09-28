import { SlashCommandBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { buildLeaderboardEmbed } from '../utils/leaderboardHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Staff commands.')
  .addSubcommand((sub) =>
    sub.setName('leaderboard').setDescription('View the staff points leaderboard.'),
  );

export async function execute(interaction) {
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'leaderboard') {
    const embed = await buildLeaderboardEmbed(interaction.client, interaction.guild.id);
    if (!embed) {
      await interaction.reply({ content: '❌ Database error. Failed to build the leaderboard.', ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [embed] });
  }
}
