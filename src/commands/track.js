import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { RobloxTracker } from '../db/models/RobloxTracker.js';
import { isDatabaseConnected } from '../db/database.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('track')
  .setDescription('Configure the Roblox follower tracker settings for this server.')
  .addRoleOption((opt) =>
    opt.setName('role').setDescription('The Discord role to mention when the milestone is reached').setRequired(true),
  )
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('The channel where the tracker embed and milestone notification will be sent')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('milestone')
      .setDescription('The target follower count (e.g. 100000)')
      .setRequired(true)
      .setMinValue(1),
  );

export async function execute(interaction) {
  const { guild, member, user } = interaction;

  // Admin-only — Administrator permission OR authorized user
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isAuthorized = user.id === AUTHORIZED_USER_ID;

  if (!isAdmin && !isAuthorized) {
    await interaction.reply({ content: '\u274C You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  // MongoDB must be available
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C Database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');
  const milestone = interaction.options.getInteger('milestone');

  // Validate milestone is a positive whole number
  if (!milestone || milestone <= 0) {
    await interaction.reply({ content: '\u274C The milestone must be a positive whole number greater than 0.', ephemeral: true });
    return;
  }

  // Validate channel is a text channel
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: '\u274C Please select a text channel.', ephemeral: true });
    return;
  }

  // Check bot can send messages in the selected channel
  const channelObj = guild.channels.cache.get(channel.id);
  if (!channelObj) {
    await interaction.reply({ content: '\u274C That channel no longer exists.', ephemeral: true });
    return;
  }

  const botPermissionsInChannel = channelObj.permissionsFor(guild.members.me);
  if (!botPermissionsInChannel || !botPermissionsInChannel.has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({ content: '\u274C I need permission to send messages in that channel.', ephemeral: true });
    return;
  }

  // Save or update the track configuration for this guild.
  // We store it as a RobloxTracker document with active: false until
  // R! Track <username> creates the actual tracker.
  let config;
  try {
    config = await RobloxTracker.findOne({ guildId: guild.id, isConfig: true });
  } catch (err) {
    console.error('[TRACK COMMAND] MongoDB query failed:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (config) {
    config.discordRoleId = role.id;
    config.channelId = channel.id;
    config.targetMilestone = milestone;
    try {
      await config.save();
    } catch (err) {
      console.error('[TRACK COMMAND] Failed to update config:', err.message);
      await interaction.reply({ content: '\u274C Failed to save configuration. Please try again later.', ephemeral: true });
      return;
    }
  } else {
    try {
      await RobloxTracker.create({
        guildId: guild.id,
        channelId: channel.id,
        discordRoleId: role.id,
        targetMilestone: milestone,
        isConfig: true,
        active: false,
        robloxUserId: '0',
        robloxUsername: '',
        currentFollowers: 0,
      });
    } catch (err) {
      console.error('[TRACK COMMAND] Failed to create config:', err.message);
      await interaction.reply({ content: '\u274C Failed to save configuration. Please try again later.', ephemeral: true });
      return;
    }
  }

  await interaction.reply({
    content:
      `\u2705 **Tracker configuration saved for this server.**\n` +
      `\uD83C\uDFAF Milestone: **${milestone.toLocaleString()}** followers\n` +
      `\uD83D\uDC65 Role: <@&${role.id}>\n` +
      `\uD83D\uDCC1 Channel: ${channel}\n\n` +
      `Use \`R! Track <username>\` to start tracking a Roblox account.`,
    ephemeral: true,
  });
}
