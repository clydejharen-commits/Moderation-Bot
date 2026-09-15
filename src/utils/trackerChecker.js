import { RobloxTracker } from '../db/models/RobloxTracker.js';
import { isDatabaseConnected } from '../db/database.js';
import { getFollowerCount } from './robloxApi.js';

const CHECK_INTERVAL_MS = 60_000; // 1 minute
let checkTimer = null;
let isChecking = false;

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
    return;
  }

  const channel = guild.channels.cache.get(tracker.channelId);
  if (!channel) {
    console.warn(`[TRACKER CHECKER] Channel ${tracker.channelId} not found for tracker ${tracker._id}.`);
    tracker.active = false;
    tracker.completedAt = new Date();
    await tracker.save().catch((err) => console.error('[TRACKER CHECKER] Failed to save tracker (channel missing):', err.name));
    return;
  }

  const mentionContent = `<@&${tracker.discordRoleId}>`;
  const profileLink = `https://www.roblox.com/users/${tracker.robloxUserId}/profile`;
  const content =
    `🎉 <@&${tracker.discoderRoleId}>\n` +
    `**${tracker.robloxUsername}** has reached **${tracker.currentFollowers.toLocaleString()} followers** on Roblox!\n` +
    `🎯 Target milestone: **${tracker.targetMilestone.toLocaleString()}**\n` +
    `🔗 Profile: ${profileLink}`;

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
      trackers = await RobloxTracker.find({ active: true }).lean(false);
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

  console.log('✅ Roblox tracker checker started (1-minute interval).');
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
