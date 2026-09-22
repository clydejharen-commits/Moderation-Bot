import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ticketSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    creatorId: { type: String, required: true },
    ticketNumber: { type: Number, required: true },
    label: { type: String, required: true },
    color: { type: String, default: null },
    emoji: { type: String, default: null },
  },
  { timestamps: true },
);

// One open ticket per member per guild — prevents duplicates
ticketSchema.index({ guildId: 1, creatorId: 1 }, { unique: true });

export const Ticket = model('Ticket', ticketSchema);
