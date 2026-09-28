import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const staffMemberSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    username: { type: String, default: '' },
    totalPoints: { type: Number, default: 0 },
    token: { type: Number, default: 0 },
    status: { type: String, enum: ['promotion', 'normal', 'demotion'], default: 'demotion' },
    dailyMessageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

staffMemberSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const StaffMember = model('StaffMember', staffMemberSchema);
