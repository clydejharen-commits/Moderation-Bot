import { PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { FollowerStock } from '../db/models/FollowerStock.js';
import { RobloxTracker } from '../db/models/RobloxTracker.js';
import { parseAmount, formatAmount, buildStockEmbed } from '../utils/followerStockHelpers.js';
import { showDeleteConfirmation } from '../components/follower-panel.js';
import { getRobloxUserId, getFollowerCount } from '../utils/robloxApi.js';
import { buildTrackerEmbed, buildTrackerComponents } from '../utils/trackerEmbed.js';

const PREFIX = 'R!';

const AUTHORIZED_USER_ID = '1505729763296411891';

/**
 * Handle R! prefix commands for the follower stock system and tracker.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled
 */
export async function handleFollowerPrefix(message) {
  const content = message.content.slice(PREFIX.length).trim();
  const lower = content.toLowerCase();

  // R! Track <username>  /  R! Track stop
  if (lower.startsWith('track ')) {
    await handleTrack(message, content.slice(6).trim());
    return true;
  }

  if (lower === 'track') {
    await message.reply('\u274C Please provide a Roblox username. Example: `R! Track builderman`');
    return true;
  }

  if (lower.startsWith('take ')) {
    await handleTake(message, content.slice(5).trim());
    return true;
  }

  if (lower.startsWith('add ')) {
    await handleAdd(message, content.slice(4).trim());
    return true;
  }

  if (lower === 'stock delete') {
    await handleStockDelete(message);
    return true;
  }

  return false;
}

/**
 * Check if a member is an administrator or the authorized user.
 */
function isAdmin(member) {
  if (!member || !member.permissions || !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return member?.user?.id === AUTHORIZED_USER_ID;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────
 *  R! Track <username>  /  R! Track stop
 * ──────────────────────────────────────────────────────────── */

async function handleTrack(message, args) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  const lower = args.toLowerCase().trim();

  // R! Track stop
  if (lower === 'stop') {
    await handleTrackStop(message);
    return;
  }

  // R! Track <username>
  const username = args.trim();
  if (!username) {
    await message.reply('\u274C Please provide a Roblox username. Example: `R! Track builderman`');
    return;
  }

  await handleTrackUsername(message, username);
}

/**
 * R! Track <username> — start tracking a Roblox account.
 */
async function handleTrackUsername(message, username) {
  const { guild } = message;

  // Load the /track configuration for this guild
  let config;
  try {
    config = await RobloxTracker.findOne({ guildId: guild.id, isConfig: true });
  } catch (err) {
    console.error('[TRACK PREFIX] Failed to load config:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!config) {
    await message.reply('\u274C No tracker configuration found. Please use `/track` first to configure the role, channel, and milestone.');
    return;
  }

  // Look up the Roblox user
  let robloxUser;
  try {
    robloxUser = await getRobloxUserId(username);
  } catch (err) {
    console.error('[TRACK PREFIX] Roblox username lookup failed:', err.message);
    await message.reply(`\u274C ${err.message}`);
    return;
  }

  if (!robloxUser) {
    await message.reply(`\u274C Roblox username **${username}** does not exist.`);
    return;
  }

  // Get current follower count
  let currentFollowers;
  try {
    currentFollowers = await getFollowerCount(robloxUser.id);
  } catch (err) {
    console.error('[TRACK PREFIX] Follower count lookup failed:', err.message);
    await message.reply(`\u274C ${err.message}`);
    return;
  }

  // If already at or above the milestone, don't create the tracker
  if (currentFollowers >= config.targetMilestone) {
    await message.reply(
      `\u274C **${robloxUser.name}** already has **${currentFollowers.toLocaleString()}** followers, which meets or exceeds the configured milestone of **${config.targetMilestone.toLocaleString()}**.`,
    );
    return;
  }

  // Check for duplicate active tracker for the same Roblox account in this guild
  let existing;
  try {
    existing = await RobloxTracker.findOne({
      guildId: guild.id,
      robloxUserId: robloxUser.id,
      active: true,
      isConfig: { $ne: true },
    });
  } catch (err) {
    console.error('[TRACK PREFIX] MongoDB query failed:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (existing) {
    await message.reply(`\u274C **${robloxUser.name}** is already being tracked in this server.`);
    return;
  }

  // Fetch the channel — fall back to guild cache if fetch fails
  let channel;
  try {
    channel = await guild.channels.fetch(config.channelId).catch(() => null);
  } catch {
    channel = null;
  }

  if (!channel) {
    await message.reply('\u274C The configured channel no longer exists. Please reconfigure with `/track`.');
    return;
  }

  // Check bot permissions in the channel
  const botPerms = channel.permissionsFor(guild.members.me);
  if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) {
    await message.reply('\u274C I lack permission to send messages in the configured channel. Please reconfigure with `/track`.');
    return;
  }

  // Create the tracker document
  let tracker;
  try {
    tracker = await RobloxTracker.create({
      guildId: guild.id,
      channelId: config.channelId,
      robloxUserId: robloxUser.id,
      robloxUsername: robloxUser.name,
      discordRoleId: config.discordRoleId,
      targetMilestone: config.targetMilestone,
      currentFollowers,
      active: true,
      isConfig: false,
      lastCheckedAt: new Date(),
      completedAt: null,
    });
  } catch (err) {
    console.error('[TRACK PREFIX] Failed to create tracker:', err.message);
    await message.reply('\u274C Failed to create the tracker. Please try again later.');
    return;
  }

  // Send the tracker embed to the configured channel
  const embed = buildTrackerEmbed(tracker);
  const components = buildTrackerComponents(tracker.robloxUserId);

  let trackerMessage;
  try {
    trackerMessage = await channel.send({ embeds: [embed], components: [components] });
  } catch (err) {
    console.error('[TRACK PREFIX] Failed to send tracker embed:', err.message);
    await message.reply('\u274C Failed to send the tracker embed to the channel. Please check my permissions and try again.');
    // Clean up the tracker since we couldn't send the embed
    await RobloxTracker.findByIdAndDelete(tracker._id).catch(() => {});
    return;
  }

  // Save the message ID
  tracker.messageId = trackerMessage.id;
  try {
    await tracker.save();
  } catch (err) {
    console.error('[TRACK PREFIX] Failed to save messageId:', err.message);
  }

  await message.reply(
    `\u2705 Now tracking **${robloxUser.name}** until they reach **${config.targetMilestone.toLocaleString()}** followers.\n` +
    `\uD83D\uDCC1 Tracker embed sent to ${channel}.`,
  );
}

/**
 * R! Track stop — stop the active tracker for this guild.
 */
async function handleTrackStop(message) {
  const { guild } = message;

  let tracker;
  try {
    tracker = await RobloxTracker.findOne({ guildId: guild.id, active: true, isConfig: { $ne: true } });
  } catch (err) {
    console.error('[TRACK STOP] MongoDB query failed:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!tracker) {
    await message.reply('\u274C There is no active tracker.');
    return;
  }

  tracker.active = false;
  try {
    await tracker.save();
  } catch (err) {
    console.error('[TRACK STOP] Failed to save tracker:', err.message);
    await message.reply('\u274C Failed to stop the tracker. Please try again later.');
    return;
  }

  await message.reply('\u2705 The active tracker has been stopped. The tracker record has been kept in the database.');
}

/* ─────────────────────────────────────────────────────────────
 *  Follower Stock commands (unchanged)
 * ──────────────────────────────────────────────────────────── */

/**
 * R!take <amount>
 */
async function handleTake(message, amountStr) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  if (!amountStr) {
    await message.reply('\u274C Please provide an amount. Example: `R!take 100`');
    return;
  }

  const amount = parseAmount(amountStr);
  if (amount === null) {
    await message.reply('\u274C Invalid amount. Use a positive number, e.g. `100`, `1k`, `2.5k`.');
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[FOLLOWER TAKE] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!stockDoc) {
    await message.reply('\u274C No Followers Stock system is configured for this server.');
    return;
  }

  if (amount > stockDoc.currentStock) {
    await message.reply(`\u274C Not enough stock.\nAvailable: ${formatAmount(stockDoc.currentStock)}\nRequested: ${formatAmount(amount)}`);
    return;
  }

  const before = stockDoc.currentStock;
  stockDoc.currentStock -= amount;
  stockDoc.lastUpdated = new Date();
  try {
    await stockDoc.save();
  } catch (err) {
    console.error('[FOLLOWER TAKE] Save failed:', err.message);
    await message.reply('\u274C Failed to update stock.');
    return;
  }

  await updateStockMessage(message.client, stockDoc);
  await message.reply(`\u2705 ${formatAmount(before)} \u2192 ${formatAmount(stockDoc.currentStock)}`);
}

/**
 * R!add <amount>
 */
async function handleAdd(message, amountStr) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  if (!amountStr) {
    await message.reply('\u274C Please provide an amount. Example: `R!add 500`');
    return;
  }

  const amount = parseAmount(amountStr);
  if (amount === null) {
    await message.reply('\u274C Invalid amount. Use a positive number, e.g. `100`, `1k`, `2.5k`.');
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[FOLLOWER ADD] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!stockDoc) {
    await message.reply('\u274C No Followers Stock system is configured for this server.');
    return;
  }

  const before = stockDoc.currentStock;
  stockDoc.currentStock += amount;
  stockDoc.lastUpdated = new Date();
  try {
    await stockDoc.save();
  } catch (err) {
    console.error('[FOLLOWER ADD] Save failed:', err.message);
    await message.reply('\u274C Failed to update stock.');
    return;
  }

  await updateStockMessage(message.client, stockDoc);
  await message.reply(`\u2705 ${formatAmount(before)} \u2192 ${formatAmount(stockDoc.currentStock)}`);
}

/**
 * R!stock delete
 */
async function handleStockDelete(message) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[FOLLOWER DELETE] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!stockDoc) {
    await message.reply('\u274C No Followers Stock system is configured for this server.');
    return;
  }

  await showDeleteConfirmation(message, stockDoc);
}

