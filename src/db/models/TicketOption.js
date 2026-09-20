import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ticketOptionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
    emoji: { type: String, default: null },
    position: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// A guild can have at most 5 ticket options — enforce uniqueness per guild + label
ticketOptionSchema.index({ guildId: 1, label: 1 }, { unique: true });

export const TicketOption = model('TicketOption', ticketOptionSchema);
