import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const closedButtonSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    label: { type: String, required: true },
    reason: { type: String, default: null },
  },
  { timestamps: true },
);

closedButtonSchema.index({ guildId: 1, label: 1 }, { unique: true });

export const ClosedButton = model('ClosedButton', closedButtonSchema);
