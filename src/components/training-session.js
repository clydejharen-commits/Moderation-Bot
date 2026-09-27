import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { TrainingQuestion } from '../db/models/TrainingQuestion.js';
import { TrainingAttempt } from '../db/models/TrainingAttempt.js';

const SITUATION_CHOICES = ['Warn', 'Mute', 'Call Higher-Up', 'Do Nothing'];

const activeSessions = new Map();
const pendingReviews = new Map();

export function isTrainingButton(customId) {
  return customId.startsWith('training_answer:') || customId.startsWith('training_explain_open:') || customId.startsWith('training_review:');
}

export function isTrainingPaginationButton(customId) {
  return customId === 'training_lb_prev' || customId === 'training_lb_next';
}

export function isTrainingExplanationModal(customId) {
  return customId.startsWith('training_explanation:');
}

export function isTrainingReviewButton(customId) {
  return customId.startsWith('training_review:');
}

export function getActiveSession(guildId, traineeId) {
  return activeSessions.get(`${guildId}:${traineeId}`) || null;
}

export function getActiveSessionByTrainer(guildId, trainerId) {
  for (const session of activeSessions.values()) {
    if (session.guildId === guildId && session.trainerId === trainerId) {
      return session;
    }
  }
  return null;
}

export function getAllActiveSessions(guildId) {
  return Array.from(activeSessions.values()).filter((s) => s.guildId === guildId);
}

export function hasActiveSession(guildId, traineeId) {
  return activeSessions.has(`${guildId}:${traineeId}`);
}

export function removeActiveSession(guildId, traineeId) {
  const key = `${guildId}:${traineeId}`;
  const session = activeSessions.get(key);
  if (session) {
    if (session.timerInterval) clearInterval(session.timerInterval);
    if (session.timeoutId) clearTimeout(session.timeoutId);
    activeSessions.delete(key);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildAnswerRows(choices, sessionId, questionIndex) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = 0; i < choices.length; i++) {
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`training_answer:${i}:${sessionId}:${questionIndex}`)
        .setLabel(choices[i].length > 80 ? choices[i].slice(0, 77) + '...' : choices[i])
        .setStyle(ButtonStyle.Primary),
    );
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

function buildQuestionEmbed(question, questionNumber, totalQuestions, remainingSeconds) {
  const typeLabel = {
    multiple_choice: 'Multiple Choice',
    situation: 'Situation',
    explanation_answer: 'Explanation Answer',
  }[question.questionType] || 'Question';

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  const embed = new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions}`)
    .setColor(remainingSeconds <= 10 ? 0xE74C3C : 0x2ECC71)
    .addFields(
      { name: 'Type', value: typeLabel, inline: true },
      { name: 'Time Remaining', value: timeDisplay, inline: true },
    )
    .setDescription(`**${question.questionText}**`)
    .setFooter({ text: 'Select your answer below. You cannot change it after submitting.' });

  return embed;
}

function buildExplanationEmbed(question, questionNumber, totalQuestions, remainingSeconds) {
  const typeLabel = 'Explanation Answer';
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  const embed = new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions}`)
    .setColor(remainingSeconds <= 10 ? 0xE74C3C : 0x2ECC71)
    .addFields(
      { name: 'Type', value: typeLabel, inline: true },
      { name: 'Time Remaining', value: timeDisplay, inline: true },
    )
    .setDescription(`**${question.questionText}**`)
    .setFooter({ text: 'Click the button below to type your answer.' });

  return embed;
}

function buildExplanationAnswerInputRow(sessionId, questionIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`training_explain_open:${sessionId}:${questionIndex}`)
      .setLabel('✍️ Type Your Answer')
      .setStyle(ButtonStyle.Primary),
  );
}

