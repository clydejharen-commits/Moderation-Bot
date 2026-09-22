import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketOption } from '../db/models/TicketOption.js';
import { TicketConfig } from '../db/models/TicketConfig.js';
import { buildTicketDropdown } from './ticket.js';

export const data = new SlashCommandBuilder()
  .setName('delete-button')
  .setDescription('Delete a ticket option from the dropdown. Administrator only.')
  .addStringOption((opt) =>
    opt
      .setName('button-name')
      .setDescription('Select the ticket option to delete.')
      .setRequired(true)
      .setMaxLength(100)
      .setAutocomplete(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Handle autocomplete for the button-name option — returns all saved
 * ticket options for this guild so the admin can select from a list.
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();

  let options;
  try {
    options = await TicketOption.find({ guildId: interaction.guild.id }).sort({ position: 1 }).lean();
  } catch (err) {
    console.error('[DELETE-BUTTON AUTOCOMPLETE] DB error:', err.message);
    await interaction.respond([]);
    return;
  }

  if (!options || options.length === 0) {
    await interaction.respond([]);
    return;
  }

  const filtered = options
    .filter((opt) => opt.label.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map((opt) => ({
      name: opt.emoji ? `${opt.emoji} ${opt.label}`.slice(0, 100) : opt.label,
      value: opt.label,
    }));

  await interaction.respond(filtered);
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

  // Check that at least one ticket option exists
  let optionCount;
  try {
    optionCount = await TicketOption.countDocuments({ guildId: interaction.guild.id });
  } catch (err) {
    console.error('[DELETE-BUTTON CMD] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (optionCount === 0) {
    await interaction.reply({ content: '\u274C There are no ticket options to delete. Use `/add-button` to create one first.', ephemeral: true });
    return;
  }

  let existing;
  try {
    existing = await TicketOption.findOne({ guildId: interaction.guild.id, label });
  } catch (err) {
    console.error('[DELETE-BUTTON CMD] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!existing) {
    await interaction.reply({ content: `\u274C No ticket option named **${label}** was found.`, ephemeral: true });
    return;
  }

  try {
    await TicketOption.deleteOne({ guildId: interaction.guild.id, label });
  } catch (err) {
    console.error('[DELETE-BUTTON CMD] Failed to delete option:', err.message);
    await interaction.reply({ content: '\u274C Failed to delete the ticket option. Please try again later.', ephemeral: true });
    return;
  }

  // Re-number remaining positions to keep them sequential
  try {
    const remaining = await TicketOption.find({ guildId: interaction.guild.id }).sort({ position: 1 }).lean();
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await TicketOption.updateOne({ _id: remaining[i]._id }, { $set: { position: i } });
      }
    }
  } catch (err) {
    console.error('[DELETE-BUTTON CMD] Failed to re-number positions:', err.message);
  }

  // Update the dropdown on the existing panel message if one is configured
  try {
    const config = await TicketConfig.findOne({ guildId: interaction.guild.id }).lean();
    if (config && config.messageId && config.channelId) {
      const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(config.messageId).catch(() => null);
        if (message) {
          const dropdownRow = await buildTicketDropdown(interaction.guild);
          if (dropdownRow) {
            await message.edit({ components: [dropdownRow] });
          } else {
            await message.edit({ components: [] });
          }
        }
      }
    }
  } catch (err) {
    console.error('[DELETE-BUTTON CMD] Failed to update panel message:', err.message);
  }

  const embed = new EmbedBuilder()
    .setTitle('\u2705 Ticket option deleted')
    .setColor(0xED4245)
    .addFields(
      { name: 'Deleted', value: label, inline: true },
      { name: 'Emoji', value: existing.emoji || 'None', inline: true },
    )
    .setFooter({ text: 'The dropdown has been updated.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
