import { PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { FollowerStock } from '../db/models/FollowerStock.js';
import { parseAmount, formatAmount, getStockStatus, formatLastUpdated, buildStockEmbed } from '../utils/followerStockHelpers.js';
import { showDeleteConfirmation } from '../components/follower-panel.js';

const PREFIX = 'R!';

/**
 * Handle R! prefix commands for the follower stock system.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled
 */
export async function handleFollowerPrefix(message) {
  const content = message.content.slice(PREFIX.length).trim();
  const lower = content.toLowerCase();

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
 * Check if a member is an administrator.
 */
function isAdmin(member) {
  return member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator);
}

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
