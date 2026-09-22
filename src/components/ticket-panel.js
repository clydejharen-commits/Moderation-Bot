import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { TicketConfig } from '../db/models/TicketConfig.js';
import { TicketCounter } from '../db/models/TicketCounter.js';
import { Ticket } from '../db/models/Ticket.js';
import { TicketOption } from '../db/models/TicketOption.js';

const TICKET_SELECT_ID = 'ticket_select';
const TICKET_MODAL_ID = 'ticket_modal_roblox';

// Stores the selected ticket label between the dropdown selection and the
// modal submission, since Discord does not carry select values into modals.
const pendingSelections = new Map();

function pendingKey(userId, guildId) {
  return `${userId}:${guildId}`;
}

function setPendingSelection(userId, guildId, label) {
  pendingSelections.set(pendingKey(userId, guildId), label);
  setTimeout(() => pendingSelections.delete(pendingKey(userId, guildId)), 5 * 60 * 1000);
}

function getPendingSelection(userId, guildId) {
  return pendingSelections.get(pendingKey(userId, guildId)) || null;
}

function clearPendingSelection(userId, guildId) {
  pendingSelections.delete(pendingKey(userId, guildId));
}

/**
 * Check whether a ticket's channel still exists in Discord.
 * If the channel was deleted, remove the stale ticket record from MongoDB
 * so the user can create a new ticket.
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').LeanDocument|null} ticket
 * @returns {Promise<boolean>} true if the ticket is still valid (channel exists)
 */
async function isTicketChannelValid(guild, ticket) {
  if (!ticket) return false;

  let channel;
  try {
    channel = await guild.channels.fetch(ticket.channelId);
  } catch {
    channel = null;
  }

  if (!channel) {
    try {
      await Ticket.deleteOne({ _id: ticket._id });
      console.log(`[TICKET PANEL] Removed stale ticket #${ticket.ticketNumber} — channel ${ticket.channelId} no longer exists.`);
    } catch (err) {
      console.error('[TICKET PANEL] Failed to remove stale ticket:', err.message);
    }
    return false;
  }

  return true;
}

/**
 * Check whether an interaction customId belongs to the ticket dropdown.
 * @param {string} customId
 * @returns {boolean}
 */
export function isTicketSelect(customId) {
  return customId === TICKET_SELECT_ID;
}

/**
 * Check whether an interaction customId belongs to the ticket Roblox username modal.
 * @param {string} customId
 * @returns {boolean}
 */
export function isTicketModal(customId) {
  return customId === TICKET_MODAL_ID;
}

/**
 * Get the next ticket number for a guild, incrementing the counter atomically.
 * @param {string} guildId
 * @returns {Promise<number|null>}
 */