function buildFinalResultEmbed(attempt, traineeMention) {
  const passed = attempt.result === 'passed';
  const embed = new EmbedBuilder()
    .setTitle('Training Complete')
    .setColor(passed ? 0x2ECC71 : 0xE74C3C)
    .addFields(
      { name: 'Staff', value: traineeMention, inline: false },
      { name: 'Score', value: `${attempt.correctAnswers}/${attempt.totalQuestions}`, inline: true },
      { name: 'Percentage', value: `${attempt.percentage}%`, inline: true },
      { name: 'Correct Answers', value: String(attempt.correctAnswers), inline: true },
      { name: 'Incorrect Answers', value: String(attempt.incorrectAnswers), inline: true },
      { name: 'Result', value: passed ? 'Passed ✅' : 'Failed ❌', inline: true },
    )
    .setFooter({ text: 'Training System' })
    .setTimestamp();

  return embed;
}

function buildReviewEmbed(session, questionIndex) {
  const question = session.questions[questionIndex];
  const traineeId = session.traineeId;

  const embed = new EmbedBuilder()
    .setTitle('📝 Explanation Answer — Review Required')
    .setColor(0xF1C40F)
    .addFields(
      { name: 'Trainee', value: `<@${traineeId}>`, inline: false },
      { name: `Question ${questionIndex + 1}/${session.questions.length}`, value: question.questionText.slice(0, 1024), inline: false },
      { name: "Trainee's Answer", value: (session.answers[questionIndex]?.traineeAnswer || '(no answer)').slice(0, 1024), inline: false },
      { name: 'Reference / Expected Answer', value: (question.referenceAnswer || '(none provided)').slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Choose Correct or Incorrect. This decision is final and counts toward the score.' });

  return embed;
}

function buildReviewButtons(sessionId, questionIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`training_review:correct:${sessionId}:${questionIndex}`)
      .setLabel('✅ Correct')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`training_review:incorrect:${sessionId}:${questionIndex}`)
      .setLabel('❌ Incorrect')
      .setStyle(ButtonStyle.Danger),
  );
}

export async function startTrainingSession(interaction, config, traineeId, trainerId) {
  const guildId = interaction.guild.id;

  let questions;
  try {
    questions = await TrainingQuestion.find({ guildId }).lean();
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to fetch questions:', err.message);
    await interaction.editReply({ content: '❌ Database error. Please try again later.' });
    return;
  }

  if (questions.length === 0) {
    await interaction.editReply({ content: '❌ No questions have been added. An administrator needs to add questions in `/training setup` first.' });
    return;
  }

  const numQuestions = Math.min(config.questionsPerTraining, questions.length);
  const selectedQuestions = shuffle(questions).slice(0, numQuestions);

  let attempt;
  try {
    attempt = await TrainingAttempt.create({
      guildId,
      traineeId,
      trainerId,
      status: 'active',
      totalQuestions: numQuestions,
      startedAt: new Date(),
    });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to create attempt:', err.message);
    await interaction.editReply({ content: '❌ Database error. Please try again later.' });
    return;
  }

  let traineeDmChannel;
  try {
    const traineeUser = await interaction.client.users.fetch(traineeId);
    traineeDmChannel = await traineeUser.createDM();
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to create DM channel:', err.message);
    await interaction.editReply({ content: '❌ Could not DM the trainee. They may have DMs disabled.' });
    return;
  }

  let trainerDmChannel;
  try {
    const trainerUser = await interaction.client.users.fetch(trainerId);
    trainerDmChannel = await trainerUser.createDM();
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to create trainer DM channel:', err.message);
    await interaction.editReply({ content: '❌ Could not DM the trainer. They may have DMs disabled.' });
    return;
  }

  const sessionKey = `${guildId}:${traineeId}`;
  const session = {
    sessionKey,
    guildId,
    traineeId,
    trainerId,
    attemptId: attempt._id.toString(),
    questions: selectedQuestions,
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    answers: [],
    timerInterval: null,
    timeoutId: null,
    questionStartTime: null,
    remainingSeconds: config.questionTimeLimit,
    timeLimit: config.questionTimeLimit,
    passingScore: config.passingScore,
    traineeDmChannel,
    trainerDmChannel,
    channel: interaction.channel,
    answered: false,
    pendingReview: false,
    completed: false,
  };

  activeSessions.set(sessionKey, session);

  await interaction.editReply({ content: `📚 Training started for <@${traineeId}>. Questions are being sent via DM. Good luck!` });

  try {
    await traineeDmChannel.send(`📚 Your training session has started! You will receive ${numQuestions} questions. Answer each one before the timer runs out.`);
  } catch {
    // DM may fail; continue
  }

  await sendQuestion(session);
}

