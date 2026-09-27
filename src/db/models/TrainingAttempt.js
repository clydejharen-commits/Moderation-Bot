import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const answerSchema = new Schema(
  {
    questionText: { type: String, required: true },
    traineeAnswer: { type: String, default: null },
    correctAnswer: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
    timedOut: { type: Boolean, default: false },
  },
  { _id: false },
);

const trainingAttemptSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    traineeId: { type: String, required: true, index: true },
    trainerId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    incorrectAnswers: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    result: { type: String, enum: ['passed', 'failed'], default: null },
    answers: { type: [answerSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

trainingAttemptSchema.index({ guildId: 1, traineeId: 1, status: 1 });

export const TrainingAttempt = model('TrainingAttempt', trainingAttemptSchema);
