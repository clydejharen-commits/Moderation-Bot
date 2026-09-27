import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { TrainingQuestion } from '../db/models/TrainingQuestion.js';
import { TrainingAttempt } from '../db/models/TrainingAttempt.js';

const SITUATION_CHOICES = ['Warn', 'Mute', 'Call Higher-Up', 'Do Nothing'];
const TF_CHOICES = ['True', 'False'];

const activeSessions = new Map();

export function isTrainingButton(customId) {
  return customId.startsWith('training_answer:');
}

export function isTrainingPaginationButton(customId) {
  return customId === 'training_lb_prev' || customId === 'training_lb_next';
}

export function getActiveSession(guildId) {
  return activeSessions.get(guildId) || null;
}

export function hasActiveSession(guildId, traineeId) {
  const session = activeSessions.get(guildId);
  return session && session.traineeId === traineeId;
}

export function removeActiveSession(guildId) {
  const session = activeSessions.get(guildId);
  if (session) {
    if (session.timerInterval) clearInterval(session.timerInterval);
    if (session.timeoutId) clearTimeout(session.timeoutId);
    activeSessions.delete(guildId);
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

function buildAnswerRows(choices, attemptId) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = 0; i < choices.length; i++) {
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`training_answer:${i}:${attemptId}`)
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
    true_false: 'True / False',
    situation: 'Situation',
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

function buildAnswerResultEmbed(question, traineeAnswer, isCorrect, timedOut, questionNumber, totalQuestions) {
  const embed = new EmbedBuilder()
    .setTitle(`Question ${questionNumber}/${totalQuestions} — ${isCorrect ? 'Correct ✅' : 'Incorrect ❌'}`)
    .setColor(isCorrect ? 0x2ECC71 : 0xE74C3C)
    .addFields(
      { name: 'Question', value: question.questionText.slice(0, 1024), inline: false },
    );

  if (timedOut) {
    embed.addFields({ name: 'Your Answer', value: '⏰ Timed out — no answer submitted', inline: false });
  } else {
    embed.addFields({ name: 'Your Answer', value: traineeAnswer, inline: true });
  }

  embed.addFields({ name: 'Correct Answer', value: question.correctAnswer, inline: true });

  if (question.explanation) {
    embed.addFields({ name: 'Explanation', value: question.explanation.slice(0, 1024), inline: false });
  }

  return embed;
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
      { name: 'Result', value: passed ? 'Passed ✅' : 'Failed ❌', inline: true },
    )
    .setFooter({ text: 'Training System' })
    .setTimestamp();

  return embed;
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

  const session = {
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
    channel: interaction.channel,
    answered: false,
  };

  activeSessions.set(guildId, session);

  await interaction.editReply({ content: `📚 Training started for <@${traineeId}>. Good luck!` });

  await sendQuestion(session);
}

async function sendQuestion(session) {
  const question = session.questions[session.currentIndex];
  session.answered = false;
  session.remainingSeconds = session.timeLimit;
  session.questionStartTime = Date.now();

  const embed = buildQuestionEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
  const rows = buildAnswerRows(question.choices.length > 0 ? question.choices : getChoicesByType(question.questionType), session.attemptId);

  let message;
  try {
    message = await session.channel.send({ content: `<@${session.traineeId}>`, embeds: [embed], components: rows });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to send question:', err.message);
    return;
  }

  session.currentMessage = message;

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
      const updatedEmbed = buildQuestionEmbed(question, session.currentIndex + 1, session.questions.length, session.remainingSeconds);
      await message.edit({ embeds: [updatedEmbed], components: rows });
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
  if (questionType === 'true_false') return TF_CHOICES;
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

  session.answers.push({
    questionText: question.questionText,
    traineeAnswer: null,
    correctAnswer: question.correctAnswer,
    isCorrect: false,
    timedOut: true,
  });
  session.incorrectCount++;

  const resultEmbed = buildAnswerResultEmbed(question, null, false, true, session.currentIndex + 1, session.questions.length);

  try {
    await session.currentMessage.edit({ content: `<@${session.traineeId}>`, embeds: [resultEmbed], components: [] });
  } catch {
    // Message may be gone
  }

  await advanceToNext(session);
}

export async function handleTrainingButton(interaction) {
  const parts = interaction.customId.split(':');
  const answerIndex = parseInt(parts[1], 10);
  const attemptId = parts[2];

  const session = activeSessions.get(interaction.guild.id);

  if (!session) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== session.traineeId) {
    await interaction.reply({ content: '❌ This training session is not assigned to you.', ephemeral: true });
    return;
  }

  if (session.attemptId !== attemptId) {
    await interaction.reply({ content: '❌ This training session is no longer active.', ephemeral: true });
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
    traineeAnswer,
    correctAnswer: question.correctAnswer,
    isCorrect,
    timedOut: false,
  });

  const resultEmbed = buildAnswerResultEmbed(question, traineeAnswer, isCorrect, false, session.currentIndex + 1, session.questions.length);

  try {
    await interaction.update({ embeds: [resultEmbed], components: [] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to update after answer:', err.message);
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
  const totalQuestions = session.questions.length;
  const correctAnswers = session.correctCount;
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
      incorrectAnswers: session.incorrectCount,
      percentage,
      result,
      answers: session.answers,
      completedAt: new Date(),
    });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to save final attempt:', err.message);
  }

  const traineeMention = `<@${session.traineeId}>`;
  const attempt = { correctAnswers, totalQuestions, percentage, result };

  const finalEmbed = buildFinalResultEmbed(attempt, traineeMention);

  try {
    await session.channel.send({ content: `<@${session.traineeId}>`, embeds: [finalEmbed] });
  } catch (err) {
    console.error('[TRAINING SESSION] Failed to send final result:', err.message);
  }

  removeActiveSession(session.guildId);
}

export async function stopTrainingSession(guildId) {
  const session = activeSessions.get(guildId);
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
    await session.channel.send({ content: `⏹️ Training for <@${session.traineeId}> has been stopped and marked as **Cancelled**.` });
  } catch {
    // Channel may be gone
  }

  removeActiveSession(guildId);
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
