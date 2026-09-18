import { EmbedBuilder } from 'discord.js';
import { ServiceQueueEntry } from '../db/models/ServiceQueueEntry.js';
import { formatFollowers } from '../utils/queueHelpers.js';

/**
 * Check whether an interaction customId belongs to the queue system.
 * @param {string} customId
 * @returns {boolean}
 */
export function isQueueButton(customId) {
  return customId === 'queue_my_position';
}

/**
 * Handle the My Position button interaction.
 * Privately replies with the member's queue position and follower amount.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleQueueButton(interaction) {
  if (interaction.customId === 'queue_my_position') {
    await handleMyPosition(interaction);
    return;
  }
}

/**
 * Respond privately with the clicking user's queue position.
 */
async function handleMyPosition(interaction) {
  let entry;
  try {
    entry = await ServiceQueueEntry.findOne({
      guildId: interaction.guild.id,
      discordUserId: interaction.user.id,
    }).lean();
  } catch (err) {
    console.error('[QUEUE BUTTON] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!entry) {
    await interaction.reply({ content: '\u274C You are not currently in the queue.', ephemeral: true });
    return;
  }

  const peopleAhead = entry.position - 1;

  const embed = new EmbedBuilder()
    .setTitle('\u{1F4CD} Your Queue Position')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Position', value: `#${entry.position}`, inline: true },
      { name: 'Followers needed', value: formatFollowers(entry.followers), inline: true },
      { name: 'People ahead of you', value: String(peopleAhead), inline: true },
    )
    .setFooter({ text: 'Service Queue' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
