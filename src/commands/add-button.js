import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketOption } from '../db/models/TicketOption.js';

const MAX_OPTIONS = 5;

export const data = new SlashCommandBuilder()
  .setName('add-button')
  .setDescription('Add a ticket option for the ticket dropdown. Administrator only.')
  .addStringOption((opt) =>
    opt.setName('button-name').setDescription('The name shown in the ticket dropdown.').setRequired(true).setMaxLength(100),
  )
  .addStringOption((opt) =>
    opt.setName('hex-code').setDescription('Custom hex color for this ticket option (e.g. #006400).').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('emoji').setDescription('Emoji shown beside the dropdown option. Unicode or a custom server emoji.').setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Parse a hex color string into a numeric color value.
 * Accepts formats: "#006400", "006400", "#00FF00".
 * Returns null if invalid.
 * @param {string} input
 * @returns {number|null}
 */
function parseHexColor(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

/**
 * Resolve an emoji string into a display string.
 * - Unicode emojis are returned as-is.
 * - Custom server emojis can be provided as "<:name:id>", ":name:", or the raw emoji,
 *   and are normalised to "<:name:id>" for storage.
 * Returns null if the emoji is not valid and not a known custom server emoji.
 * @param {import('discord.js').Guild} guild
 * @param {string} input
 * @returns {string|null}
 */
function resolveEmoji(guild, input) {
  if (typeof input !== 'string' || input.trim() === '') return null;

  const trimmed = input.trim();

  // Already in animated/static custom emoji mention form: <:name:id> or <a:name:id>
  const mentionMatch = trimmed.match(/^<(a)?:(\w+):(\d+)>$/);
  if (mentionMatch) {
    return trimmed;
  }

  // Bare custom emoji identifier: :name:
  const colonMatch = trimmed.match(/^:([^:]+):$/);
  if (colonMatch) {
    const name = colonMatch[1];
    const emoji = guild.emojis.cache.find((e) => e.name === name);
    if (!emoji) return null;
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  }

  // Otherwise treat as a Unicode emoji — accept any non-empty string.
  return trimmed;
}

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const label = interaction.options.getString('button-name').trim();
  const hexInput = interaction.options.getString('hex-code');
  const emojiInput = interaction.options.getString('emoji');

  // Validate hex color
  const color = parseHexColor(hexInput);
  if (color === null) {
    await interaction.reply({ content: '\u274C Invalid hex code. Use a valid 6-digit hex code like `#006400` or `#5865F2`.', ephemeral: true });
    return;
  }

  // Validate emoji
  const emoji = resolveEmoji(interaction.guild, emojiInput);
  if (emoji === null) {
    await interaction.reply({ content: '\u274C Invalid emoji. Provide a Unicode emoji or a custom server emoji (e.g. `:emojiName:` or `<:emojiName:id>`).', ephemeral: true });
    return;
  }

  // Check current option count — max 5
  let existingCount;
  try {
    existingCount = await TicketOption.countDocuments({ guildId: interaction.guild.id });
  } catch (err) {
    console.error('[ADD-BUTTON CMD] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existingCount >= MAX_OPTIONS) {
    await interaction.reply({ content: '\u274C You already have the maximum of **5** ticket options. Remove one before adding another.', ephemeral: true });
    return;
  }

  // Save the new option
  try {
    await TicketOption.create({
      guildId: interaction.guild.id,
      label,
      color: hexInput.replace(/^#/, '').trim().toLowerCase(),
      emoji,
      position: existingCount,
    });
  } catch (err) {
    if (err.code === 11000) {
      await interaction.reply({ content: '\u274C A ticket option with that name already exists.', ephemeral: true });
      return;
    }
    console.error('[ADD-BUTTON CMD] Failed to save option:', err.message);
    await interaction.reply({ content: '\u274C Failed to save the ticket option. Please try again later.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('\u2705 Ticket option added')
    .setColor(color)
    .addFields(
      { name: 'Name', value: label, inline: true },
      { name: 'Color', value: `\`#${hexInput.replace(/^#/, '').trim().toUpperCase()}\``, inline: true },
      { name: 'Emoji', value: emoji, inline: true },
      { name: 'Options', value: `${existingCount + 1} / ${MAX_OPTIONS}`, inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
