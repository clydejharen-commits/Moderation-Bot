import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { AutoRemoveConfig } from '../db/models/AutoRemoveConfig.js';
import { isDatabaseConnected } from '../db/database.js';
import { removeUnverifiedRole } from '../utils/autoRemoveHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('auto-remove')
  .setDescription('Automatically remove the Unverified role from members who have the Verified role.')
  .addRoleOption((opt) =>
    opt
      .setName('verified')
      .setDescription('The Verified role — members who have this should not keep the Unverified role.')
      .setRequired(true),
  )
  .addRoleOption((opt) =>
    opt
      .setName('unverified')
      .setDescription('The Unverified role to remove from verified members.')
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const { guild } = interaction;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  const verifiedRole = interaction.options.getRole('verified');
  const unverifiedRole = interaction.options.getRole('unverified');

  if (verifiedRole.id === unverifiedRole.id) {
    await interaction.reply({ content: '❌ The Verified and Unverified roles must be different.', ephemeral: true });
    return;
  }

  if (unverifiedRole.managed) {
    await interaction.reply({ content: '❌ The Unverified role is managed by an integration and cannot be removed by the bot.', ephemeral: true });
    return;
  }

  if (unverifiedRole.position >= guild.members.me.roles.highest.position) {
    await interaction.reply({
      content: '❌ The Unverified role is higher than or equal to my highest role. I cannot remove it from members.',
      ephemeral: true,
    });
    return;
  }

  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: '❌ I need the **Manage Roles** permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ Database is not connected. Configuration cannot be saved.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await AutoRemoveConfig.findOneAndUpdate(
      { guildId: guild.id },
      { guildId: guild.id, verifiedRoleId: verifiedRole.id, unverifiedRoleId: unverifiedRole.id },
      { upsert: true, new: true },
    );
  } catch (err) {
    console.error('[AUTO-REMOVE ERROR] Failed to save config:', err.message);
    await interaction.editReply({ content: '❌ Failed to save configuration to the database.' });
    return;
  }

  let removedCount = 0;
  let checkedCount = 0;
  let failedCount = 0;

  try {
    const members = await guild.members.fetch();
    checkedCount = members.size;

    for (const member of members.values()) {
      if (member.roles.cache.has(verifiedRole.id) && member.roles.cache.has(unverifiedRole.id)) {
        const success = await removeUnverifiedRole(member, unverifiedRole.id);
        if (success) {
          removedCount++;
        } else {
          failedCount++;
        }
      }
    }
  } catch (err) {
    console.error('[AUTO-REMOVE ERROR] Failed to fetch members:', err.message);
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Auto-Remove Configured')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Verified Role', value: `<@&${verifiedRole.id}>`, inline: true },
      { name: 'Unverified Role', value: `<@&${unverifiedRole.id}>`, inline: true },
      { name: 'Members Checked', value: String(checkedCount), inline: true },
      { name: 'Unverified Removed', value: String(removedCount), inline: true },
    );

  if (failedCount > 0) {
    embed.addFields({ name: 'Failed', value: String(failedCount), inline: true });
    embed.setColor(0xF39C12);
    embed.setFooter({ text: 'Some members could not be processed. Check role hierarchy and permissions.' });
  }

  embed.setDescription('The Unverified role will automatically be removed from any member who receives the Verified role.');

  await interaction.editReply({ content: '', embeds: [embed] });
}
