import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const serviceQueueSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
  },
  { timestamps: true },
);

export const ServiceQueue = model('ServiceQueue', serviceQueueSchema);
