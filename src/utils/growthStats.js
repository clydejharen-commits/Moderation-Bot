import { FollowerGrowthHistory } from '../db/models/FollowerGrowthHistory.js';

const MAX_SAMPLES = 1440; // 24 hours of 1-minute checks

/**
 * Record a follower sample for a tracker and prune old entries.
 *
 * @param {import('mongoose').Document} tracker — the RobloxTracker document
 * @param {number} followerCount — current follower count
 * @param {Date} [timestamp] — defaults to now
 */
export async function recordGrowthSample(tracker, followerCount, timestamp = new Date()) {
  try {
    await FollowerGrowthHistory.findOneAndUpdate(
      { trackerId: tracker._id },
      {
        $setOnInsert: {
          guildId: tracker.guildId,
          robloxUserId: tracker.robloxUserId,
        },
        $push: {
          samples: {
            $each: [{ t: timestamp, f: followerCount }],
            $slice: -MAX_SAMPLES,
          },
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error(`[GROWTH] Failed to record sample for ${tracker.robloxUsername}:`, err.message);
  }
}

/**
 * Calculate per-minute, per-hour, and per-day follower growth.
 *
 * Per Minute is derived from the last two follower samples.
 * Per Hour = Per Minute × 60.  Per Day = Per Minute × 1,440.
 * These are always recalculated from the latest Per Minute value so
 * they never go stale.
 *
 * @param {import('mongoose').Document} tracker
 * @returns {Promise<{ perMinute: number, perHour: number, perDay: number }>}
 */
export async function getGrowthStats(tracker) {
  let doc;
  try {
    doc = await FollowerGrowthHistory.findOne({ trackerId: tracker._id }).lean();
  } catch (err) {
    console.error(`[GROWTH] Failed to load history for ${tracker.robloxUsername}:`, err.message);
    return { perMinute: 0, perHour: 0, perDay: 0 };
  }

  if (!doc || !doc.samples || doc.samples.length === 0) {
    return { perMinute: 0, perHour: 0, perDay: 0 };
  }

  const samples = doc.samples;
  const latestFollowers = samples[samples.length - 1].f;

  // Per-minute: compare with the previous sample
  let perMinute = 0;
  if (samples.length >= 2) {
    const prev = samples[samples.length - 2];
    perMinute = latestFollowers - prev.f;
  }

  // Per Hour and Per Day are derived directly from Per Minute
  const perHour = perMinute * 60;
  const perDay = perMinute * 1440;

  return { perMinute, perHour, perDay };
}

/**
 * Delete the growth history for a specific tracker.
 * Called when a tracker completes or is manually stopped.
 * @param {import('mongoose').Document | { _id: import('mongoose').Types.ObjectId }} tracker
 */
export async function deleteGrowthHistory(tracker) {
  try {
    await FollowerGrowthHistory.deleteOne({ trackerId: tracker._id });
  } catch (err) {
    console.error(`[GROWTH] Failed to delete history for tracker ${tracker._id}:`, err.message);
  }
}

/**
 * Delete growth history for multiple trackers by trackerId.
 * @param {Array<import('mongoose').Types.ObjectId>} trackerIds
 */
export async function deleteGrowthHistoryMany(trackerIds) {
  if (!trackerIds || trackerIds.length === 0) return;
  try {
    await FollowerGrowthHistory.deleteMany({
      trackerId: { $in: trackerIds },
    });
  } catch (err) {
    console.error('[GROWTH] Failed to delete history for multiple trackers:', err.message);
  }
}
