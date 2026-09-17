import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Stores timestamped follower samples for a single tracker.
 * One document per tracker, keyed by trackerId (the RobloxTracker _id).
 * Samples are capped at 1440 entries (24 hours of 1-minute checks).
 */
const followerGrowthHistorySchema = new Schema(
  {
    trackerId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    guildId: { type: String, required: true, index: true },
    robloxUserId: { type: String, required: true },
    samples: [
      {
        t: { type: Date, required: true },
        f: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true },
);

export const FollowerGrowthHistory = model('FollowerGrowthHistory', followerGrowthHistorySchema);
