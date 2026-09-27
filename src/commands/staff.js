import { SlashCommandBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffPoints } from '../db/models/StaffPoints.js';
import {
  buildLeaderboardEmbed,
  saveLeaderboardMessageId,
  isLeaderboardMessageDeleted,
} from '../utils/leaderboardHelpers.js';

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

  switch (subcommand) {
    case 'leaderboard':
      await handleLeaderboard(interaction);
      break;
  }
}

async function handleLeaderboard(interaction) {
  const guildId = interaction.guild.id;
  const client = interaction.client;

  const deleted = await isLeaderboardMessageDeleted(client, guildId);

  if (!deleted) {
    await interaction.reply({ content: '✅ The leaderboard is already active and up to date.', ephemeral: true });
    return;
  }

  const embed = await buildLeaderboardEmbed(client, guildId);

  if (!embed) {
    await interaction.reply({ content: '❌ Database error. Failed to build the leaderboard.', ephemeral: true });
    return;
  }

  let sentMessage;
  try {
    sentMessage = await interaction.channel.send({ embeds: [embed] });
  } catch {
    await interaction.reply({ content: '❌ Failed to send the leaderboard message. Check my permissions.', ephemeral: true });
    return;
  }

  await saveLeaderboardMessageId(guildId, interaction.channelId, sentMessage.id);

  await interaction.reply({ content: '✅ Staff leaderboard created.', ephemeral: true });
}
