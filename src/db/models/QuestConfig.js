import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    traineeUserIds: { type: [String], default: [] },
    traineeRoleIds: { type: [String], default: [] },
    trainerUserIds: { type: [String], default: [] },
    trainerRoleIds: { type: [String], default: [] },
    pointsPerPromoteCoin: { type: Number, default: 5 },
    promoteCoinsForPromotion: { type: Number, default: 15 },
    promoteCoinsForDemotion: { type: Number, default: -5 },
  },
  { timestamps: true },
);

export const QuestConfig = model('QuestConfig', questConfigSchema);
