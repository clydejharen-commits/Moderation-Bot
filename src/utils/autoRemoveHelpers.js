/**
 * Remove the unverified role from a member, with safety checks.
 *
 * Returns true if the role was removed (or was already absent),
 * false if the removal failed for any reason.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} unverifiedRoleId
 * @returns {Promise<boolean>}
 */
export async function removeUnverifiedRole(member, unverifiedRoleId) {
  try {
    if (!member.roles.cache.has(unverifiedRoleId)) {
      return true;
    }

    const guild = member.guild;

    const unverifiedRole = guild.roles.cache.get(unverifiedRoleId);
    if (!unverifiedRole) {
      return false;
    }

    if (unverifiedRole.managed) {
      return false;
    }

    if (unverifiedRole.position >= guild.members.me.roles.highest.position) {
      return false;
    }

    if (member.roles.highest.position >= guild.members.me.roles.highest.position) {
      return false;
    }

    await member.roles.remove(unverifiedRoleId, 'Auto-remove: member has the Verified role.');
    return true;
  } catch (err) {
    console.error(`[AUTO-REMOVE ERROR] Failed to remove role from ${member.id}:`, err.message);
    return false;
  }
}
