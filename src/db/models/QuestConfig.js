import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    traineeUsers: { type: [String], default: [] },
    traineeRoles: { type: [String], default: [] },
    trainerUsers: { type: [String], default: [] },
    trainerRoles: { type: [String], default: [] },
    promotionPercent: { type: Number, default: 80, min: 0, max: 100 },
    demotionPercent: { type: Number, default: 40, min: 0, max: 100 },
  },
  { timestamps: true },
);

export const QuestConfig = model('QuestConfig', questConfigSchema);