/**
 * Update the existing stock message in place.
 */
async function updateStockMessage(client, stockDoc) {
  if (!stockDoc.channelId || !stockDoc.messageId) return;

  try {
    const channel = await client.channels.fetch(stockDoc.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(stockDoc.messageId).catch(() => null);
    if (!message) return;

    const embed = buildStockEmbed(stockDoc);
    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error('[FOLLOWER STOCK] Failed to update message:', err.message);
  }
}

/**
 * Run the daily reset check for all guilds.
 * Called on bot startup and by the daily timer.
 * @param {import('discord.js').Client} client
 */
export async function runDailyReset(client) {
  if (!isDatabaseConnected()) return;

  const today = new Date().toISOString().slice(0, 10);

  let stocks;
  try {
    stocks = await FollowerStock.find({ lastResetDate: { $ne: today } });
  } catch (err) {
    console.error('[FOLLOWER RESET] DB query failed:', err.message);
    return;
  }

  for (const stockDoc of stocks) {
    try {
      stockDoc.currentStock = stockDoc.startingStock;
      stockDoc.lastUpdated = new Date();
      stockDoc.lastResetDate = today;
      await stockDoc.save();
      await updateStockMessage(client, stockDoc);
      console.log(`[FOLLOWER RESET] Reset stock for guild ${stockDoc.guildId} to ${formatAmount(stockDoc.startingStock)}`);
    } catch (err) {
      console.error(`[FOLLOWER RESET] Failed for guild ${stockDoc.guildId}:`, err.message);
    }
  }
}

/**
 * Schedule the daily reset timer for 8:00 AM UTC+8.
 * @param {import('discord.js').Client} client
 */
export function scheduleDailyReset(client) {
  // 8:00 AM UTC+8 = 0:00 AM UTC
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0); // Next midnight UTC
    const delay = next.getTime() - now.getTime();

    setTimeout(async () => {
      await runDailyReset(client);
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}
