import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { RobloxTracker } from '../db/models/RobloxTracker.js';
import { getRobloxUserId, getFollowerCount } from '../utils/robloxApi.js';
import { isDatabaseConnected } from '../db/database.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('track')
  .setDescription('Track a Roblox account until it reaches a follower milestone.')
  .addStringOption((opt) =>
    opt.setName('username').setDescription('The Roblox username to track').setRequired(true),
  )
  .addRoleOption((opt) =>
    opt.setName('role').setDescription('The Discord role to ping when the milestone is reached').setRequired(true),
  )
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('The channel to send the milestone notification in')
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
    await interaction.reply({ content: '❌ You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  // MongoDB must be available
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ Database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const username = interaction.options.getString('username');
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');
  const milestone = interaction.options.getInteger('milestone');

  // Validate milestone is a positive whole number
  if (!milestone || milestone <= 0) {
    await interaction.reply({ content: '❌ The milestone must be a positive whole number greater than 0.', ephemeral: true });
    return;
  }

  // Validate channel is a text channel
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: '❌ Please select a text channel.', ephemeral: true });
    return;
  }

  // Check bot can send messages in the selected channel
  const channelObj = guild.channels.cache.get(channel.id);
  if (!channelObj) {
    await interaction.reply({ content: '❌ That channel no longer exists.', ephemeral: true });
    return;
  }

  const botPermissionsInChannel = channelObj.permissionsFor(guild.members.me);
  if (!botPermissionsInChannel || !botPermissionsInChannel.has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({ content: '❌ I need permission to send messages in that channel.', ephemeral: true });
    return;
  }

  // Look up the Roblox user
  let robloxUser;
  try {
    robloxUser = await getRobloxUserId(username);
  } catch (err) {
    console.error('[TRACK COMMAND] Roblox username lookup failed:', err.message);
    await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    return;
  }

  if (!robloxUser) {
    await interaction.reply({ content: '❌ That Roblox username does not exist.', ephemeral: true });
    return;
  }

  // Get current follower count
  let currentFollowers;
  try {
    currentFollowers = await getFollowerCount(robloxUser.id);
  } catch (err) {
    console.error('[TRACK COMMAND] Follower count lookup failed:', err.message);
    await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    return;
  }

  // If already at or above the milestone, don't create the tracker
  if (currentFollowers >= milestone) {
    await interaction.reply({ content: '❌ This Roblox account has already reached that milestone.', ephemeral: true });
    return;
  }

  // Check for duplicate active tracker for the same Roblox account in this guild
  let existing;
  try {
    existing = await RobloxTracker.findOne({
      guildId: guild.id,
      robloxUserId: robloxUser.id,
      active: true,
    });
  } catch (err) {
    console.error('[TRACK COMMAND] MongoDB query failed:', err.message);
    await interaction.reply({ content: '❌ Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existing) {
    await interaction.reply({ content: '❌ This Roblox account is already being tracked in this server.', ephemeral: true });
    return;
  }

  // Save the tracker in MongoDB
  let tracker;
  try {
    tracker = await RobloxTracker.create({
      guildId: guild.id,
      channelId: channel.id,
      robloxUserId: robloxUser.id,
      robloxUsername: robloxUser.name,
      discordRoleId: role.id,
      targetMilestone: milestone,
      currentFollowers,
      active: true,
      lastCheckedAt: new Date(),
      completedAt: null,
    });
  } catch (err) {
    console.error('[TRACK COMMAND] Failed to save tracker:', err.message);
    await interaction.reply({ content: '❌ Failed to create the tracker. Please try again later.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ Now tracking **${robloxUser.name}** until they reach **${milestone.toLocaleString()}** followers.\n📢 Alerts: ${channel}`,
    ephemeral: true,
  });
}
