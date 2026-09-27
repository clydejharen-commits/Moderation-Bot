import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    traineeUsers: { type: [String], default: [] },
    traineeRoles: { type: [String], default: [] },
    trainerUsers: { type: [String], default: [] },
    trainerRoles: { type: [String], default: [] },
    pointsPerCoin: { type: Number, default: 5, min: 1 },
    coinsForPromotion: { type: Number, default: 15 },
    coinsForDemotion: { type: Number, default: -5 },
    leaderboardChannelId: { type: String, default: null },
    leaderboardMessageId: { type: String, default: null },
  },
  { timestamps: true },
);

export const QuestConfig = model('QuestConfig', questConfigSchema);
