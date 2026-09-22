import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { Ticket } from '../db/models/Ticket.js';
import { TicketConfig } from '../db/models/TicketConfig.js';

/**
 * Handle the R! Close prefix command — closes the current ticket channel.
 *
 * Only the ticket creator or members with the configured Ticket Staff role
 * can use it, and only inside a channel created by the ticket system.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled
 */
export async function handleTicketClosePrefix(message) {
  if (!isDatabaseConnected()) {
    await message.reply('\u274C The database is unavailable. Please try again later.');
    return true;
  }

  // Look up the ticket record for this channel
  let ticket;
  try {
    ticket = await Ticket.findOne({ guildId: message.guild.id, channelId: message.channel.id }).lean();
  } catch (err) {
    console.error('[TICKET CLOSE] DB error:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return true;
  }

  if (!ticket) {
    await message.reply('\u274C This command can only be used inside a ticket channel.');
    return true;
  }

  // Fetch the ticket config to get the staff role
  let config;
  try {
    config = await TicketConfig.findOne({ guildId: message.guild.id }).lean();
  } catch (err) {
    console.error('[TICKET CLOSE] Failed to fetch config:', err.message);
    await message.reply('\u274C Database error. Please try again later.');
    return true;
  }

  // Permission check: ticket creator or staff role
  const isCreator = message.author.id === ticket.creatorId;
  const isStaff = config?.staffRoleId && message.member.roles.cache.has(config.staffRoleId);

  if (!isCreator && !isStaff) {
    await message.reply('\u274C Only the ticket creator or a Ticket Staff member can close this ticket.');
    return true;
  }

  // Remove the ticket creator's permissions so they can no longer see or send
  try {
    await message.channel.permissionOverwrites.edit(ticket.creatorId, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
      AttachFiles: false,
    });
  } catch (err) {
    console.error('[TICKET CLOSE] Failed to update permissions:', err.message);
    await message.reply('\u274C Failed to close the ticket. Check my permissions and try again.');
    return true;
  }

  // Delete the ticket record so the user can open a new one
  try {
    await Ticket.deleteOne({ _id: ticket._id });
  } catch (err) {
    console.error('[TICKET CLOSE] Failed to delete ticket record:', err.message);
  }

  // Send a closing embed
  const closeEmbed = new EmbedBuilder()
    .setTitle(`\u{1F512} Ticket #${ticket.ticketNumber} Closed`)
    .setColor(0xED4245)
    .setDescription(`This ticket has been closed by <@${message.author.id}>.\n\nThe ticket creator can no longer see or send messages in this channel.`)
    .addFields(
      { name: 'Ticket Type', value: ticket.label, inline: true },
      { name: 'Opened By', value: `<@${ticket.creatorId}>`, inline: true },
      { name: 'Closed By', value: `<@${message.author.id}>`, inline: true },
    )
    .setFooter({ text: `Ticket #${ticket.ticketNumber}` })
    .setTimestamp();

  try {
    await message.channel.send({ embeds: [closeEmbed] });
  } catch (err) {
    console.error('[TICKET CLOSE] Failed to send close embed:', err.message);
  }

  return true;
}
