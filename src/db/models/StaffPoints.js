import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const staffPointsSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    points: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

staffPointsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const StaffPoints = model('StaffPoints', staffPointsSchema);
