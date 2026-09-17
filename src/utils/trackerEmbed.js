import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const DARK_GREEN = 0x1a8e3e;

/**
 * Format a relative-time string for "Last Checked".
 * @param {Date|null} date
 * @returns {string}
 */
function formatLastChecked(date) {
  if (!date) return 'never';
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Format a growth delta with a + sign for positive values.
 * @param {number} n
 * @returns {string}
 */
function formatGrowth(n) {
  if (n > 0) return `+${n.toLocaleString()}`;
  return `${n.toLocaleString()}`;
}

/**
 * Build the tracker embed from a RobloxTracker document.
 * @param {object} tracker
 * @param {boolean} completed
 * @param {{perMinute: number, perHour: number, perDay: number}|null} [growthStats]
 * @returns {import('discord.js').EmbedBuilder}
 */
export function buildTrackerEmbed(tracker, completed = false, growthStats = null) {
  const remaining = Math.max(0, tracker.targetMilestone - tracker.currentFollowers);
  const profileLink = `https://www.roblox.com/users/${tracker.robloxUserId}/profile`;

  const status = completed
    ? '\u2705 Milestone Reached'
    : '\uD83D\uDDE2\uFE0F Status: Tracking';

  let description =
    `\uD83D\uDC64 **Username:** ${tracker.robloxUsername}\n` +
    `\uD83D\uDC65 **Followers:** ${tracker.currentFollowers.toLocaleString()}\n` +
    `\uD83C\uDFAF **Target:** ${tracker.targetMilestone.toLocaleString()}\n` +
    `\uD83D\uDCC8 **Remaining:** ${remaining.toLocaleString()}\n` +
    `\uD83D\uDFE2 ${status}\n` +
    `\uD83D\uDD50 **Last Checked:** ${formatLastChecked(tracker.lastCheckedAt)}`;

  if (growthStats) {
    description +=
      `\n\n\uD83D\uDCC8 **Follower Growth**\n` +
      `\u00B7 Per Minute: ${formatGrowth(growthStats.perMinute)}\n` +
      `\u00B7 Per Hour: ${formatGrowth(growthStats.perHour)}\n` +
      `\u00B7 Per Day: ${formatGrowth(growthStats.perDay)}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('Roblox Follower Tracker')
    .setDescription(description)
    .setColor(DARK_GREEN)
    .setURL(profileLink);

  return embed;
}

/**
 * Build the action row with the Roblox Profile button.
 * @param {string} robloxUserId
 * @returns {import('discord.js').ActionRowBuilder}
 */
export function buildTrackerComponents(robloxUserId) {
  const profileLink = `https://www.roblox.com/users/${robloxUserId}/profile`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('\uD83D\uDD17 Roblox Profile')
      .setStyle(ButtonStyle.Link)
      .setURL(profileLink),
  );
}
