import { EmbedBuilder } from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffPoints } from '../db/models/StaffPoints.js';

export function calcPromoteCoins(points, pointsPerCoin) {
  if (!pointsPerCoin || pointsPerCoin < 1) return 0;
  return Math.floor(points / pointsPerCoin);
}

export function getStatus(coins, coinsForPromotion, coinsForDemotion) {
  if (coins >= coinsForPromotion) return 'promotion';
  if (coins < coinsForDemotion) return 'demotion';
  return null;
}

export function statusEmoji(status) {
  if (status === 'promotion') return '🟢 Promotion';
  if (status === 'demotion') return '🔴 Demotion';
  return '—';
}

async function resolveUsername(userId, client) {
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch {
    return userId;
  }
}

export async function buildLeaderboardEmbed(client, guildId) {
  let config;
  try {
    config = await QuestConfig.findOne({ guildId }).lean();
  } catch {
    return null;
  }

  if (!config) {
    config = {
      pointsPerCoin: 5,
      coinsForPromotion: 15,
      coinsForDemotion: -5,
    };
  }

  let pointsDocs;
  try {
    pointsDocs = await StaffPoints.find({ guildId }).lean();
  } catch {
    return null;
  }

  const entries = pointsDocs
    .map((doc) => {
      const coins = calcPromoteCoins(doc.points, config.pointsPerCoin);
      const status = getStatus(coins, config.coinsForPromotion, config.coinsForDemotion);
      return {
        userId: doc.userId,
        points: doc.points,
        coins,
        status,
      };
    })
    .sort((a, b) => b.points - a.points);

  const lines = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rank = i + 1;
    const username = await resolveUsername(entry.userId, client);
    lines.push(
      `${rank}. @${username} - ${entry.points} points - ${entry.coins} Promote Coins - ${statusEmoji(entry.status)}`,
    );
  }

  if (lines.length === 0) {
    lines.push('No staff members yet.');
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Staff Leaderboard')
    .setColor(0xF1C40F)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Points Per Coin: ${config.pointsPerCoin} | Promotion: ${config.coinsForPromotion} | Demotion: ${config.coinsForDemotion}`,
    })
    .setTimestamp();

  return embed;
}

export async function updateLeaderboardMessage(client, guildId) {
  let config;
  try {
    config = await QuestConfig.findOne({ guildId }).lean();
  } catch {
    return false;
  }

  if (!config || !config.leaderboardChannelId || !config.leaderboardMessageId) {
    return false;
  }

  let channel;
  try {
    channel = await client.channels.fetch(config.leaderboardChannelId);
  } catch {
    return false;
  }

  if (!channel) return false;

  let message;
  try {
    message = await channel.messages.fetch(config.leaderboardMessageId);
  } catch {
    return false;
  }

  const embed = await buildLeaderboardEmbed(client, guildId);
  if (!embed) return false;

  try {
    await message.edit({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

export async function saveLeaderboardMessageId(guildId, channelId, messageId) {
  try {
    await QuestConfig.findOneAndUpdate(
      { guildId },
      { leaderboardChannelId: channelId, leaderboardMessageId: messageId },
      { upsert: true, setDefaultsOnInsert: true },
    );
    return true;
  } catch {
    return false;
  }
}

export async function isLeaderboardMessageDeleted(client, guildId) {
  let config;
  try {
    config = await QuestConfig.findOne({ guildId }).lean();
  } catch {
    return true;
  }

  if (!config || !config.leaderboardChannelId || !config.leaderboardMessageId) {
    return true;
  }

  let channel;
  try {
    channel = await client.channels.fetch(config.leaderboardChannelId);
  } catch {
    return true;
  }

  if (!channel) return true;

  try {
    await channel.messages.fetch(config.leaderboardMessageId);
    return false;
  } catch {
    return true;
  }
}
