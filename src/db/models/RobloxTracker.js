import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const robloxTrackerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    robloxUserId: { type: String, required: true },
    robloxUsername: { type: String, required: true },
    discordRoleId: { type: String, required: true },
    targetMilestone: { type: Number, required: true },
    currentFollowers: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
    lastCheckedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Compound index to enforce one active tracker per Roblox account per guild
robloxTrackerSchema.index({ guildId: 1, robloxUserId: 1, active: 1 });

export const RobloxTracker = model('RobloxTracker', robloxTrackerSchema);
