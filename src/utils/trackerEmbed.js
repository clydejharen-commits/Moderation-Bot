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
 * Build the tracker embed from a RobloxTracker document.
 * @param {object} tracker
 * @param {boolean} completed
 * @returns {import('discord.js').EmbedBuilder}
 */
export function buildTrackerEmbed(tracker, completed = false) {
  const remaining = Math.max(0, tracker.targetMilestone - tracker.currentFollowers);
  const profileLink = `https://www.roblox.com/users/${tracker.robloxUserId}/profile`;

  const status = completed
    ? '\u2705 Milestone Reached'
    : '\uD83D\uDDE2\uFE0F Status: Tracking';

  const description =
    `\uD83D\uDC64 **Username:** ${tracker.robloxUsername}\n` +
    `\uD83D\uDC65 **Followers:** ${tracker.currentFollowers.toLocaleString()}\n` +
    `\uD83C\uDFAF **Target:** ${tracker.targetMilestone.toLocaleString()}\n` +
    `\uD83D\uDCC8 **Remaining:** ${remaining.toLocaleString()}\n` +
    `\uD83D\uDFE2 ${status}\n` +
    `\uD83D\uDD50 **Last Checked:** ${formatLastChecked(tracker.lastCheckedAt)}`;

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
