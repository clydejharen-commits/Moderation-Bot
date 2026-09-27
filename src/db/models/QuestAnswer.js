import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const questAnswerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    questionId: { type: Schema.Types.ObjectId, required: true, index: true },
    traineeId: { type: String, required: true, index: true },
    answerText: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);

questAnswerSchema.index({ questionId: 1, traineeId: 1 }, { unique: true });

export const QuestAnswer = model('QuestAnswer', questAnswerSchema);
