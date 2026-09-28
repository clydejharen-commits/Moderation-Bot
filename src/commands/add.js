import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffPoints } from '../db/models/StaffPoints.js';
import { isTrainerOrAdmin } from '../components/quest-question.js';

export const data = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Add points to a staff member.')
  .addSubcommand((sub) =>
    sub
      .setName('points')
      .setDescription('Add points to a staff member.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The staff member to add points to.').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt.setName('points').setDescription('Points to add (1 or more).').setRequired(true).setMinValue(1),
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
    await interaction.reply({ content: '❌ Only configured Trainers or Administrators can add points.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const points = interaction.options.getInteger('points');

  if (!user) {
    await interaction.reply({ content: '❌ You must specify a user.', ephemeral: true });
    return;
  }

  if (user.bot) {
    await interaction.reply({ content: '❌ You cannot add points to a bot.', ephemeral: true });
    return;
  }

  if (!points || points < 1) {
    await interaction.reply({ content: '❌ Points must be a positive whole number.', ephemeral: true });
    return;
  }

  try {
    await StaffPoints.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: user.id },
      { $inc: { points } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[QUEST] Failed to add points:', err.message);
    await interaction.reply({ content: '❌ Database error. Failed to add points.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Added **${points}** point(s) to <@${user.id}>.`, ephemeral: true });
}
