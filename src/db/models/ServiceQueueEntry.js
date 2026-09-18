import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const serviceQueueEntrySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    discordUserId: { type: String, required: true },
    followers: { type: Number, required: true },
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

// Prevent the same user from being added twice in the same guild while their entry exists
serviceQueueEntrySchema.index({ guildId: 1, discordUserId: 1 }, { unique: true });

export const ServiceQueueEntry = model('ServiceQueueEntry', serviceQueueEntrySchema);
