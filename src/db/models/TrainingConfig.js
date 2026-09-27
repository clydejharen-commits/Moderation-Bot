import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const trainingConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    trainingChannelId: { type: String, default: null },
    trainerRoleId: { type: String, default: null },
    passingScore: { type: Number, default: 80, min: 0, max: 100 },
    questionsPerTraining: { type: Number, default: 10, min: 1, max: 100 },
    questionTimeLimit: { type: Number, default: 60, min: 1, max: 300 },
  },
  { timestamps: true },
);

export const TrainingConfig = model('TrainingConfig', trainingConfigSchema);
