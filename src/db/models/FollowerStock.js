import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const followerStockSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    startingStock: { type: Number, required: true, default: 0 },
    currentStock: { type: Number, required: true, default: 0 },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    embedConfig: {
      title: { type: String, default: 'Roblox Followers Stock' },
      description: { type: String, default: 'Current Roblox Followers stock status.' },
      color: { type: String, default: '#2b2d31' },
      image: { type: String, default: '' },
      footer: { type: String, default: 'Followers Stock System' },
    },
    lastResetDate: { type: String, default: null },
    lastUpdated: { type: Date, default: null },
  },
  { timestamps: true },
);

export const FollowerStock = model('FollowerStock', followerStockSchema);
