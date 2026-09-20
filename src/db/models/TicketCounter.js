import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ticketCounterSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const TicketCounter = model('TicketCounter', ticketCounterSchema);