async function sendQuestion(session) {
  const question = session.questions[session.currentIndex];
  session.answered = false;
  session.remainingSeconds = session.timeLimit;
  session.questionStartTime = Date.now();

  if (question.questionType === 'explanation_answer') {
    const embed = buildExplanationEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
    const row = buildExplanationAnswerInputRow(session.sessionKey, session.currentIndex);

    let message;
    try {
      message = await session.traineeDmChannel.send({ content: `<@${session.traineeId}>`, embeds: [embed], components: [row] });
    } catch (err) {
      console.error('[TRAINING SESSION] Failed to send explanation question:', err.message);
      return;
    }

    session.currentMessage = message;
  } else {
    const embed = buildQuestionEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
    const choices = question.choices.length > 0 ? question.choices : getChoicesByType(question.questionType);
    const rows = buildAnswerRows(choices, session.sessionKey, session.currentIndex);

    let message;
    try {
      message = await session.traineeDmChannel.send({ content: `<@${session.traineeId}>`, embeds: [embed], components: rows });
    } catch (err) {
      console.error('[TRAINING SESSION] Failed to send question:', err.message);
      return;
    }

    session.currentMessage = message;
  }

  if (session.timerInterval) clearInterval(session.timerInterval);
  if (session.timeoutId) clearTimeout(session.timeoutId);

  session.timerInterval = setInterval(async () => {
    session.remainingSeconds--;
    if (session.remainingSeconds <= 0) {
      clearInterval(session.timerInterval);
      session.timerInterval = null;
      return;
    }

    if (session.answered) {
      clearInterval(session.timerInterval);
      session.timerInterval = null;
      return;
    }

    try {
      if (question.questionType === 'explanation_answer') {
        const updatedEmbed = buildExplanationEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
        await message.edit({ embeds: [updatedEmbed] });
      } else {
        const updatedEmbed = buildQuestionEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch {
      clearInterval(session.timerInterval);
      session.timerInterval = null;
    }
  }, 1000);

  session.timeoutId = setTimeout(() => {
    if (session.answered) return;
    handleTimeout(session);
  }, session.timeLimit * 1000);
}

function getChoicesByType(questionType) {
  if (questionType === 'situation') return SITUATION_CHOICES;
  return [];
}

async function handleTimeout(session) {
  if (session.answered) return;
  session.answered = true;

  if (session.timerInterval) {
    clearInterval(session.timerInterval);
    session.timerInterval = null;
  }

  const question = session.questions[session.currentIndex];

  if (question.questionType === 'explanation_answer') {
    session.answers.push({
      questionText: question.questionText,
      questionType: question.questionType,
      traineeAnswer: null,
      correctAnswer: null,
      referenceAnswer: question.referenceAnswer,
      isCorrect: null,
      trainerDecision: null,
      timedOut: true,
      reviewed: false,
    });
  } else {
    session.answers.push({
      questionText: question.questionText,
      questionType: question.questionType,
      traineeAnswer: null,
      correctAnswer: question.correctAnswer,
      isCorrect: false,
      timedOut: true,
      reviewed: true,
    });
    session.incorrectCount++;
  }

  try {
    await session.currentMessage.edit({ content: `<@${session.traineeId}>`, embeds: [buildTimedOutEmbed(session.currentIndex + 1, session.questions.length)], components: [] });
  } catch {
    // Message may be gone
  }

  await advanceToNext(session);
}

function buildTimedOutEmbed(questionNumber, totalQuestions) {
  return new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions} — Timed Out`)
    .setColor(0xE74C3C)
    .setDescription('⏰ Time ran out — no answer was submitted.')
    .setFooter({ text: 'Moving to the next question...' });
}

export async function handleTrainingButton(interaction) {
  if (interaction.customId.startsWith('training_explain_open:')) {
    await handleExplanationButton(interaction);
    return;
  }
  if (interaction.customId.startsWith('training_review:')) {
    await handleReviewButton(interaction);
    return;
  }

  const parts = interaction.customId.split(':');
  const answerIndex = parseInt(parts[1], 10);
  const sessionKey = parts[2];
  const questionIndex = parseInt(parts[3], 10);

  const session = activeSessions.get(sessionKey);

  if (!session) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== session.traineeId) {
    await interaction.reply({ content: '❌ This training session is not assigned to you.', ephemeral: true });
    return;
  }

  if (session.currentIndex !== questionIndex) {
    await interaction.reply({ content: '❌ This question is no longer active.', ephemeral: true });
    return;
  }

  if (session.answered) {
    await interaction.reply({ content: '❌ You have already answered this question.', ephemeral: true });
    return;
  }

  session.answered = true;

  if (session.timerInterval) {
    clearInterval(session.timerInterval);
    session.timerInterval = null;
  }
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }

  const question = session.questions[session.currentIndex];
  const choices = question.choices.length > 0 ? question.choices : getChoicesByType(question.questionType);
  const traineeAnswer = choices[answerIndex];
  const isCorrect = traineeAnswer === question.correctAnswer;

  if (isCorrect) {
    session.correctCount++;
  } else {
    session.incorrectCount++;
  }

  session.answers.push({
    questionText: question.questionText,
    questionType: question.questionType,
    traineeAnswer,
    correctAnswer: question.correctAnswer,
    isCorrect,
    timedOut: false,
    reviewed: true,
  });

  try {
    await interaction.update({ embeds: [buildAcknowledgeEmbed(session.currentIndex + 1, session.questions.length)], components: [] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to update after answer:', err.message);
  }

  await advanceToNext(session);
}

function buildAcknowledgeEmbed(questionNumber, totalQuestions) {
  return new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions} — Answer Recorded`)
    .setColor(0x3498DB)
    .setDescription('✅ Your answer has been recorded.')
    .setFooter({ text: 'Moving to the next question...' });
}

