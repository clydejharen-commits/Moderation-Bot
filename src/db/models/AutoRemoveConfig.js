import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const autoRemoveConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    verifiedRoleId: { type: String, required: true },
    unverifiedRoleId: { type: String, required: true },
  },
  { timestamps: true },
);

export const AutoRemoveConfig = model('AutoRemoveConfig', autoRemoveConfigSchema);
