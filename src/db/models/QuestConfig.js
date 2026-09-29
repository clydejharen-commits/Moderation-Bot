import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    traineeUserIds: { type: [String], default: [] },
    traineeRoleIds: { type: [String], default: [] },
    trainerUserIds: { type: [String], default: [] },
    trainerRoleIds: { type: [String], default: [] },
    // Message tracking
    trackedUserIds: { type: [String], default: [] },
    trackedChannelIds: { type: [String], default: [] },
    // Daily message requirement
    requiredDailyMessages: { type: Number, default: 50 },
    pointsIfMet: { type: Number, default: 5 },
    pointsIfNotMet: { type: Number, default: -3 },
    lastDailyEvalDate: { type: String, default: '' },
    // Token settings
    pointsPerToken: { type: Number, default: 5 },
    // Token ranges
    demotionMin: { type: Number, default: 0 },
    demotionMax: { type: Number, default: 20 },
    normalMin: { type: Number, default: 21 },
    normalMax: { type: Number, default: 49 },
    promotionMin: { type: Number, default: 50 },
    promotionMax: { type: Number, default: 999999 },
    // Leaderboard
    leaderboardChannelId: { type: String, default: '' },
    leaderboardMessageId: { type: String, default: '' },
    leaderboardColor: { type: Number, default: 0x2B6CB0 },
    leaderboardImageUrl: { type: String, default: '' },
  },
  { timestamps: true },
);

export const QuestConfig = model('QuestConfig', questConfigSchema);
