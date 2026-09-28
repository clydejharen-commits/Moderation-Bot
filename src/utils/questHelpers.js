import { PermissionFlagsBits } from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { StaffMember } from '../db/models/StaffMember.js';

export function isTrainerOrAdmin(member, cfg) {
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (!cfg) return false;

  const trainerUserIds = cfg.trainerUserIds || [];
  const trainerRoleIds = cfg.trainerRoleIds || [];

  if (trainerUserIds.includes(member.id)) return true;

  const memberRoleIds = new Set(member.roles.cache.keys());
  if (trainerRoleIds.some((rid) => memberRoleIds.has(rid))) return true;

  return false;
}

export async function getQuestConfig(guildId) {
  try {
    return await QuestConfig.findOneAndUpdate(
      { guildId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to load quest config:', err.message);
    return null;
  }
}

export async function resolveTraineeUserIds(guild, cfg) {
  if (!cfg) return [];

  const userIds = new Set(cfg.traineeUserIds || []);
  const traineeRoleIds = cfg.traineeRoleIds || [];

  for (const roleId of traineeRoleIds) {
    try {
      const members = await guild.members.fetch({ role: roleId });
      members.forEach((m) => userIds.add(m.id));
    } catch (err) {
      console.error(`[QUEST HELPERS] Failed to fetch role ${roleId}:`, err.message);
    }
  }

  return [...userIds];
}

export function isTrainee(member, cfg) {
  if (!cfg) return false;
  const traineeUserIds = cfg.traineeUserIds || [];
  const traineeRoleIds = cfg.traineeRoleIds || [];

  if (traineeUserIds.includes(member.id)) return true;

  const memberRoleIds = new Set(member.roles.cache.keys());
  if (traineeRoleIds.some((rid) => memberRoleIds.has(rid))) return true;

  return false;
}

export function isTrainer(member, cfg) {
  if (!cfg) return false;
  const trainerUserIds = cfg.trainerUserIds || [];
  const trainerRoleIds = cfg.trainerRoleIds || [];

  if (trainerUserIds.includes(member.id)) return true;

  const memberRoleIds = new Set(member.roles.cache.keys());
  if (trainerRoleIds.some((rid) => memberRoleIds.has(rid))) return true;

  return false;
}

export function calculateToken(totalPoints, cfg) {
  const ppt = cfg?.pointsPerToken;
  if (!ppt || ppt <= 0) return 0;
  return Math.floor(totalPoints / ppt);
}

export function calculateStatus(token, cfg) {
  if (!cfg) return 'demotion';

  const demotionMin = cfg.demotionMin ?? 0;
  const demotionMax = cfg.demotionMax ?? 20;
  const normalMin = cfg.normalMin ?? 21;
  const normalMax = cfg.normalMax ?? 49;
  const promotionMin = cfg.promotionMin ?? 50;
  const promotionMax = cfg.promotionMax ?? 999999;

  if (token >= demotionMin && token <= demotionMax) return 'demotion';
  if (token >= normalMin && token <= normalMax) return 'normal';
  if (token >= promotionMin && token <= promotionMax) return 'promotion';

  if (token < demotionMin) return 'demotion';
  if (token > promotionMax) return 'promotion';
  if (token > demotionMax && token < normalMin) return 'normal';
  if (token > normalMax && token < promotionMin) return 'normal';

  return 'demotion';
}

export function statusLabel(status) {
  if (status === 'promotion') return '\u{1F7E2} Promotion';
  if (status === 'normal') return '\u26AA Normal';
  return '\u{1F534} Demotion';
}

export function validateTokenRanges(demotionMin, demotionMax, normalMin, normalMax, promotionMin, promotionMax) {
  if (demotionMin < 0 || demotionMax < demotionMin) return 'Demotion range is invalid (min must be \u2264 max, min \u2265 0).';
  if (normalMin < 0 || normalMax < normalMin) return 'Normal range is invalid (min must be \u2264 max, min \u2265 0).';
  if (promotionMin < 0 || promotionMax < promotionMin) return 'Promotion range is invalid (min must be \u2264 max, min \u2265 0).';

  // Check for overlaps
  if (demotionMax >= normalMin) return 'Demotion range overlaps with Normal range. Demotion max must be less than Normal min.';
  if (normalMax >= promotionMin) return 'Normal range overlaps with Promotion range. Normal max must be less than Promotion min.';

  return null;
}

export async function getOrCreateStaffMember(guildId, userId, username, cfg) {
  try {
    const staff = await StaffMember.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { totalPoints: 0, token: 0, status: 'demotion', dailyMessageCount: 0 }, username },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return staff;
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to get/create staff member:', err.message);
    return null;
  }
}

export async function recalculateStaffMember(guildId, userId, username, cfg) {
  try {
    const staff = await StaffMember.findOneAndUpdate(
      { guildId, userId },
      { username },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const token = calculateToken(staff.totalPoints, cfg);
    const status = calculateStatus(token, cfg);

    staff.token = token;
    staff.status = status;
    await staff.save();

    return staff.toObject();
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to recalculate staff member:', err.message);
    return null;
  }
}

export async function recalculateAllStaff(guildId, cfg) {
  let staffMembers;
  try {
    staffMembers = await StaffMember.find({ guildId }).lean();
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to fetch staff for recalculation:', err.message);
    return [];
  }

  const results = [];
  for (const sm of staffMembers) {
    const recalculated = await recalculateStaffMember(guildId, sm.userId, sm.username || 'Unknown', cfg);
    if (recalculated) results.push(recalculated);
  }
  return results;
}

export function buildLeaderboardText(staffMembers, cfg) {
  const sorted = [...staffMembers].sort((a, b) => b.totalPoints - a.totalPoints);
  const required = cfg?.requiredDailyMessages ?? 50;

  const lines = sorted.map((sm, i) => {
    const rank = i + 1;
    const mention = `<@${sm.userId}>`;
    const id = `(${sm.userId})`;
    const messages = `${sm.dailyMessageCount ?? 0}/${required}`;
    const status = statusLabel(sm.status);
    const points = sm.totalPoints ?? 0;
    const token = sm.token ?? 0;

    return `${rank}. ${mention} ${id}\nMessages: ${messages}\nStatus: ${status}\nPoints: ${points}\nToken: ${token}`;
  });

  return `\u{1F3C6} Staff Leaderboard\n\n${lines.join('\n\n')}`.slice(0, 4000);
}

export async function getTrackedUserIds(guild, cfg) {
  if (!cfg) return [];
  const userIds = new Set(cfg.trackedUserIds || []);
  return [...userIds];
}

export function isMessageTracked(message, cfg) {
  if (!cfg) return false;
  if (message.author?.bot) return false;

  const trackedUserIds = cfg.trackedUserIds || [];
  const trackedChannelIds = cfg.trackedChannelIds || [];

  if (!trackedUserIds.includes(message.author.id)) return false;
  if (!trackedChannelIds.includes(message.channelId)) return false;

  return true;
}

export async function incrementDailyMessageCount(guildId, userId, username) {
  try {
    const staff = await StaffMember.findOneAndUpdate(
      { guildId, userId },
      { username, $setOnInsert: { totalPoints: 0, token: 0, status: 'demotion' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    staff.dailyMessageCount = (staff.dailyMessageCount || 0) + 1;
    await staff.save();
    return staff.toObject();
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to increment daily message count:', err.message);
    return null;
  }
}

export async function evaluateDailyMessages(client, guildId, cfg) {
  if (!cfg) return;

  const trackedUserIds = cfg.trackedUserIds || [];
  const required = cfg.requiredDailyMessages ?? 50;
  const pointsIfMet = cfg.pointsIfMet ?? 5;
  const pointsIfNotMet = cfg.pointsIfNotMet ?? -3;

  for (const userId of trackedUserIds) {
    try {
      const staff = await StaffMember.findOneAndUpdate(
        { guildId, userId },
        { $setOnInsert: { totalPoints: 0, token: 0, status: 'demotion' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      if (staff.dailyMessageCount >= required) {
        staff.totalPoints += pointsIfMet;
      } else {
        staff.totalPoints += pointsIfNotMet;
      }

      staff.dailyMessageCount = 0;
      await staff.save();

      await recalculateStaffMember(guildId, userId, staff.username || 'Unknown', cfg);
    } catch (err) {
      console.error(`[QUEST HELPERS] Failed to evaluate daily messages for ${userId}:`, err.message);
    }
  }
}

export function getUtc8Date(date = new Date()) {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}

export function getNextUtc8ResetTime(now = new Date()) {
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = utc8.getUTCFullYear();
  const month = utc8.getUTCMonth();
  const day = utc8.getUTCDate();

  // 8:00 AM UTC+8 = 00:00 UTC
  let resetUtc8 = new Date(Date.UTC(year, month, day, 8, 0, 0));
  // Convert back to UTC
  let resetUtc = new Date(resetUtc8.getTime() - 8 * 60 * 60 * 1000);

  if (resetUtc <= now) {
    resetUtc8 = new Date(Date.UTC(year, month, day + 1, 8, 0, 0));
    resetUtc = new Date(resetUtc8.getTime() - 8 * 60 * 60 * 1000);
  }

  return resetUtc;
}
