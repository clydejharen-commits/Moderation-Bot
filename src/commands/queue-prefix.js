import { PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { ServiceQueue } from '../db/models/ServiceQueue.js';
import { ServiceQueueEntry } from '../db/models/ServiceQueueEntry.js';
import { getSortedEntries, updateQueuePanel } from '../utils/queueHelpers.js';

/**
 * Handle R! prefix commands for the service queue system.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled
 */
export async function handleQueuePrefix(message) {
  const content = message.content.slice(2).trim();
  const lower = content.toLowerCase();

  if (lower.startsWith('add ')) {
    await handleAdd(message, content.slice(4).trim());
    return true;
  }

  if (lower === 'next') {
    await handleNext(message);
    return true;
  }

  if (lower === 'end queue') {
    await handleEndQueue(message);
    return true;
  }

  return false;
}

/**
 * Check if a member is an administrator.
 */
function isAdmin(member) {
  return !!member && !!member.permissions && member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * R! Add <user> <followers>
 */
async function handleAdd(message, args) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  // Parse: <user> <followers>
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await message.reply('\u274C Please provide a user and follower amount. Example: `R! Add @User1 5000`');
    return;
  }

  const followersStr = parts.pop();
  const userMention = parts.join(' ');

  // Extract user ID from mention or raw ID
  const mentionMatch = userMention.match(/^<@!?(\d+)>$/);
  const userId = mentionMatch ? mentionMatch[1] : (/^\d+$/.test(userMention) ? userMention : null);

  if (!userId) {
    await message.reply('\u274C Please mention a valid user or provide a user ID. Example: `R! Add @User1 5000`');
    return;
  }

  const followers = Number(followersStr);
  if (!Number.isInteger(followers) || followers <= 0) {
    await message.reply('\u274C The follower amount must be a positive whole number (e.g. 5000). Do not use formats like 5k or 5,000.');
    return;
  }

  // Load the queue config
  let queueDoc;
  try {
    queueDoc = await ServiceQueue.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[QUEUE ADD] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!queueDoc || queueDoc.status !== 'active') {
    await message.reply('\u274C No queue is currently configured.');
    return;
  }

  // Check for duplicate entry
  let existing;
  try {
    existing = await ServiceQueueEntry.findOne({ guildId: message.guild.id, discordUserId: userId });
  } catch (err) {
    console.error('[QUEUE ADD] Duplicate check failed:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (existing) {
    await message.reply('\u274C This user is already in the queue.');
    return;
  }

  // Determine the next position (end of the queue)
  let nextPosition;
  try {
    const count = await ServiceQueueEntry.countDocuments({ guildId: message.guild.id });
    nextPosition = count + 1;
  } catch (err) {
    console.error('[QUEUE ADD] Count failed:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  // Create the entry — the unique index prevents race conditions on duplicate adds
  try {
    await ServiceQueueEntry.create({
      guildId: message.guild.id,
      discordUserId: userId,
      followers,
      position: nextPosition,
    });
  } catch (err) {
    if (err.code === 11000) {
      await message.reply('\u274C This user is already in the queue.');
      return;
    }
    console.error('[QUEUE ADD] Create failed:', err.message);
    await message.reply('\u274C Failed to add the user to the queue. Please try again later.');
    return;
  }

  // Update the panel
  const entries = await getSortedEntries(message.guild.id);
  await updateQueuePanel(message.client, queueDoc, entries);

  await message.reply(`\u2705 <@${userId}> added to the queue at position **#${nextPosition}** with **${followers.toLocaleString('en-US')}** followers.`);
}

/**
 * R! Next — remove the person at #1 and shift everyone up.
 */
async function handleNext(message) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  let queueDoc;
  try {
    queueDoc = await ServiceQueue.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[QUEUE NEXT] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!queueDoc || queueDoc.status !== 'active') {
    await message.reply('\u274C No queue is currently configured.');
    return;
  }

  let entries;
  try {
    entries = await ServiceQueueEntry.find({ guildId: message.guild.id }).sort({ position: 1 });
  } catch (err) {
    console.error('[QUEUE NEXT] Fetch failed:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!entries || entries.length === 0) {
    await message.reply('\u274C The queue is currently empty.');
    return;
  }

  const first = entries[0];

  try {
    await ServiceQueueEntry.deleteOne({ _id: first._id });
  } catch (err) {
    console.error('[QUEUE NEXT] Delete failed:', err.message);
    await message.reply('\u274C Failed to remove the current entry. Please try again later.');
    return;
  }

  // Shift remaining entries up by one position
  const remaining = entries.slice(1);
  if (remaining.length > 0) {
    try {
      const ops = remaining.map((entry, i) => ({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { position: i + 1 } },
        },
      }));
      await ServiceQueueEntry.bulkWrite(ops);
    } catch (err) {
      console.error('[QUEUE NEXT] Reorder failed:', err.message);
      await message.reply('\u274C Failed to reorder the queue. Please try again later.');
      return;
    }
  }

  // Update the panel
  const updatedEntries = await getSortedEntries(message.guild.id);
  await updateQueuePanel(message.client, queueDoc, updatedEntries);

  await message.reply(`\u2705 <@${first.discordUserId}> has been removed from the queue (completed).`);
}

/**
 * R! End Queue — end the active queue and clear all entries.
 */
async function handleEndQueue(message) {
  if (!isAdmin(message.member)) {
    await message.reply('\u274C You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return;
  }

  let queueDoc;
  try {
    queueDoc = await ServiceQueue.findOne({ guildId: message.guild.id });
  } catch (err) {
    console.error('[QUEUE END] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return;
  }

  if (!queueDoc) {
    await message.reply('\u274C No queue is currently configured.');
    return;
  }

  // Remove all entries from the queue
  try {
    await ServiceQueueEntry.deleteMany({ guildId: message.guild.id });
  } catch (err) {
    console.error('[QUEUE END] Clear entries failed:', err.message);
    await message.reply('\u274C Failed to clear the queue. Please try again later.');
    return;
  }

  // Mark the queue as ended
  queueDoc.status = 'ended';
  try {
    await queueDoc.save();
  } catch (err) {
    console.error('[QUEUE END] Save failed:', err.message);
    await message.reply('\u274C Failed to update the queue status. Please try again later.');
    return;
  }

  // Update the panel to show the queue has ended
  await updateQueuePanel(message.client, queueDoc, []);

  await message.reply('\u2705 The queue has been ended and all members have been removed.');
}
