import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketConfig } from '../db/models/TicketConfig.js';

export const data = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Create a vouch panel for members to leave reviews.')
  .addStringOption((opt) =>
    opt
      .setName('vouch-for')
      .setDescription('What this vouch is for (e.g. a service, a person, a product).')
      .setRequired(true)
      .setMaxLength(500),
  );

export async function execute(interaction) {
  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  // Fetch the ticket config to check the Ticket Staff role
  let config;
  try {
    config = await TicketConfig.findOne({ guildId: interaction.guild.id }).lean();
  } catch (err) {
    console.error('[VOUCH CMD] Failed to fetch config:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!config || !config.staffRoleId) {
    await interaction.reply({
      content: '\u274C No **Ticket Staff** role is configured. An administrator needs to run `/ticket setup` first.',
      ephemeral: true,
    });
    return;
  }

  // Only members with the configured Ticket Staff role can use /vouch
  if (!interaction.member.roles.cache.has(config.staffRoleId)) {
    await interaction.reply({
      content: '\u274C Only members with the **Ticket Staff** role can use this command.',
      ephemeral: true,
    });
    return;
  }

  const vouchFor = interaction.options.getString('vouch-for').trim();
  const staffMember = interaction.member;

  const embed = new EmbedBuilder()
    .setTitle('Vouch')
    .setColor(0x000000)
    .addFields(
      { name: 'Vouched for', value: `<@${staffMember.id}>`, inline: false },
      { name: 'Service', value: vouchFor, inline: false },
      {
        name: 'How to Vouch',
        value: 'Click the **Vouch** button below to leave a rating and review.',
        inline: false,
      },
    );

  const button = new ButtonBuilder()
    .setCustomId('vouch_button')
    .setLabel('Vouch')
    .setStyle(ButtonStyle.Success)
    .setEmoji('\u2B50');

  const row = new ActionRowBuilder().addComponents(button);

  await interaction.reply({ embeds: [embed], components: [row] });
}
