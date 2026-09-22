import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ticketConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    categoryId: { type: String, default: null },
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
    staffRoleId: { type: String, default: null },
    vouchChannelId: { type: String, default: null },
  },
  { timestamps: true },
);

export const TicketConfig = model('TicketConfig', ticketConfigSchema);
