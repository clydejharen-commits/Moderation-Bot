import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { ServiceQueue } from '../db/models/ServiceQueue.js';
import { getSortedEntries, buildQueueEmbed, buildQueueComponents, updateQueuePanel } from '../utils/queueHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Configure the service queue panel in a selected channel.')
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('The channel where the queue panel will be created.')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: '\u274C Please select a text channel.', ephemeral: true });
    return;
  }

  const botPerms = channel.permissionsFor(interaction.guild.members.me);
  if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages) || !botPerms.has(PermissionFlagsBits.EmbedLinks)) {
    await interaction.reply({ content: '\u274C I need **Send Messages** and **Embed Links** permission in that channel.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let queueDoc;
  try {
    queueDoc = await ServiceQueue.findOne({ guildId: interaction.guild.id });
  } catch (err) {
    console.error('[QUEUE CMD] DB error:', err.message);
    await interaction.editReply({ content: '\u274C Database error. Please try again later.' });
    return;
  }

  const entries = await getSortedEntries(interaction.guild.id);

  if (queueDoc && queueDoc.channelId && queueDoc.messageId) {
    // Edit the existing panel in the old channel if possible
    if (queueDoc.channelId === channel.id) {
      try {
        const oldMessage = await channel.messages.fetch(queueDoc.messageId).catch(() => null);
        if (oldMessage) {
          const embed = buildQueueEmbed(queueDoc, entries);
          const components = buildQueueComponents();
          await oldMessage.edit({ embeds: [embed], components: [components] });
          queueDoc.status = 'active';
          await queueDoc.save();
          await interaction.editReply({ content: `\u2705 Queue panel updated in <#${channel.id}>.` });
          return;
        }
      } catch (err) {
        console.error('[QUEUE CMD] Failed to edit existing panel:', err.message);
      }
    }

    // Different channel or old message gone — delete old message if it exists
    if (queueDoc.channelId) {
      try {
        const oldChannel = await interaction.client.channels.fetch(queueDoc.channelId).catch(() => null);
        if (oldChannel) {
          const oldMessage = await oldChannel.messages.fetch(queueDoc.messageId).catch(() => null);
          if (oldMessage) await oldMessage.delete().catch(() => {});
        }
      } catch {
        // Old message already gone
      }
    }
  }

  // Create a new panel message
  const tempDoc = queueDoc || new ServiceQueue({ guildId: interaction.guild.id });
  tempDoc.status = 'active';

  const embed = buildQueueEmbed(tempDoc, entries);
  const components = buildQueueComponents();

  let sentMessage;
  try {
    sentMessage = await channel.send({ embeds: [embed], components: [components] });
  } catch (err) {
    console.error('[QUEUE CMD] Failed to send panel:', err.message);
    await interaction.editReply({ content: '\u274C Failed to create the queue panel. Check my permissions and try again.' });
    return;
  }

  tempDoc.channelId = channel.id;
  tempDoc.messageId = sentMessage.id;
  try {
    await tempDoc.save();
  } catch (err) {
    console.error('[QUEUE CMD] Failed to save queue config:', err.message);
    await interaction.editReply({ content: '\u274C Failed to save the queue configuration to the database.' });
    return;
  }

  await interaction.editReply({ content: `\u2705 Queue panel created in <#${channel.id}>. The queue is now **active**.` });
}
