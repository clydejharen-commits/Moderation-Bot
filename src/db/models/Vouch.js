import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const vouchSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    panelMessageId: { type: String, required: true, index: true },
    vouchedById: { type: String, required: true },
    vouchFor: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, required: true },
  },
  { timestamps: true },
);

// One vouch per member per panel — prevents duplicates on the same panel
vouchSchema.index({ panelMessageId: 1, vouchedById: 1 }, { unique: true });

export const Vouch = model('Vouch', vouchSchema);
