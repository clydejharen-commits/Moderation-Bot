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

export function calculatePromoteCoins(totalPoints, cfg) {
  const ppc = cfg?.pointsPerPromoteCoin;
  if (!ppc || ppc <= 0) return 0;
  return Math.floor(totalPoints / ppc);
}

export function calculateStatus(promoteCoins, cfg) {
  const promotionThreshold = cfg?.promoteCoinsForPromotion ?? 0;
  if (promoteCoins >= promotionThreshold) return 'promotion';
  return 'demotion';
}

export function statusLabel(status) {
  if (status === 'promotion') return '\u{1F7E2} Promotion';
  return '\u{1F534} Demotion';
}

export async function getOrCreateStaffMember(guildId, userId, username, cfg) {
  try {
    const staff = await StaffMember.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { totalPoints: 0, promoteCoins: 0, status: 'demotion' }, username },
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

    const coins = calculatePromoteCoins(staff.totalPoints, cfg);
    const status = calculateStatus(coins, cfg);

    staff.promoteCoins = coins;
    staff.status = status;
    await staff.save();

    return staff.toObject();
  } catch (err) {
    console.error('[QUEST HELPERS] Failed to recalculate staff member:', err.message);
    return null;
  }
}
