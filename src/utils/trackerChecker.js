import { RobloxTracker } from '../db/models/RobloxTracker.js';
import { isDatabaseConnected } from '../db/database.js';
import { getFollowerCount } from './robloxApi.js';
import { buildTrackerEmbed, buildTrackerComponents } from './trackerEmbed.js';
import { recordGrowthSample, getGrowthStats, deleteGrowthHistory } from './growthStats.js';

const CHECK_INTERVAL_MS = 60_000; // 1 minute
let checkTimer = null;
let isChecking = false;

/**
 * Try to edit the tracker embed in the configured channel.
 * If the message was deleted, silently skip — do NOT create a new message.
 * @param {import('discord.js').Client} client
 * @param {import('mongoose').Document} tracker
 * @param {boolean} completed
 * @param {{perMinute: number, perHour: number, perDay: number}|null} [growthStats]
 */
async function updateTrackerEmbed(client, tracker, completed = false, growthStats = null) {
  if (!tracker.channelId || !tracker.messageId) return;

  const guild = client.guilds.cache.get(tracker.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(tracker.channelId);
  if (!channel) return;

  let message;
  try {
    message = await channel.messages.fetch(tracker.messageId).catch(() => null);
  } catch {
    message = null;
  }

  if (!message) return;

  const embed = buildTrackerEmbed(tracker, completed, growthStats);
  const components = buildTrackerComponents(tracker.robloxUserId);

  try {
    await message.edit({ embeds: [embed], components: [components] });
  } catch (err) {
    console.error(`[TRACKER CHECKER] Failed to edit embed for ${tracker.robloxUsername}:`, err.name);
  }
}

/**
 * Send the milestone notification to the configured channel and mark the
 * tracker as completed. If the channel or role is missing, the tracker is
 * still marked complete so we never check it again.
 * @param {import('discord.js').Client} client
 * @param {import('mongoose').Document} tracker
 */
async function completeTracker(client, tracker) {
  const guild = client.guilds.cache.get(tracker.guildId);
  if (!guild) {
    console.warn(`[TRACKER CHECKER] Guild ${tracker.guildId} not found for tracker ${tracker._id}.`);
    tracker.active = false;
    tracker.completedAt = new Date();
    await tracker.save().catch((err) => console.error('[TRACKER CHECKER] Failed to save tracker (guild missing):', err.name));
    await deleteGrowthHistory(tracker);
    return;
  }

  const channel = guild.channels.cache.get(tracker.channelId);
  if (!channel) {
    console.warn(`[TRACKER CHECKER] Channel ${tracker.channelId} not found for tracker ${tracker._id}.`);
    tracker.active = false;
    tracker.completedAt = new Date();
    await tracker.save().catch((err) => console.error('[TRACKER CHECKER] Failed to save tracker (channel missing):', err.name));
    await deleteGrowthHistory(tracker);
    return;
  }

  // Update the tracker embed one final time with milestone-reached status
  const finalGrowthStats = await getGrowthStats(tracker);
  await updateTrackerEmbed(client, tracker, true, finalGrowthStats);

  const profileLink = `https://www.roblox.com/users/${tracker.robloxUserId}/profile`;
  const content =
    `\uD83C\uDF89 <@&${tracker.discordRoleId}>\n` +
    `**${tracker.robloxUsername}** has reached **${tracker.currentFollowers.toLocaleString()} followers** on Roblox!\n` +
    `\uD83D\uDD17 Profile: ${profileLink}`;

  try {
    await channel.send({
      content,
      allowedMentions: { roles: [tracker.discordRoleId], parse: [] },
    });
  } catch (err) {
    console.error('[TRACKER CHECKER] Failed to send notification:', err.name);
  }

  tracker.active = false;
  tracker.completedAt = new Date();
  await tracker.save().catch((err) => console.error('[TRACKER CHECKER] Failed to save tracker (after notification):', err.name));

  // Clean up growth history — tracker is finished
  await deleteGrowthHistory(tracker);
}

/**
 * Run a single check cycle across all active trackers.
 * Prevents overlapping cycles via the isChecking flag.
 * @param {import('discord.js').Client} client
 */
async function runCheckCycle(client) {
  if (isChecking) return;
  if (!isDatabaseConnected()) return;

  isChecking = true;
  try {
    let trackers;
    try {
      trackers = await RobloxTracker.find({ active: true, isConfig: { $ne: true } }).lean(false);
    } catch (err) {
      console.error('[TRACKER CHECKER] MongoDB query failed:', err.name);
      return;
    }

    for (const tracker of trackers) {
      let followerCount;
      try {
        followerCount = await getFollowerCount(tracker.robloxUserId);
      } catch (err) {
        // Temporary API error — skip this tracker and retry next cycle
        console.error(`[TRACKER CHECKER] Failed to get followers for ${tracker.robloxUsername}:`, err.message);
        continue;
      }

      tracker.currentFollowers = followerCount;
      tracker.lastCheckedAt = new Date();

      if (followerCount >= tracker.targetMilestone) {
        await completeTracker(client, tracker);
      } else {
        await tracker.save().catch((err) =>
          console.error(`[TRACKER CHECKER] Failed to save tracker ${tracker._id}:`, err.name),
        );
        // Record growth sample and fetch growth stats for the embed
        await recordGrowthSample(tracker, followerCount, tracker.lastCheckedAt);
        const growthStats = await getGrowthStats(tracker);
        // Edit the existing tracker embed in place
        await updateTrackerEmbed(client, tracker, false, growthStats);
      }
    }
  } finally {
    isChecking = false;
  }
}

/**
 * Start the centralized 1-minute tracker checker.
 * @param {import('discord.js').Client} client
 */
export function startTrackerChecker(client) {
  if (checkTimer) return; // Prevent duplicate timers

  // Run immediately on startup, then every 1 minute
  runCheckCycle(client).catch((err) => console.error('[TRACKER CHECKER] Initial check failed:', err.name));
  checkTimer = setInterval(() => {
    runCheckCycle(client).catch((err) => console.error('[TRACKER CHECKER] Check cycle failed:', err.name));
  }, CHECK_INTERVAL_MS);

  console.log('\u2705 Roblox tracker checker started (1-minute interval).');
}

/**
 * Stop the centralized tracker checker (for graceful shutdown).
 */
export function stopTrackerChecker() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
