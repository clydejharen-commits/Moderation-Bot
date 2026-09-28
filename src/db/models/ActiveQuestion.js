import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const answerSchema = new Schema(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    answer: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const activeQuestionSchema = new Schema(
  {
    questionId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    creatorId: { type: String, required: true },
    creatorUsername: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    channelId: { type: String, default: '' },
    messageId: { type: String, default: '' },
    eligibleTraineeIds: { type: [String], default: [] },
    answers: { type: [answerSchema], default: [] },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

activeQuestionSchema.index({ guildId: 1, completed: 1 });

export const ActiveQuestion = model('ActiveQuestion', activeQuestionSchema);
