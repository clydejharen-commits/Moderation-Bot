import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const trainingQuestionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    questionText: { type: String, required: true, maxlength: 2000 },
    questionType: {
      type: String,
      required: true,
      enum: ['multiple_choice', 'situation', 'explanation_answer'],
    },
    choices: { type: [String], default: [] },
    correctAnswer: { type: String, default: null },
    referenceAnswer: { type: String, default: null, maxlength: 2000 },
    explanation: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

export const TrainingQuestion = model('TrainingQuestion', trainingQuestionSchema);
