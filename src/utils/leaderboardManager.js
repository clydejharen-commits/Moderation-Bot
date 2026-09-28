import { EmbedBuilder } from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffMember } from '../db/models/StaffMember.js';
import { getQuestConfig, recalculateAllStaff, buildLeaderboardText, statusLabel } from './questHelpers.js';

async function getLeaderboardData(guildId, cfg) {
  let staffMembers;
  try {
    staffMembers = await StaffMember.find({ guildId }).sort({ totalPoints: -1 }).lean();
  } catch (err) {
    console.error('[LEADERBOARD] Failed to fetch staff members:', err.message);
    return [];
  }

  if (!staffMembers || staffMembers.length === 0) return [];

  const recalculated = await recalculateAllStaff(guildId, cfg);
  recalculated.sort((a, b) => b.totalPoints - a.totalPoints);
  return recalculated;
}

function buildLeaderboardEmbed(staffMembers, cfg) {
  const text = buildLeaderboardText(staffMembers, cfg);
  return new EmbedBuilder()
    .setTitle('\u{1F3C6} Staff Leaderboard')
    .setColor(0x2B6CB0)
    .setDescription(text.slice(0, 4000))
    .setFooter({ text: `Total staff: ${staffMembers.length}` })
    .setTimestamp();
}

export async function updateLeaderboard(client, guildId) {
  if (!guildId) return;

  const cfg = await getQuestConfig(guildId);
  if (!cfg) return;

  if (!cfg.leaderboardChannelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  let channel;
  try {
    channel = await guild.channels.fetch(cfg.leaderboardChannelId).catch(() => null);
  } catch (err) {
    console.error('[LEADERBOARD] Failed to fetch channel:', err.message);
  }
  if (!channel) {
    console.warn('[LEADERBOARD] Leaderboard channel not found, clearing config.');
    try {
      await QuestConfig.updateOne({ guildId }, { $unset: { leaderboardMessageId: '' }, leaderboardChannelId: '' });
    } catch {
      // ignore
    }
    return;
  }

  const staffMembers = await getLeaderboardData(guildId, cfg);
  if (staffMembers.length === 0) return;

  const embed = buildLeaderboardEmbed(staffMembers, cfg);

  let messageId = cfg.leaderboardMessageId || '';

  if (messageId) {
    try {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] });
        return;
      }
    } catch (err) {
      console.warn('[LEADERBOARD] Existing message not found, creating new one:', err.message);
    }
  }

  // Create a new leaderboard message
  try {
    const newMsg = await channel.send({ embeds: [embed] });
    messageId = newMsg.id;
    await QuestConfig.updateOne({ guildId }, { leaderboardMessageId: messageId });
    console.log('[LEADERBOARD] Created new leaderboard message:', messageId);
  } catch (err) {
    console.error('[LEADERBOARD] Failed to send leaderboard message:', err.message);
  }
}

export async function updateAllLeaderboards(client) {
  let configs;
  try {
    configs = await QuestConfig.find({ leaderboardChannelId: { $ne: '' } }).lean();
  } catch (err) {
    console.error('[LEADERBOARD] Failed to fetch configs for update:', err.message);
    return;
  }

  for (const cfg of configs) {
    await updateLeaderboard(client, cfg.guildId);
  }
}

export async function setLeaderboardChannel(client, guildId, channelId) {
  try {
    await QuestConfig.updateOne(
      { guildId },
      { leaderboardChannelId: channelId, leaderboardMessageId: '' },
      { upsert: true },
    );
  } catch (err) {
    console.error('[LEADERBOARD] Failed to save leaderboard channel:', err.message);
    return false;
  }

  await updateLeaderboard(client, guildId);
  return true;
}
