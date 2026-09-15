import { Events } from 'discord.js';
import { AutoRemoveConfig } from '../db/models/AutoRemoveConfig.js';
import { isDatabaseConnected } from '../db/database.js';
import { removeUnverifiedRole } from '../utils/autoRemoveHelpers.js';

/**
 * Register the GuildMemberUpdate listener on the client.
 *
 * When a member gains the Verified role, this automatically removes
 * the Unverified role if they still have it.
 *
 * @param {import('discord.js').Client} client
 */
export function registerGuildMemberUpdate(client) {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (!isDatabaseConnected()) return;

      const guild = newMember.guild;

      let config;
      try {
        config = await AutoRemoveConfig.findOne({ guildId: guild.id });
      } catch (err) {
        console.error('[AUTO-REMOVE ERROR] Failed to query config:', err.message);
        return;
      }

      if (!config) return;

      const verifiedRoleId = config.verifiedRoleId;
      const unverifiedRoleId = config.unverifiedRoleId;

      const hadVerified = oldMember.roles.cache.has(verifiedRoleId);
      const hasVerified = newMember.roles.cache.has(verifiedRoleId);
      const hasUnverified = newMember.roles.cache.has(unverifiedRoleId);

      if (!hadVerified && hasVerified && hasUnverified) {
        await removeUnverifiedRole(newMember, unverifiedRoleId);
      }
    } catch (err) {
      console.error('[AUTO-REMOVE ERROR] GuildMemberUpdate handler error:', err.message);
    }
  });
}
