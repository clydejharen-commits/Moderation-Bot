import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketOption } from '../db/models/TicketOption.js';
import { ClosedButton } from '../db/models/ClosedButton.js';

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Close or reopen a ticket button. Administrator only.')
  .addSubcommand((sub) =>
    sub
      .setName('button')
      .setDescription('Close or reopen a specific ticket button.')
      .addStringOption((opt) =>
        opt
          .setName('button')
          .setDescription('The ticket button to close or reopen.')
          .setRequired(true)
          .setMaxLength(100)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Reason for closing this button.')
          .setRequired(false)
          .setMaxLength(500),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();

  let options;
  try {
    options = await TicketOption.find({ guildId: interaction.guild.id }).sort({ position: 1 }).lean();
  } catch (err) {
    console.error('[CLOSE-BUTTON AUTOCOMPLETE] DB error:', err.message);
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

  if (interaction.options.getSubcommand() !== 'button') return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const label = interaction.options.getString('button').trim();
  const reason = interaction.options.getString('reason')?.trim() || null;

  let option;
  try {
    option = await TicketOption.findOne({ guildId: interaction.guild.id, label }).lean();
  } catch (err) {
    console.error('[CLOSE-BUTTON CMD] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!option) {
    await interaction.reply({ content: `\u274C No ticket option named **${label}** was found.`, ephemeral: true });
    return;
  }

  let existing;
  try {
    existing = await ClosedButton.findOne({ guildId: interaction.guild.id, label }).lean();
  } catch (err) {
    console.error('[CLOSE-BUTTON CMD] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existing) {
    try {
      await ClosedButton.deleteOne({ _id: existing._id });
    } catch (err) {
      console.error('[CLOSE-BUTTON CMD] Failed to reopen button:', err.message);
      await interaction.reply({ content: '\u274C Failed to reopen the button. Please try again later.', ephemeral: true });
    return;
    }

    const embed = new EmbedBuilder()
      .setTitle('\u2705 Ticket button reopened')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'Button', value: option.emoji ? `${option.emoji} ${option.label}` : option.label, inline: true },
      )
      .setFooter({ text: 'Members can create tickets through this button again.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    try {
      await ClosedButton.create({
        guildId: interaction.guild.id,
        label,
        reason,
      });
    } catch (err) {
      console.error('[CLOSE-BUTTON CMD] Failed to close button:', err.message);
      await interaction.reply({ content: '\u274C Failed to close the button. Please try again later.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('\u{1F512} Ticket button closed')
      .setColor(0xED4245)
      .addFields(
        { name: 'Button', value: option.emoji ? `${option.emoji} ${option.label}` : option.label, inline: true },
      )
      .setFooter({ text: 'Members will see a closed message when clicking this button.' });

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason, inline: false });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
