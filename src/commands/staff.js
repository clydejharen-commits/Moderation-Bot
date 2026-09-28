import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { StaffMember } from '../db/models/StaffMember.js';
import { getQuestConfig, recalculateStaffMember, statusLabel } from '../utils/questHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Staff management commands.')
  .addSubcommand((sub) =>
    sub
      .setName('leaderboard')
      .setDescription('Display the staff leaderboard sorted by total points (highest first).'),
  );

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'leaderboard') return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const cfg = await getQuestConfig(interaction.guild.id);
  if (!cfg) {
    await interaction.reply({ content: '\u274C Failed to load the Quest configuration. Please try again later.', ephemeral: true });
    return;
  }

  let staffMembers;
  try {
    staffMembers = await StaffMember.find({ guildId: interaction.guild.id })
      .sort({ totalPoints: -1 })
      .lean();
  } catch (err) {
    console.error('[STAFF LEADERBOARD] Failed to fetch staff members:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!staffMembers || staffMembers.length === 0) {
    await interaction.reply({ content: '\u274C No staff data found. Use `/add points` or `/take points` to start tracking.', ephemeral: true });
    return;
  }

  const recalculated = [];
  for (const sm of staffMembers) {
    const r = await recalculateStaffMember(
      interaction.guild.id,
      sm.userId,
      sm.username || 'Unknown',
      cfg,
    );
    if (r) recalculated.push(r);
  }

  recalculated.sort((a, b) => b.totalPoints - a.totalPoints);

  const lines = recalculated.map((sm, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '\u{1F947} ' : rank === 2 ? '\u{1F948} ' : rank === 3 ? '\u{1F949} ' : '';
    return `${medal}${rank}. <@${sm.userId}> \u2014 ${sm.totalPoints} points \u2014 ${sm.promoteCoins} Promote Coins \u2014 ${statusLabel(sm.status)}`;
  });

  const description = lines.join('\n');

  const embed = new EmbedBuilder()
    .setTitle('\u{1F3C6} Staff Leaderboard')
    .setColor(0x2B6CB0)
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: `Total staff: ${recalculated.length}` })
    .setTimestamp();

  try {
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[STAFF LEADERBOARD] Failed to send leaderboard:', err.message);
    await interaction.reply({ content: '\u274C Failed to display the leaderboard. Please try again later.', ephemeral: true }).catch(() => {});
  }
}
