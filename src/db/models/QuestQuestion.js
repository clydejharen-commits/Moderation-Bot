import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questQuestionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    questionText: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      required: true,
      enum: ['active', 'completed', 'ended'],
      default: 'active',
    },
    createdBy: { type: String, required: true },
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
    eligibleTrainees: { type: [String], default: [] },
    answeredTrainees: { type: [String], default: [] },
    endedBy: { type: String, default: null },
    endedReason: { type: String, default: null, enum: ['manual', 'auto', null] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

questQuestionSchema.index({ guildId: 1, status: 1 });

export const QuestQuestion = model('QuestQuestion', questQuestionSchema);
