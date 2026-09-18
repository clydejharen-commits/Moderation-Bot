import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ServiceQueueEntry } from '../db/models/ServiceQueueEntry.js';

/**
 * Format a number with commas.
 * @param {number} n
 * @returns {string}
 */
export function formatFollowers(n) {
  return (n || 0).toLocaleString('en-US');
}

/**
 * Build the queue panel action row with the My Position button.
 * @returns {import('discord.js').ActionRowBuilder}
 */
export function buildQueueComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('queue_my_position')
      .setLabel('\u{1F4CD} My Position')
      .setStyle(ButtonStyle.Primary),
  );
}

/**
 * Build the queue panel embed from a ServiceQueue document and its entries.
 * @param {object} queueDoc - The ServiceQueue document.
 * @param {Array} entries - Sorted ServiceQueueEntry documents (position ascending).
 * @returns {import('discord.js').EmbedBuilder}
 */
export function buildQueueEmbed(queueDoc, entries) {
  const embed = new EmbedBuilder()
    .setTitle('\u{1F4CB} Service Queue')
    .setColor(0x2b2d31);

  if (!queueDoc || queueDoc.status === 'ended') {
    embed.setDescription('**The queue has ended.**\n\nNo members are currently in the queue.');
    embed.setFooter({ text: 'Queue ended' });
    return embed;
  }

  if (!entries || entries.length === 0) {
    embed.setDescription(
      '\u{1F7E2} **Currently Processing:** None\n' +
      '\u23ED\uFE0F **Next:** None\n\n' +
      'The queue is empty.',
    );
    embed.setFooter({ text: 'Service Queue' });
    return embed;
  }

  const processing = entries[0];
  const next = entries.length > 1 ? entries[1] : null;

  let description =
    `\u{1F7E2} **Currently Processing:** <@${processing.discordUserId}>\n` +
    `\u23ED\uFE0F **Next:** ${next ? `<@${next.discordUserId}>` : 'None'}\n\n` +
    '**Queue:**\n';

  for (const entry of entries) {
    description += `#${entry.position} <@${entry.discordUserId}> \u2014 ${formatFollowers(entry.followers)} followers\n`;
  }

  description += `\n\u{1F465} **Total:** ${entries.length}`;

  embed.setDescription(description);
  embed.setFooter({ text: 'Service Queue' });

  return embed;
}

/**
 * Fetch all entries for a guild's queue, sorted by position.
 * @param {string} guildId
 * @returns {Promise<Array>}
 */
export async function getSortedEntries(guildId) {
  return ServiceQueueEntry.find({ guildId }).sort({ position: 1 }).lean();
}

/**
 * Update the queue panel message in Discord.
 * If the message or channel is gone, the IDs are cleared silently.
 * @param {import('discord.js').Client} client
 * @param {object} queueDoc - The ServiceQueue document (mutated if message is gone).
 * @param {Array} [entries] - Pre-fetched entries; if omitted they are loaded.
 */
export async function updateQueuePanel(client, queueDoc, entries) {
  if (!queueDoc || !queueDoc.channelId || !queueDoc.messageId) return;

  if (!entries) {
    entries = await getSortedEntries(queueDoc.guildId);
  }

  try {
    const channel = await client.channels.fetch(queueDoc.channelId).catch(() => null);
    if (!channel) {
      queueDoc.channelId = null;
      queueDoc.messageId = null;
      await queueDoc.save().catch(() => {});
      return;
    }

    const message = await channel.messages.fetch(queueDoc.messageId).catch(() => null);
    if (!message) {
      queueDoc.messageId = null;
      await queueDoc.save().catch(() => {});
      return;
    }

    const embed = buildQueueEmbed(queueDoc, entries);
    const components = buildQueueComponents();
    await message.edit({ embeds: [embed], components: [components] });
  } catch (err) {
    console.error('[QUEUE PANEL] Failed to update message:', err.message);
  }
}