export async function handleExplanationButton(interaction) {
  const parts = interaction.customId.split(':');
  const sessionKey = parts[1];
  const questionIndex = parseInt(parts[2], 10);

  const session = activeSessions.get(sessionKey);
  if (!session) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== session.traineeId) {
    await interaction.reply({ content: '❌ This training session is not assigned to you.', ephemeral: true });
    return;
  }

  if (session.currentIndex !== questionIndex) {
    await interaction.reply({ content: '❌ This question is no longer active.', ephemeral: true });
    return;
  }

  if (session.answered) {
    await interaction.reply({ content: '❌ You have already answered this question.', ephemeral: true });
    return;
  }

  const question = session.questions[session.currentIndex];

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`training_explanation:${sessionKey}:${questionIndex}`)
    .setTitle('Type Your Answer');

  const input = new TextInputBuilder()
    .setCustomId('training_explanation_value')
    .setLabel('Your Answer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setPlaceholder('Type your detailed response...');

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleExplanationModal(interaction) {
  const parts = interaction.customId.split(':');
  const sessionKey = parts[1];
  const questionIndex = parseInt(parts[2], 10);

  const session = activeSessions.get(sessionKey);
  if (!session) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== session.traineeId) {
    await interaction.reply({ content: '❌ This training session is not assigned to you.', ephemeral: true });
    return;
  }

  if (session.currentIndex !== questionIndex) {
    await interaction.reply({ content: '❌ This question is no longer active.', ephemeral: true });
    return;
  }

  if (session.answered) {
    await interaction.reply({ content: '❌ You have already answered this question.', ephemeral: true });
    return;
  }

  const traineeAnswer = interaction.fields.getTextInputValue('training_explanation_value').trim();
  const question = session.questions[session.currentIndex];

  session.answered = true;
  session.pendingReview = true;

  if (session.timerInterval) {
    clearInterval(session.timerInterval);
    session.timerInterval = null;
  }
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }

  session.answers.push({
    questionText: question.questionText,
    questionType: question.questionType,
    traineeAnswer,
    correctAnswer: null,
    referenceAnswer: question.referenceAnswer,
    isCorrect: null,
    trainerDecision: null,
    timedOut: false,
    reviewed: false,
  });

  await interaction.reply({ embeds: [buildExplanationSubmittedEmbed(session.currentIndex + 1, session.questions.length)], ephemeral: true });

  await sendTrainerReview(session, session.currentIndex);
}

