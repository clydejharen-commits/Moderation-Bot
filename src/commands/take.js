import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffPoints } from '../db/models/StaffPoints.js';
import { isTrainerOrAdmin } from '../components/quest-question.js';
import { updateLeaderboardMessage } from '../utils/leaderboardHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('take')
  .setDescription('Take points from a staff member.')
  .addSubcommand((sub) =>
    sub
      .setName('points')
      .setDescription('Take points from a staff member.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member to take points from.').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt.setName('points').setDescription('Points to take (1 or more).').setRequired(true).setMinValue(1),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  let config;
  try {
    config = await QuestConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch {
    await interaction.reply({ content: '❌ Database error.', ephemeral: true });
    return;
  }

  const isTrainer = await isTrainerOrAdmin(interaction.member, config);
  if (!isTrainer) {
    await interaction.reply({ content: '❌ Only configured Trainers or Administrators can take points.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const points = interaction.options.getInteger('points');

  if (!user) {
    await interaction.reply({ content: '❌ You must specify a user.', ephemeral: true });
    return;
  }

  if (user.bot) {
    await interaction.reply({ content: '❌ You cannot take points from a bot.', ephemeral: true });
    return;
  }

  if (!points || points < 1) {
    await interaction.reply({ content: '❌ Points must be a positive whole number.', ephemeral: true });
    return;
  }

  let updated;
  try {
    updated = await StaffPoints.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: user.id },
      { $inc: { points: -points } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[QUEST] Failed to take points:', err.message);
    await interaction.reply({ content: '❌ Database error. Failed to take points.', ephemeral: true });
    return;
  }

  if (updated.points < 0) {
    try {
      await StaffPoints.findOneAndUpdate(
        { guildId: interaction.guild.id, userId: user.id },
        { points: 0 },
      );
    } catch {
      // non-fatal
    }
  }

  await updateLeaderboardMessage(interaction.client, interaction.guild.id);

  await interaction.reply({ content: `✅ Took **${points}** point(s) from <@${user.id}>.`, ephemeral: true });
}
