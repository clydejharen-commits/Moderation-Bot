import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TrainingConfig } from '../db/models/TrainingConfig.js';
import { TrainingAttempt } from '../db/models/TrainingAttempt.js';
import { TrainingQuestion } from '../db/models/TrainingQuestion.js';
import {
  registerTrainingSetup,
  buildMainPanelForCommand,
} from '../components/training-setup.js';
import {
  startTrainingSession,
  stopTrainingSession,
  getActiveSession,
  hasActiveSession,
  getActiveSessionByTrainer,
  buildLeaderboardEmbed,
  buildLeaderboardPagination,
  setLeaderboardState,
} from '../components/training-session.js';

export const data = new SlashCommandBuilder()
  .setName('training')
  .setDescription('Staff training system.')
  .addSubcommand((sub) =>
    sub.setName('setup').setDescription('Open the training configuration panel. Administrator only.'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start a training session for a staff member.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member to train.').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('stop')
      .setDescription('Stop an active training session.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member whose training to stop. If omitted, stops your most recent session.').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('results')
      .setDescription('View training results for a staff member.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member to view results for.').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the training leaderboard.'))
  .addSubcommand((sub) =>
    sub
      .setName('remove-history')
      .setDescription('Delete all training data for a staff member.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member whose training data to delete.').setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function isTrainerOrAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config?.trainerRoleId && member.roles.cache.has(config.trainerRoleId)) return true;
  return false;
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  let config;
  try {
    config = await TrainingConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch (err) {
    console.error('[TRAINING CMD] Failed to fetch config:', err.message);
    await interaction.reply({ content: '❌ Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!config) {
    config = {
      guildId: interaction.guild.id,
      trainingChannelId: null,
      trainerRoleId: null,
      passingScore: 80,
      questionsPerTraining: 10,
      questionTimeLimit: 60,
    };
  }

  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction);
      break;
    case 'start':
      await handleStart(interaction, config);
      break;
    case 'stop':
      await handleStop(interaction, config);
      break;
    case 'results':
      await handleResults(interaction, config);
      break;
    case 'leaderboard':
      await handleLeaderboard(interaction, config);
      break;
    case 'remove-history':
      await handleRemoveHistory(interaction, config);
      break;
  }
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  let config;
  try {
    config = await TrainingConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (!config) {
    try {
      config = await TrainingConfig.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {},
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    } catch {
      await interaction.reply({ content: '❌ Database error.', ephemeral: true });
      return;
    }
  }

  registerTrainingSetup(interaction.user.id, interaction.channelId, interaction.guild.id);

  const panelData = buildMainPanelForCommand(config);
  await interaction.reply({ ...panelData, ephemeral: true });
}

async function handleStart(interaction, config) {
  if (!isTrainerOrAdmin(interaction.member, config)) {
    await interaction.reply({ content: '❌ Only the configured **Trainer Role** or Administrators can start training.', ephemeral: true });
    return;
  }

  if (!config.trainingChannelId) {
    await interaction.reply({ content: '❌ No training channel is configured. An administrator needs to run `/training setup` first.', ephemeral: true });
    return;
  }

  if (!config.trainerRoleId) {
    await interaction.reply({ content: '❌ No trainer role is configured. An administrator needs to run `/training setup` first.', ephemeral: true });
    return;
  }

  const trainee = interaction.options.getUser('user');

  if (trainee.bot) {
    await interaction.reply({ content: '❌ You cannot start training for a bot.', ephemeral: true });
    return;
  }

  if (hasActiveSession(interaction.guild.id, trainee.id)) {
    await interaction.reply({ content: '❌ This user already has an active training session. Stop it first with `/training stop`.', ephemeral: true });
    return;
  }

  let questionCount;
  try {
    questionCount = await TrainingQuestion.countDocuments({ guildId: interaction.guild.id });
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (questionCount === 0) {
    await interaction.reply({ content: '❌ No questions have been added. An administrator needs to add questions in `/training setup` first.', ephemeral: true });
    return;
  }

  let trainingChannel;
  try {
    trainingChannel = await interaction.guild.channels.fetch(config.trainingChannelId);
  } catch {
    await interaction.reply({ content: '❌ The configured training channel could not be found. An administrator needs to re-run `/training setup`.', ephemeral: true });
    return;
  }

  if (!trainingChannel) {
    await interaction.reply({ content: '❌ The configured training channel could not be found.', ephemeral: true });
    return;
  }

  const botPerms = trainingChannel.permissionsFor(interaction.guild.members.me);
  if (!botPerms?.has(PermissionFlagsBits.SendMessages) || !botPerms?.has(PermissionFlagsBits.EmbedLinks)) {
    await interaction.reply({ content: '❌ I need **Send Messages** and **Embed Links** permissions in the training channel.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  await startTrainingSession(interaction, config, trainee.id, interaction.user.id);
}

async function handleStop(interaction, config) {
  if (!isTrainerOrAdmin(interaction.member, config)) {
    await interaction.reply({ content: '❌ Only the configured **Trainer Role** or Administrators can stop training.', ephemeral: true });
    return;
  }

  const trainee = interaction.options.getUser('user');

  let targetTraineeId = null;
  if (trainee) {
    targetTraineeId = trainee.id;
  } else {
    const sessionByTrainer = getActiveSessionByTrainer(interaction.guild.id, interaction.user.id);
    if (sessionByTrainer) {
      targetTraineeId = sessionByTrainer.traineeId;
    }
  }

  if (!targetTraineeId) {
    await interaction.reply({ content: '❌ No active training session found. Specify a user or ensure you started a session.', ephemeral: true });
    return;
  }

  const session = getActiveSession(interaction.guild.id, targetTraineeId);
  if (!session) {
    await interaction.reply({ content: `❌ There is no active training session for <@${targetTraineeId}>.`, ephemeral: true });
    return;
  }

  const stopped = await stopTrainingSession(interaction.guild.id, targetTraineeId);
  if (stopped) {
    await interaction.reply({ content: `✅ Training session for <@${targetTraineeId}> stopped and marked as **Cancelled**.`, ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ Failed to stop the training session.', ephemeral: true });
  }
}

async function handleResults(interaction, config) {
  if (!isTrainerOrAdmin(interaction.member, config)) {
    await interaction.reply({ content: '❌ Only the configured **Trainer Role** or Administrators can view training results.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');

  let attempts;
  try {
    attempts = await TrainingAttempt.find({
      guildId: interaction.guild.id,
      traineeId: user.id,
      status: { $in: ['completed', 'cancelled'] },
    }).sort({ createdAt: -1 }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (attempts.length === 0) {
    await interaction.reply({ content: `❌ No training records found for <@${user.id}>.`, ephemeral: true });
    return;
  }

  const completedAttempts = attempts.filter((a) => a.status === 'completed');

  if (completedAttempts.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Training Results')
      .setColor(0x2ECC71)
      .setDescription(`<@${user.id}> has no completed training attempts. All ${attempts.length} attempt(s) were cancelled.`)
      .addFields({ name: 'Total Attempts', value: String(attempts.length), inline: true });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const latest = completedAttempts[0];
  const bestPercentage = Math.max(...completedAttempts.map((a) => a.percentage));
  const avgPercentage = Math.round(
    completedAttempts.reduce((sum, a) => sum + a.percentage, 0) / completedAttempts.length,
  );
  const totalPassed = completedAttempts.filter((a) => a.result === 'passed').length;
  const totalFailed = completedAttempts.filter((a) => a.result === 'failed').length;
  const passRate = Math.round((totalPassed / completedAttempts.length) * 100);

  const embed = new EmbedBuilder()
    .setTitle('Training Results')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Staff', value: `<@${user.id}>`, inline: false },
      { name: 'Latest Score', value: `${latest.correctAnswers}/${latest.totalQuestions} (${latest.percentage}%)`, inline: true },
      { name: 'Best Score', value: `${bestPercentage}%`, inline: true },
      { name: 'Average Score', value: `${avgPercentage}%`, inline: true },
      { name: 'Total Attempts', value: String(completedAttempts.length), inline: true },
      { name: 'Total Passed', value: String(totalPassed), inline: true },
      { name: 'Total Failed', value: String(totalFailed), inline: true },
      { name: 'Pass Rate', value: `${passRate}%`, inline: true },
      { name: 'Last Attempt', value: `<t:${Math.floor(new Date(latest.createdAt).getTime() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'Training System' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLeaderboard(interaction, config) {
  if (!isTrainerOrAdmin(interaction.member, config)) {
    await interaction.reply({ content: '❌ Only the configured **Trainer Role** or Administrators can view the leaderboard.', ephemeral: true });
    return;
  }

  let attempts;
  try {
    attempts = await TrainingAttempt.find({
      guildId: interaction.guild.id,
      status: 'completed',
    }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (attempts.length === 0) {
    await interaction.reply({ content: '❌ No training records found.', ephemeral: true });
    return;
  }

  const userMap = new Map();
  for (const attempt of attempts) {
    const existing = userMap.get(attempt.traineeId);
    if (!existing || attempt.percentage > existing.bestPercentage) {
      userMap.set(attempt.traineeId, {
        traineeId: attempt.traineeId,
        bestPercentage: attempt.percentage,
      });
    }
  }

  const entries = Array.from(userMap.values()).sort((a, b) => b.bestPercentage - a.bestPercentage);

  const pageSize = 10;
  const totalPages = Math.ceil(entries.length / pageSize) || 1;
  const page = 0;

  const embed = await buildLeaderboardEmbed(entries, page, interaction.client);
  const paginationRow = buildLeaderboardPagination(page, totalPages);

  const components = [];
  if (paginationRow) components.push(paginationRow);

  const sentMessage = await interaction.reply({ embeds: [embed], components: components, ephemeral: true, fetchReply: true });

  if (paginationRow) {
    setLeaderboardState(sentMessage.id, entries, page);
  }
}

async function handleRemoveHistory(interaction, config) {
  if (!isTrainerOrAdmin(interaction.member, config)) {
    await interaction.reply({ content: '❌ Only the configured **Trainer Role** or Administrators can remove training history.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');

  let attemptCount;
  try {
    attemptCount = await TrainingAttempt.countDocuments({
      guildId: interaction.guild.id,
      traineeId: user.id,
    });
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  if (attemptCount === 0) {
    await interaction.reply({ content: `❌ No training records found for <@${user.id}>.`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Delete Training History?')
    .setColor(0xE74C3C)
    .setDescription(
      `This will permanently delete **all** training data for <@${user.id}>:\n` +
      `• Scores\n• Best score\n• Average score data\n• All attempts (${attemptCount})\n` +
      `• Passed/Failed attempts\n• Pass rate data\n• Last attempt\n\n` +
      `**Questions, correct answers, and training configuration will NOT be deleted.**\n\n` +
      `This action cannot be undone.`,
    )
    .setFooter({ text: 'You have 60 seconds to confirm.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`training_del_history_confirm:${user.id}`)
      .setLabel('🗑️ Confirm Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('training_del_history_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleRemoveHistoryButton(interaction) {
  const customId = interaction.customId;

  if (customId === 'training_del_history_cancel') {
    await interaction.update({ embeds: [], components: [], content: '❌ Training history deletion cancelled.' });
    return;
  }

  if (customId.startsWith('training_del_history_confirm:')) {
    const traineeId = customId.split(':')[1];

    try {
      await TrainingAttempt.deleteMany({
        guildId: interaction.guild.id,
        traineeId,
      });
    } catch (err) {
      console.error('[TRAINING CMD] Failed to delete history:', err.message);
      await interaction.update({ embeds: [], components: [], content: '❌ Database error. Failed to delete training history.' });
      return;
    }

    await interaction.update({
      embeds: [],
      components: [],
      content: `✅ All training data for <@${traineeId}> has been deleted.\n\`/training results\` for this user will now show no records.`,
    });
  }
}