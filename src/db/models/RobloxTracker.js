import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const robloxTrackerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    robloxUserId: { type: String, default: '0' },
    robloxUsername: { type: String, default: '' },
    discordRoleId: { type: String, required: true },
    targetMilestone: { type: Number, required: true },
    messageId: { type: String, default: null },
    currentFollowers: { type: Number, required: true, default: 0 },
    isConfig: { type: Boolean, default: false },
    active: { type: Boolean, required: true, default: true },
    lastCheckedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Compound index to enforce one active tracker per Roblox account per guild
robloxTrackerSchema.index({ guildId: 1, robloxUserId: 1, active: 1 });

export const RobloxTracker = model('RobloxTracker', robloxTrackerSchema);