async function getNextTicketNumber(guildId) {
  let counter;
  try {
    counter = await TicketCounter.findOneAndUpdate(
      { guildId },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[TICKET PANEL] Failed to increment counter:', err.message);
    return null;
  }
  return counter.count;
}

/**
 * Handle the ticket dropdown selection — shows a modal asking for the
 * user's Roblox username before creating the ticket channel.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
export async function handleTicketSelect(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const selectedLabel = interaction.values[0];

  // Fetch the ticket configuration
  let config;
  try {
    config = await TicketConfig.findOne({ guildId: guild.id }).lean();
  } catch (err) {
    console.error('[TICKET PANEL] Failed to fetch config:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!config || !config.categoryId || !config.staffRoleId) {
    await interaction.reply({ content: '\u274C The ticket system has not been configured. An administrator needs to run `/ticket setup` first.', ephemeral: true });
    return;
  }

  // One open ticket per member — check before showing the modal
  let existingTicket;
  try {
    existingTicket = await Ticket.findOne({ guildId: guild.id, creatorId: member.id }).lean();
  } catch (err) {
    console.error('[TICKET PANEL] Failed to check existing ticket:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existingTicket && await isTicketChannelValid(guild, existingTicket)) {
    await interaction.reply({
      content: `\u274C You already have an open ticket: <#${existingTicket.channelId}>. Please close it before opening a new one.`,
      ephemeral: true,
    });
    return;
  }

  // Store the selected label so the modal submission handler can retrieve it
  setPendingSelection(member.id, guild.id, selectedLabel);

  // Show the Roblox username modal
  const modal = new ModalBuilder()
    .setCustomId(TICKET_MODAL_ID)
    .setTitle(`Open a ${selectedLabel} ticket`);

  const robloxInput = new TextInputBuilder()
    .setCustomId('ticket_roblox_username')
    .setLabel('What is your Roblox username?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Enter your Roblox username');

  modal.addComponents(new ActionRowBuilder().addComponents(robloxInput));

  await interaction.showModal(modal);
}

/**
 * Handle the Roblox username modal submission — creates the ticket channel.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleTicketModal(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const robloxUsername = interaction.fields.getTextInputValue('ticket_roblox_username').trim();

  // Retrieve the selected label from the pending map
  const selectedLabel = getPendingSelection(member.id, guild.id);

  if (!selectedLabel) {
    await interaction.reply({ content: '\u274C Could not determine your ticket type. Please try selecting from the dropdown again.', ephemeral: true });
    return;
  }

  // Re-check for existing ticket (race condition guard)
  let existingTicket;
  try {
    existingTicket = await Ticket.findOne({ guildId: guild.id, creatorId: member.id }).lean();
  } catch (err) {
    console.error('[TICKET PANEL] Failed to check existing ticket:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existingTicket && await isTicketChannelValid(guild, existingTicket)) {
    clearPendingSelection(member.id, guild.id);
    await interaction.reply({
      content: `\u274C You already have an open ticket: <#${existingTicket.channelId}>. Please close it before opening a new one.`,
      ephemeral: true,
    });
    return;
  }

  // Fetch the ticket configuration
  let config;
  try {
    config = await TicketConfig.findOne({ guildId: guild.id }).lean();
  } catch (err) {
    console.error('[TICKET PANEL] Failed to fetch config:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!config || !config.categoryId || !config.staffRoleId) {
    clearPendingSelection(member.id, guild.id);
    await interaction.reply({ content: '\u274C The ticket system has not been configured. An administrator needs to run `/ticket setup` first.', ephemeral: true });
    return;
  }

  // Clear the pending selection — we have everything we need
  clearPendingSelection(member.id, guild.id);

  // Fetch the matching ticket option for color/emoji
  let ticketOption;
  try {
    ticketOption = await TicketOption.findOne({ guildId: guild.id, label: selectedLabel }).lean();
  } catch (err) {
    console.error('[TICKET PANEL] Failed to fetch ticket option:', err.message);
  }

  // Get the next ticket number
  const ticketNumber = await getNextTicketNumber(guild.id);
  if (ticketNumber === null) {
    await interaction.reply({ content: '\u274C Failed to generate a ticket number. Please try again later.', ephemeral: true });
    return;
  }

  // Build the channel name: "number-button-name"
  const slug = selectedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const channelName = `${ticketNumber}-${slug}`;

  // Parse the hex color for the ticket embed
  let embedColor = 0x2ECC71;
  if (ticketOption?.color) {
    const parsed = parseInt(ticketOption.color.replace(/^#/, ''), 16);
    if (!Number.isNaN(parsed)) embedColor = parsed;
  }

  // Fetch the category channel
  let categoryChannel;
  try {
    categoryChannel = await guild.channels.fetch(config.categoryId);
  } catch {
    await interaction.reply({ content: '\u274C The configured ticket category could not be found. An administrator may need to re-run `/ticket setup`.', ephemeral: true });
    return;
  }

  if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: '\u274C The configured ticket category is no longer a valid category.', ephemeral: true });
    return;
  }

  // Create the ticket channel inside the category
  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryChannel.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: config.staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });
  } catch (err) {
    console.error('[TICKET PANEL] Failed to create ticket channel:', err.message);
    await interaction.reply({ content: '\u274C Failed to create the ticket channel. Check my permissions and try again.', ephemeral: true });
    return;
  }

  // Save the ticket record
  try {
    await Ticket.create({
      guildId: guild.id,
      channelId: ticketChannel.id,
      creatorId: member.id,
      ticketNumber,
      label: selectedLabel,
      color: ticketOption?.color || null,
      emoji: ticketOption?.emoji || null,
      robloxUsername,
    });
  } catch (err) {
    console.error('[TICKET PANEL] Failed to save ticket record:', err.message);
  }

  // Send the initial embed in the ticket channel
  const emojiPrefix = ticketOption?.emoji ? `${ticketOption.emoji} ` : '';
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`${emojiPrefix}Ticket #${ticketNumber} — ${selectedLabel}`)
    .setColor(embedColor)
    .setDescription(`Hello <@${member.id}>,\n\nA staff member will be with you shortly. Please describe your issue in detail.\n\n**Ticket Type:** ${selectedLabel}`)
    .addFields(
      { name: 'Ticket Number', value: `#${ticketNumber}`, inline: true },
      { name: 'Opened By', value: `<@${member.id}>`, inline: true },
      { name: 'Roblox Username', value: robloxUsername, inline: true },
      { name: 'Staff', value: `<@&${config.staffRoleId}>`, inline: false },
    )
    .setFooter({ text: `Ticket #${ticketNumber}` })
    .setTimestamp();

  try {
    await ticketChannel.send({ content: `<@${member.id}> <@&${config.staffRoleId}>`, embeds: [ticketEmbed] });
  } catch (err) {
    console.error('[TICKET PANEL] Failed to send ticket embed:', err.message);
  }

  await interaction.reply({
    content: `\u2705 Your ticket has been created: ${ticketChannel}`,
    ephemeral: true,
  });
}
