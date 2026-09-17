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
 * Uses only the available history — does not invent values.
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
  const latest = samples[samples.length - 1];
  const now = latest.t.getTime();
  const latestFollowers = latest.f;

  // Per-minute: compare with the sample ~1 minute ago
  let perMinute = 0;
  if (samples.length >= 2) {
    const prev = samples[samples.length - 2];
    perMinute = latestFollowers - prev.f;
  }

  // Per-hour: compare with the sample closest to ~1 hour ago
  let perHour = 0;
  const oneHourAgo = now - 60 * 60 * 1000;
  const hourSample = findSampleAtOrBefore(samples, oneHourAgo);
  if (hourSample) {
    perHour = latestFollowers - hourSample.f;
  }

  // Per-day: compare with the sample closest to ~24 hours ago
  let perDay = 0;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const daySample = findSampleAtOrBefore(samples, oneDayAgo);
  if (daySample) {
    perDay = latestFollowers - daySample.f;
  }

  return { perMinute, perHour, perDay };
}

/**
 * Find the sample closest to (but not after) the target timestamp.
 * If all samples are after the target, returns the earliest sample.
 * @param {Array<{t: Date, f: number}>} samples
 * @param {number} targetMs
 * @returns {{t: Date, f: number} | null}
 */
function findSampleAtOrBefore(samples, targetMs) {
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t.getTime() <= targetMs) {
      return samples[i];
    }
  }
  // All samples are after the target — use the earliest available
  return samples[0];
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