function buildExplanationSubmittedEmbed(questionNumber, totalQuestions) {
  return new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions} — Answer Submitted`)
    .setColor(0x3498DB)
    .setDescription('✅ Your answer has been submitted for review.\n⏳ Waiting for the trainer to review your response...')
    .setFooter({ text: 'You will receive the next question once the trainer reviews this one.' });
}

async function sendTrainerReview(session, questionIndex) {
  const embed = buildReviewEmbed(session, questionIndex);
  const row = buildReviewButtons(session.sessionKey, questionIndex);

  let reviewMessage;
  try {
    reviewMessage = await session.trainerDmChannel.send({ content: `<@${session.trainerId}>`, embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to send trainer review:', err.message);
    try {
      await session.traineeDmChannel.send('❌ The trainer could not be reached for review. Skipping this question as incorrect.');
    } catch {
      // ignore
    }
    session.answers[questionIndex].isCorrect = false;
    session.answers[questionIndex].trainerDecision = 'incorrect';
    session.answers[questionIndex].reviewed = true;
    session.incorrectCount++;
    session.pendingReview = false;
    await advanceToNext(session);
    return;
  }

  pendingReviews.set(reviewMessage.id, { sessionKey: session.sessionKey, questionIndex });
}

export async function handleReviewButton(interaction) {
  const parts = interaction.customId.split(':');
  const decision = parts[1];
  const sessionKey = parts[2];
  const questionIndex = parseInt(parts[3], 10);

  const session = activeSessions.get(sessionKey);
  if (!session) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== session.trainerId) {
    await interaction.reply({ content: '❌ You are not the trainer for this session.', ephemeral: true });
    return;
  }

  if (!session.pendingReview || session.currentIndex !== questionIndex) {
    await interaction.reply({ content: '❌ This review is no longer active.', ephemeral: true });
    return;
  }

  const isCorrect = decision === 'correct';
  session.answers[questionIndex].isCorrect = isCorrect;
  session.answers[questionIndex].trainerDecision = decision;
  session.answers[questionIndex].reviewed = true;

  if (isCorrect) {
    session.correctCount++;
  } else {
    session.incorrectCount++;
  }

  session.pendingReview = false;

  const resultText = isCorrect ? '✅ Correct' : '❌ Incorrect';
  const embed = new EmbedBuilder()
    .setTitle('Review Recorded')
    .setColor(isCorrect ? 0x2ECC71 : 0xE74C3C)
    .setDescription(`You marked this answer as **${resultText}**.`)
    .setFooter({ text: 'The trainee will continue to the next question.' });

  try {
    await interaction.update({ embeds: [embed], components: [] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to update review message:', err.message);
  }

  try {
    await session.traineeDmChannel.send('✅ Your answer has been reviewed. Continuing to the next question...');
  } catch {
    // DM may fail
  }

  await advanceToNext(session);
}

async function advanceToNext(session) {
  session.currentIndex++;

  if (session.currentIndex >= session.questions.length) {
    await finishTraining(session);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 2500));
  await sendQuestion(session);
}

async function finishTraining(session) {
  if (session.completed) return;
  session.completed = true;

  const totalQuestions = session.questions.length;
  const correctAnswers = session.correctCount;
  const incorrectAnswers = session.incorrectCount;
  const percentage = Math.round((correctAnswers / totalQuestions) * 100);
  const result = percentage >= session.passingScore ? 'passed' : 'failed';

  if (session.timerInterval) {
    clearInterval(session.timerInterval);
    session.timerInterval = null;
  }
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }

  try {
    await TrainingAttempt.findByIdAndUpdate(session.attemptId, {
      status: 'completed',
      score: correctAnswers,
      totalQuestions,
      correctAnswers,
      incorrectAnswers,
      percentage,
      result,
      answers: session.answers,
      completedAt: new Date(),
    });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to save final attempt:', err.message);
  }

  const traineeMention = `<@${session.traineeId}>`;
  const attempt = { correctAnswers, incorrectAnswers, totalQuestions, percentage, result };

  const finalEmbed = buildFinalResultEmbed(attempt, traineeMention);

  try {
    await session.traineeDmChannel.send({ content: `<@${session.traineeId}>`, embeds: [finalEmbed] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to send final result to trainee:', err.message);
  }

  try {
    await session.channel.send({ content: `📊 Training complete for <@${session.traineeId}>.\n**Score:** ${correctAnswers}/${totalQuestions} (${percentage}%) — ${result === 'passed' ? 'Passed ✅' : 'Failed ❌'}` });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to send result to channel:', err.message);
  }

  removeActiveSession(session.guildId, session.traineeId);
}

export async function stopTrainingSession(guildId, traineeId) {
  const session = activeSessions.get(`${guildId}:${traineeId}`);
  if (!session) return false;

  if (session.timerInterval) {
    clearInterval(session.timerInterval);
    session.timerInterval = null;
  }
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }

  try {
    await TrainingAttempt.findByIdAndUpdate(session.attemptId, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to mark attempt as cancelled:', err.message);
  }

  try {
    await session.traineeDmChannel.send({ content: `⏹️ Your training session has been stopped and marked as **Cancelled**.` });
  } catch {
    // DM may fail
  }

  try {
    await session.channel.send({ content: `⏹️ Training for <@${session.traineeId}> has been stopped and marked as **Cancelled**.` });
  } catch {
    // Channel may be gone
  }

  removeActiveSession(guildId, traineeId);
  return true;
}

const leaderboardState = new Map();

export function setLeaderboardState(messageId, entries, page) {
  leaderboardState.set(messageId, { entries, page });
  setTimeout(() => leaderboardState.delete(messageId), 5 * 60 * 1000);
}

export function getLeaderboardState(messageId) {
  return leaderboardState.get(messageId) || null;
}

export async function buildLeaderboardEmbed(entries, page, client) {
  const pageSize = 10;
  const totalPages = Math.ceil(entries.length / pageSize) || 1;
  const startIdx = page * pageSize;
  const pageEntries = entries.slice(startIdx, startIdx + pageSize);

  const lines = [];
  for (let i = 0; i < pageEntries.length; i++) {
    const entry = pageEntries[i];
    const rank = startIdx + i + 1;
    let displayName = entry.traineeId;
    try {
      const user = await client.users.fetch(entry.traineeId);
      displayName = user.username;
    } catch {
      // fallback to id
    }
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    lines.push(`${medal} **${displayName}** — ${entry.bestPercentage}%`);
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Training Leaderboard')
    .setColor(0xF1C40F)
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No training records found.')
    .setFooter({ text: `Page ${page + 1}/${totalPages}` });

  return embed;
}

export function buildLeaderboardPagination(page, totalPages) {
  if (totalPages <= 1) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('training_lb_prev')
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('training_lb_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}
