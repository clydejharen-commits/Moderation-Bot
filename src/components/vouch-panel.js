import {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { TicketConfig } from '../db/models/TicketConfig.js';
import { Vouch } from '../db/models/Vouch.js';

const VOUCH_BUTTON_ID = 'vouch_button';
const VOUCH_MODAL_ID = 'vouch_modal';
const VOUCH_RATING_FIELD = 'vouch_rating';
const VOUCH_REVIEW_FIELD = 'vouch_review';

/**
 * Check whether a button interaction belongs to the vouch panel.
 * @param {string} customId
 * @returns {boolean}
 */
export function isVouchButton(customId) {
  return customId === VOUCH_BUTTON_ID;
}

/**
 * Check whether a modal submission belongs to the vouch panel.
 * @param {string} customId
 * @returns {boolean}
 */
export function isVouchModal(customId) {
  return customId === VOUCH_MODAL_ID;
}

/**
 * Handle the Vouch button click — checks for duplicate vouches, then
 * shows a modal asking for a rating (1-5) and a written review.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleVouchButton(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const panelMessageId = interaction.message.id;

  // Check for an existing vouch by this member on this panel
  let existingVouch;
  try {
    existingVouch = await Vouch.findOne({
      guildId: guild.id,
      panelMessageId,
      vouchedById: member.id,
    }).lean();
  } catch (err) {
    console.error('[VOUCH PANEL] Failed to check existing vouch:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existingVouch) {
    await interaction.reply({
      content: '\u274C You have already vouched on this panel. You can vouch again on other panels.',
      ephemeral: true,
    });
    return;
  }

  // Extract the "Vouch For" text from the panel embed
  let vouchFor = 'Unknown';
  const embed = interaction.message.embeds?.[0];
  if (embed) {
    const field = embed.fields?.find((f) => f.name === 'Vouch For');
    if (field) {
      vouchFor = field.value;
    }
  }

  // Build the modal
  const modal = new ModalBuilder()
    .setCustomId(VOUCH_MODAL_ID)
    .setTitle('Leave a Vouch');

  const ratingInput = new TextInputBuilder()
    .setCustomId(VOUCH_RATING_FIELD)
    .setLabel('Rating (1-5 stars)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1)
    .setPlaceholder('Enter a number from 1 to 5');

  const reviewInput = new TextInputBuilder()
    .setCustomId(VOUCH_REVIEW_FIELD)
    .setLabel('Written Review')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Write your review here...');

  modal.addComponents(
    new ActionRowBuilder().addComponents(ratingInput),
    new ActionRowBuilder().addComponents(reviewInput),
  );

  await interaction.showModal(modal);
}

/**
 * Handle the vouch modal submission — validates the rating, saves the
 * vouch to MongoDB, and sends the completed vouch embed to the
 * configured Vouch Channel.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleVouchModal(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  // Get the rating and review from the modal
  const ratingRaw = interaction.fields.getTextInputValue(VOUCH_RATING_FIELD).trim();
  const review = interaction.fields.getTextInputValue(VOUCH_REVIEW_FIELD).trim();

  // Validate the rating — must be an integer from 1 to 5
  const rating = parseInt(ratingRaw, 10);
  if (Number.isNaN(rating) || rating < 1 || rating > 5 || !/^[1-5]$/.test(ratingRaw)) {
    await interaction.reply({
      content: '\u274C Invalid rating. Please enter a whole number from **1** to **5**.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the panel message ID from the interaction — Discord carries the
  // message context in the modal submission
  const panelMessageId = interaction.message?.id;

  if (!panelMessageId) {
    await interaction.reply({
      content: '\u274C Could not determine the vouch panel. Please try again.',
      ephemeral: true,
    });
    return;
  }

  // Extract the "Vouch For" text from the panel embed
  let vouchFor = 'Unknown';
  if (interaction.message?.embeds?.[0]) {
    const field = interaction.message.embeds[0].fields?.find((f) => f.name === 'Vouch For');
    if (field) {
      vouchFor = field.value;
    }
  }

  // Re-check for duplicate vouch (race condition guard)
  let existingVouch;
  try {
    existingVouch = await Vouch.findOne({
      guildId: guild.id,
      panelMessageId,
      vouchedById: member.id,
    }).lean();
  } catch (err) {
    console.error('[VOUCH PANEL] Failed to re-check existing vouch:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (existingVouch) {
    await interaction.reply({
      content: '\u274C You have already vouched on this panel.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the ticket config to get the vouch channel
  let config;
  try {
    config = await TicketConfig.findOne({ guildId: guild.id }).lean();
  } catch (err) {
    console.error('[VOUCH PANEL] Failed to fetch config:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again later.', ephemeral: true });
    return;
  }

  if (!config || !config.vouchChannelId) {
    await interaction.reply({
      content: '\u274C No **Vouch Channel** is configured. An administrator needs to run `/ticket setup` and set a Vouch Channel.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the vouch channel — handle the case where it was deleted
  let vouchChannel;
  try {
    vouchChannel = await guild.channels.fetch(config.vouchChannelId);
  } catch {
    vouchChannel = null;
  }

  if (!vouchChannel) {
    await interaction.reply({
      content: '\u274C The configured **Vouch Channel** could not be found — it may have been deleted. An administrator needs to run `/ticket setup` and set a new Vouch Channel.',
      ephemeral: true,
    });
    return;
  }

  // Check bot permissions in the vouch channel
  const botPerms = vouchChannel.permissionsFor(guild.members.me);
  if (!botPerms?.has('SendMessages') || !botPerms?.has('EmbedLinks')) {
    await interaction.reply({
      content: '\u274C I need **Send Messages** and **Embed Links** permissions in the Vouch Channel to post vouches.',
      ephemeral: true,
    });
    return;
  }

  // Save the vouch to MongoDB first — if this fails, do not mark as completed
  try {
    await Vouch.create({
      guildId: guild.id,
      panelMessageId,
      vouchedById: member.id,
      vouchFor,
      rating,
      review,
    });
  } catch (err) {
    if (err.code === 11000) {
      await interaction.reply({
        content: '\u274C You have already vouched on this panel.',
        ephemeral: true,
      });
      return;
    }
    console.error('[VOUCH PANEL] Failed to save vouch:', err.message);
    await interaction.reply({
      content: '\u274C Failed to submit your vouch. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  // Build the completed vouch embed
  const stars = '\u2B50'.repeat(rating);
  const vouchEmbed = new EmbedBuilder()
    .setTitle('\u{1F4AF} New Vouch')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Rating', value: `${stars} (${rating}/5)`, inline: false },
      { name: 'Vouch For', value: vouchFor, inline: false },
      { name: 'Vouched By', value: `<@${member.id}>`, inline: false },
      { name: 'Review', value: review, inline: false },
    )
    .setFooter({ text: `Vouched by ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
    .setTimestamp();

  // Send the completed vouch to the vouch channel
  try {
    await vouchChannel.send({ embeds: [vouchEmbed] });
  } catch (err) {
    // If sending fails, remove the vouch record so the member can try again
    console.error('[VOUCH PANEL] Failed to send vouch to channel:', err.message);
    try {
      await Vouch.deleteOne({ guildId: guild.id, panelMessageId, vouchedById: member.id });
    } catch (deleteErr) {
      console.error('[VOUCH PANEL] Failed to rollback vouch record:', deleteErr.message);
    }
    await interaction.reply({
      content: '\u274C Failed to post your vouch to the Vouch Channel. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: '\u2705 Vouch submitted successfully!',
    ephemeral: true,
  });
}
