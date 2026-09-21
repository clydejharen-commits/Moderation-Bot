import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketConfig } from '../db/models/TicketConfig.js';
import { TicketOption } from '../db/models/TicketOption.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Configure the ticket system.')
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Set up the ticket dropdown on a panel message.')
      .addChannelOption((opt) =>
        opt
          .setName('ticket-category')
          .setDescription('The category where new ticket channels will be created.')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildCategory),
      )
      .addStringOption((opt) =>
        opt
          .setName('message-id')
          .setDescription('The ID of the existing panel message where the dropdown will be added.')
          .setRequired(true),
      )
      .addRoleOption((opt) =>
        opt
          .setName('ticket-staff')
          .setDescription('The role that can access and manage ticket channels.')
          .setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Parse an emoji string stored in the database into a form usable by
 * Discord's StringSelectMenuOption emoji property.
 *
 * - Unicode emojis ("🎫") → { name: "🎫" }
 * - Static custom ("<:name:id>") → { id: "id" }
 * - Animated custom ("<a:name:id>") → { id: "id", animated: true }
 * - Anything unparseable → null (no emoji rendered)
 * @param {string} raw
 * @returns {{name: string} | {id: string, animated?: boolean} | null}
 */
function parseEmojiForSelect(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // Animated custom emoji: <a:name:id>
  const animatedMatch = trimmed.match(/^<a:(\w+):(\d+)>$/);
  if (animatedMatch) {
    return { id: animatedMatch[2], animated: true };
  }

  // Static custom emoji: <:name:id>
  const staticMatch = trimmed.match(/^<:(\w+):(\d+)>$/);
  if (staticMatch) {
    return { id: staticMatch[2] };
  }

  // Unicode emoji — return as-is
  return { name: trimmed };
}

/**
 * Build the ticket dropdown component from saved TicketOption documents.
 * Returns null if there are no options.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<ActionRowBuilder|null>}
 */
export async function buildTicketDropdown(guild) {
  let options;
  try {
    options = await TicketOption.find({ guildId: guild.id }).sort({ position: 1 }).lean();
  } catch (err) {
    console.error('[TICKET SETUP] Failed to fetch ticket options:', err.message);
    return null;
  }

  if (!options || options.length === 0) return null;

  const selectOptions = options.slice(0, 25).map((opt) => {
    const selectOption = {
      label: opt.label.length > 100 ? opt.label.slice(0, 100) : opt.label,
      value: opt.label,
      description: `Open a ${opt.label} ticket`,
    };

    const emoji = parseEmojiForSelect(opt.emoji);
    if (emoji) {
      selectOption.emoji = emoji;
    }

    return selectOption;
  });

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId('ticket_select')
    .setPlaceholder('Select a ticket type...')
    .addOptions(selectOptions);

  return new ActionRowBuilder().addComponents(dropdown);
}

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommand() !== 'setup') return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const category = interaction.options.getChannel('ticket-category');
  const messageIdInput = interaction.options.getString('message-id');
  const staffRole = interaction.options.getRole('ticket-staff');

  // Validate the message ID — must be a snowflake (17-20 digit number)
  if (!/^\d{17,20}$/.test(messageIdInput)) {
    await interaction.reply({ content: '\u274C Invalid message ID. Please provide a valid Discord message ID.', ephemeral: true });
    return;
  }

  // Fetch the target message — must exist in the current channel
  let targetMessage;
  try {
    targetMessage = await interaction.channel.messages.fetch(messageIdInput);
  } catch {
    await interaction.reply({ content: '\u274C Could not find a message with that ID in this channel. Make sure the message ID is correct and the message is in this channel.', ephemeral: true });
    return;
  }

  // Check for existing ticket options
  let optionCount;
  try {
    optionCount = await TicketOption.countDocuments({ guildId: interaction.guild.id });
  } catch (err) {
    console.error('[TICKET SETUP] Failed to count ticket options:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (optionCount === 0) {
    await interaction.reply({ content: '\u274C No ticket options found. Use `/add-button` to create ticket options before running setup.', ephemeral: true });
    return;
  }

  // Build the dropdown
  const dropdownRow = await buildTicketDropdown(interaction.guild);
  if (!dropdownRow) {
    await interaction.reply({ content: '\u274C Failed to build the ticket dropdown. Please try again later.', ephemeral: true });
    return;
  }

  // Check bot permissions in the target channel
  const botPerms = interaction.channel.permissionsFor(interaction.guild.members.me);
  if (!botPerms?.has(PermissionFlagsBits.ReadMessageHistory) || !botPerms?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({ content: '\u274C I need **Read Message History** and **Send Messages** permissions in this channel to edit the panel message.', ephemeral: true });
    return;
  }

  // Add the dropdown to the target message
  try {
    await targetMessage.edit({ components: [dropdownRow] });
  } catch (err) {
    console.error('[TICKET SETUP] Failed to edit panel message:', err.message);
    await interaction.reply({ content: '\u274C Failed to add the dropdown to the panel message. Check my permissions and try again.', ephemeral: true });
    return;
  }

  // Save or update the ticket configuration
  try {
    await TicketConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      {
        categoryId: category.id,
        messageId: targetMessage.id,
        channelId: interaction.channel.id,
        staffRoleId: staffRole.id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[TICKET SETUP] Failed to save ticket config:', err.message);
    await interaction.reply({ content: '\u274C Failed to save the ticket configuration. Please try again later.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('\u2705 Ticket system configured')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Ticket Category', value: `<#${category.id}>`, inline: true },
      { name: 'Panel Message', value: `[Message](${targetMessage.url})`, inline: true },
      { name: 'Ticket Staff', value: `<@&${staffRole.id}>`, inline: true },
      { name: 'Dropdown Options', value: String(optionCount), inline: true },
    )
    .setFooter({ text: 'The dropdown has been added to the panel message.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
