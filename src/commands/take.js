import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { StaffMember } from '../db/models/StaffMember.js';
import {
  getQuestConfig,
  isTrainerOrAdmin,
  recalculateStaffMember,
  statusLabel,
} from '../utils/questHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('take')
  .setDescription('Take points from a staff member.')
  .addSubcommand((sub) =>
    sub
      .setName('points')
      .setDescription('Subtract points from a user and recalculate Promote Coins / status.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The user to take points from.').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('points')
          .setDescription('The positive whole-number amount of points to subtract.')
          .setRequired(true)
          .setMinValue(1),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'points') return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const cfg = await getQuestConfig(interaction.guild.id);
  if (!cfg) {
    await interaction.reply({ content: '\u274C Failed to load the Quest configuration. Please try again later.', ephemeral: true });
    return;
  }

  if (!isTrainerOrAdmin(interaction.member, cfg)) {
    await interaction.reply({ content: '\u274C Only **Administrators** and configured **Trainers** can use this command.', ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const pointsToTake = interaction.options.getInteger('points', true);

  if (pointsToTake <= 0) {
    await interaction.reply({ content: '\u274C The points amount must be a positive whole number.', ephemeral: true });
    return;
  }

  let staff;
  try {
    staff = await StaffMember.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: targetUser.id },
      { username: targetUser.username },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[TAKE POINTS] Failed to fetch staff member:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  staff.totalPoints -= pointsToTake;
  try {
    await staff.save();
  } catch (err) {
    console.error('[TAKE POINTS] Failed to save points:', err.message);
    await interaction.reply({ content: '\u274C Failed to save points. Please try again later.', ephemeral: true });
    return;
  }

  const recalculated = await recalculateStaffMember(
    interaction.guild.id,
    targetUser.id,
    targetUser.username,
    cfg,
  );

  if (!recalculated) {
    await interaction.reply({ content: '\u274C Points were subtracted but the status recalculation failed. Please try again later.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `\u2705 Took **${pointsToTake}** point(s) from <@${targetUser.id}>.\n**Total Points:** ${recalculated.totalPoints}\n**Promote Coins:** ${recalculated.promoteCoins}\n**Status:** ${statusLabel(recalculated.status)}`,
    ephemeral: false,
  });
}
