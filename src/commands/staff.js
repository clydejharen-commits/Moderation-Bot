import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffPoints } from '../db/models/StaffPoints.js';

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
  let config;
  try {
    config = await QuestConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const promotionPercent = config?.promotionPercent ?? 80;
  const demotionPercent = config?.demotionPercent ?? 40;

  let pointsDocs;
  try {
    pointsDocs = await StaffPoints.find({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (pointsDocs.length === 0) {
    await interaction.reply({ content: '❌ No staff points found.', ephemeral: true });
    return;
  }

  const entries = pointsDocs
    .map((doc) => ({
      userId: doc.userId,
      points: doc.points,
      percent: Math.min(doc.points, 100),
    }))
    .sort((a, b) => b.points - a.points);

  const lines = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rank = i + 1;
    let username = entry.userId;
    try {
      const user = await interaction.client.users.fetch(entry.userId);
      username = user.username;
    } catch {
      // fallback to id
    }

    let status = 'Normal';
    if (entry.percent >= promotionPercent) {
      status = 'Promotion';
    } else if (entry.percent < demotionPercent) {
      status = 'Demotion';
    }

    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    lines.push(`${medal} ${username} — ${entry.points} points — ${entry.percent}% — ${status}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Staff Leaderboard')
    .setColor(0xF1C40F)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Promotion: ${promotionPercent}% | Demotion: ${demotionPercent}%` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
