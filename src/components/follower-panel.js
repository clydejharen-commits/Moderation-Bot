import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';
import { FollowerStock } from '../db/models/FollowerStock.js';
import { isDatabaseConnected } from '../db/database.js';
import {
  buildStockEmbed,
  parseAmount,
  formatAmount,
  parseColor,
} from '../utils/followerStockHelpers.js';

const activePanels = new Map();

function panelKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

export function registerFollowerPanel(userId, channelId, guildId) {
  activePanels.set(panelKey(userId, channelId), { userId, channelId, guildId });
}

function getFollowerPanel(userId, channelId) {
  return activePanels.get(panelKey(userId, channelId)) || null;
}

function deleteFollowerPanel(userId, channelId) {
  activePanels.delete(panelKey(userId, channelId));
}

export function isFollowerButton(customId) {
  return customId.startsWith('follower_');
}

export function isFollowerModal(customId) {
  return customId.startsWith('follower_modal_');
}

export function isFollowerSelect(customId) {
  return customId === 'follower_select_channel';
}

/**
 * Rebuild the main setup panel embed + buttons.
 */
async function refreshPanel(interaction, stockDoc) {
  const embed = new EmbedBuilder()
    .setTitle('\u{1F4E6} Followers Stock Setup')
    .setDescription(
      `**Starting Stock:** ${formatAmount(stockDoc.startingStock)}\n` +
      `**Current Stock:** ${formatAmount(stockDoc.currentStock)}\n` +
      `**Stock Channel:** ${stockDoc.channelId ? `<#${stockDoc.channelId}>` : 'Not set'}\n` +
      `**Stock Message:** ${stockDoc.messageId ? `[Message](${`https://discord.com/channels/${stockDoc.guildId}/${stockDoc.channelId}/${stockDoc.messageId}`})` : 'Not sent'}`,
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Only you can interact with this panel.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('follower_stock').setLabel('\u{1F4E6} Stock').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('follower_edit_embed').setLabel('\u270F\uFE0F Edit Embed').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('follower_preview').setLabel('\u{1F441}\uFE0F Preview').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('follower_send').setLabel('\u{1F4E4} Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('follower_cancel').setLabel('\u274C Cancel').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Handle button interactions for the follower stock setup panel.
 */
export async function handleFollowerButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getFollowerPanel(userId, channelId);

  // Cancel always works
  if (customId === 'follower_cancel') {
    deleteFollowerPanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '\u274C Followers stock setup cancelled.' });
    return;
  }

  if (!panel) {
    await interaction.reply({ content: '\u274C This panel is no longer active.', ephemeral: true });
    return;
  }

  if (interaction.guild.id !== panel.guildId) {
    await interaction.reply({ content: '\u274C This panel is not for this server.', ephemeral: true });
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: panel.guildId });
  } catch (err) {
    console.error('[FOLLOWER PANEL] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error. Please try again.', ephemeral: true });
    return;
  }

  if (!stockDoc) {
    await interaction.reply({ content: '\u274C Stock configuration not found. Run /follower again.', ephemeral: true });
    deleteFollowerPanel(userId, channelId);
    return;
  }

  switch (customId) {
    case 'follower_stock':
      await showStockModal(interaction, stockDoc);
      break;
    case 'follower_edit_embed':
      await showEditEmbedModal(interaction, stockDoc);
      break;
    case 'follower_preview':
      await showPreview(interaction, stockDoc);
      break;
    case 'follower_send':
      await sendStockEmbed(interaction, stockDoc);
      break;
    case 'follower_update':
      await updateStockEmbed(interaction, stockDoc);
      break;
    default:
      if (customId === 'follower_delete_confirm') {
        await handleDeleteConfirm(interaction, stockDoc);
      } else if (customId === 'follower_delete_cancel') {
        await interaction.update({ embeds: [], components: [], content: '\u274C Deletion cancelled.' });
      }
      break;
  }
}

/**
 * Show the stock modal (starting stock + current stock).
 */
async function showStockModal(interaction, stockDoc) {
  const modal = new ModalBuilder().setCustomId('follower_modal_stock').setTitle('Set Stock');

  const startingInput = new TextInputBuilder()
    .setCustomId('follower_starting_stock')
    .setLabel('Starting/Daily Stock (e.g. 25000 or 25k)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);
  if (stockDoc.startingStock) startingInput.setValue(String(stockDoc.startingStock));

  const currentInput = new TextInputBuilder()
    .setCustomId('follower_current_stock')
    .setLabel('Current Stock (e.g. 18500 or 18.5k)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);
  if (stockDoc.currentStock) currentInput.setValue(String(stockDoc.currentStock));

  modal.addComponents(
    new ActionRowBuilder().addComponents(startingInput),
    new ActionRowBuilder().addComponents(currentInput),
  );

  await interaction.showModal(modal);
}

/**
 * Show the edit embed modal.
 */
async function showEditEmbedModal(interaction, stockDoc) {
  const modal = new ModalBuilder().setCustomId('follower_modal_embed').setTitle('Edit Stock Embed');
  const cfg = stockDoc.embedConfig || {};

  const titleInput = new TextInputBuilder()
    .setCustomId('follower_embed_title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256)
    .setValue(cfg.title || 'Roblox Followers Stock');

  const descInput = new TextInputBuilder()
    .setCustomId('follower_embed_description')
    .setLabel('Description (shown above stock info)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1024)
    .setValue(cfg.description || '');

  const colorInput = new TextInputBuilder()
    .setCustomId('follower_embed_color')
    .setLabel('Color (hex, e.g. #2b2d31)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7)
    .setValue(cfg.color || '#2b2d31');

  const imageInput = new TextInputBuilder()
    .setCustomId('follower_embed_image')
    .setLabel('Image URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(512)
    .setValue(cfg.image || '');

  const footerInput = new TextInputBuilder()
    .setCustomId('follower_embed_footer')
    .setLabel('Footer text')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048)
    .setValue(cfg.footer || 'Followers Stock System');

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(imageInput),
    new ActionRowBuilder().addComponents(footerInput),
  );

  await interaction.showModal(modal);
}

/**
 * Show a preview of the stock embed.
 */
async function showPreview(interaction, stockDoc) {
  const embed = buildStockEmbed(stockDoc);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Send the stock embed to a channel (with channel selection).
 */
async function sendStockEmbed(interaction, stockDoc) {
  // Show channel select menu
  const select = new StringSelectMenuBuilder()
    .setCustomId('follower_select_channel')
    .setPlaceholder('Select a channel for the stock embed')
    .addChannels(
      interaction.guild.channels.cache
        .filter((ch) => ch.type === ChannelType.GuildText && ch.viewable)
        .first(25)
        .map((ch) => ({ label: ch.name, value: ch.id })),
    );

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: 'Select a channel to send the stock embed:', components: [row], ephemeral: true });
}

/**
 * Update the existing stock embed in place.
 */
async function updateStockEmbed(interaction, stockDoc) {
  if (!stockDoc.channelId || !stockDoc.messageId) {
    await interaction.reply({ content: '\u274C No stock message has been sent yet. Use \u{1F4E4} Send first.', ephemeral: true });
    return;
  }

  try {
    const channel = await interaction.client.channels.fetch(stockDoc.channelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ content: '\u274C The stock channel no longer exists.', ephemeral: true });
      return;
    }

    const message = await channel.messages.fetch(stockDoc.messageId).catch(() => null);
    if (!message) {
      await interaction.reply({ content: '\u274C The stock message no longer exists. Use \u{1F4E4} Send to create a new one.', ephemeral: true });
      return;
    }

    const embed = buildStockEmbed(stockDoc);
    await message.edit({ embeds: [embed] });
    await interaction.reply({ content: '\u2705 Stock embed updated.', ephemeral: true });
  } catch (err) {
    console.error('[FOLLOWER PANEL] Update failed:', err.message);
    await interaction.reply({ content: '\u274C Failed to update the stock embed.', ephemeral: true });
  }
}

/**
 * Handle modal submissions for the follower stock system.
 */
export async function handleFollowerModal(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const panel = getFollowerPanel(userId, channelId);

  if (!panel) {
    await interaction.reply({ content: '\u274C This panel is no longer active.', ephemeral: true });
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: panel.guildId });
  } catch (err) {
    console.error('[FOLLOWER MODAL] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error.', ephemeral: true });
    return;
  }

  if (!stockDoc) {
    await interaction.reply({ content: '\u274C Stock configuration not found.', ephemeral: true });
    deleteFollowerPanel(userId, channelId);
    return;
  }

  if (customId === 'follower_modal_stock') {
    const startingRaw = interaction.fields.getTextInputValue('follower_starting_stock');
    const currentRaw = interaction.fields.getTextInputValue('follower_current_stock');

    const starting = parseAmount(startingRaw);
    const current = parseAmount(currentRaw);

    if (starting === null) {
      await interaction.reply({ content: '\u274C Invalid starting stock amount.', ephemeral: true });
      return;
    }
    if (current === null) {
      await interaction.reply({ content: '\u274C Invalid current stock amount.', ephemeral: true });
      return;
    }

    stockDoc.startingStock = starting;
    stockDoc.currentStock = current;
    stockDoc.lastUpdated = new Date();
    try {
      await stockDoc.save();
    } catch (err) {
      console.error('[FOLLOWER MODAL] Save failed:', err.message);
      await interaction.reply({ content: '\u274C Failed to save stock.', ephemeral: true });
      return;
    }

    const refreshed = await refreshPanel(interaction, stockDoc);
    await interaction.update({ ...refreshed });
    await interaction.followUp({ content: `\u2705 Stock updated. Starting: ${formatAmount(starting)}, Current: ${formatAmount(current)}`, ephemeral: true });
    return;
  }

  if (customId === 'follower_modal_embed') {
    const title = interaction.fields.getTextInputValue('follower_embed_title');
    const description = interaction.fields.getTextInputValue('follower_embed_description') || '';
    const color = interaction.fields.getTextInputValue('follower_embed_color') || '#2b2d31';
    const image = interaction.fields.getTextInputValue('follower_embed_image') || '';
    const footer = interaction.fields.getTextInputValue('follower_embed_footer') || 'Followers Stock System';

    stockDoc.embedConfig = { title, description, color, image, footer };
    try {
      await stockDoc.save();
    } catch (err) {
      console.error('[FOLLOWER MODAL] Save failed:', err.message);
      await interaction.reply({ content: '\u274C Failed to save embed config.', ephemeral: true });
      return;
    }

    const refreshed = await refreshPanel(interaction, stockDoc);
    await interaction.update({ ...refreshed });
    await interaction.followUp({ content: '\u2705 Embed configuration saved.', ephemeral: true });
    return;
  }
}

/**
 * Handle string select menu interactions (channel selection).
 */
export async function handleFollowerSelect(interaction) {
  if (interaction.customId !== 'follower_select_channel') return;

  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const panel = getFollowerPanel(userId, channelId);

  if (!panel) {
    await interaction.reply({ content: '\u274C This panel is no longer active.', ephemeral: true });
    return;
  }

  const selectedChannelId = interaction.values[0];
  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: panel.guildId });
  } catch (err) {
    console.error('[FOLLOWER SELECT] DB error:', err.message);
    await interaction.reply({ content: '\u274C Database error.', ephemeral: true });
    return;
  }

  if (!stockDoc) {
    await interaction.reply({ content: '\u274C Stock configuration not found.', ephemeral: true });
    return;
  }

  try {
    const channel = await interaction.client.channels.fetch(selectedChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: '\u274C That channel is not available.', ephemeral: true });
      return;
    }

    const botPerms = channel.permissionsFor(interaction.guild.members.me);
    if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages) || !botPerms.has(PermissionFlagsBits.EmbedLinks)) {
      await interaction.reply({ content: '\u274C I need Send Messages and Embed Links permission in that channel.', ephemeral: true });
      return;
    }

    const embed = buildStockEmbed(stockDoc);
    const sentMessage = await channel.send({ embeds: [embed] });

    // Delete old message if it exists
    if (stockDoc.messageId && stockDoc.channelId) {
      try {
        const oldCh = await interaction.client.channels.fetch(stockDoc.channelId).catch(() => null);
        if (oldCh) {
          const oldMsg = await oldCh.messages.fetch(stockDoc.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        }
      } catch {
        // Old message already gone — ignore
      }
    }

    stockDoc.channelId = selectedChannelId;
    stockDoc.messageId = sentMessage.id;
    stockDoc.lastUpdated = new Date();
    await stockDoc.save();

    const refreshed = await refreshPanel(interaction, stockDoc);
    await interaction.update({ ...refreshed });
    await interaction.followUp({ content: `\u2705 Stock embed sent to <#${selectedChannelId}>.`, ephemeral: true });
  } catch (err) {
    console.error('[FOLLOWER SELECT] Send failed:', err.message);
    await interaction.reply({ content: '\u274C Failed to send the stock embed.', ephemeral: true });
  }
}

/**
 * Handle the delete confirmation button.
 */
async function handleDeleteConfirm(interaction, stockDoc) {
  // Delete the stock message if it exists
  if (stockDoc.channelId && stockDoc.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(stockDoc.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(stockDoc.messageId).catch(() => null);
        if (message) await message.delete().catch(() => {});
      }
    } catch {
      // Message already gone — ignore
    }
  }

  try {
    await FollowerStock.deleteOne({ guildId: stockDoc.guildId });
  } catch (err) {
    console.error('[FOLLOWER DELETE] DB error:', err.message);
    await interaction.update({ content: '\u274C Failed to delete stock configuration.', embeds: [], components: [] });
    return;
  }

  deleteFollowerPanel(interaction.user.id, interaction.channelId);
  await interaction.update({ content: '\u2705 Followers stock system deleted.', embeds: [], components: [] });
}

/**
 * Show the delete confirmation panel (used by R!stock delete).
 */
export async function showDeleteConfirmation(message, stockDoc) {
  const embed = new EmbedBuilder()
    .setTitle('\u{1F5D1}\uFE0F Delete Followers Stock?')
    .setDescription('This will permanently remove the stock configuration and delete the current stock embed.')
    .setColor(0xe74c3c)
    .setFooter({ text: 'You have 5 minutes to confirm.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('follower_delete_confirm').setLabel('\u2705 Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('follower_delete_cancel').setLabel('\u274C Cancel').setStyle(ButtonStyle.Secondary),
  );

  const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

  // Register a temporary panel so the buttons work
  registerFollowerPanel(message.author.id, message.channelId, message.guild.id);

  // Set a timeout to disable buttons
  setTimeout(async () => {
    try {
      const expiredRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('follower_delete_confirm').setLabel('\u2705 Confirm').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId('follower_delete_cancel').setLabel('\u274C Cancel').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await confirmMsg.edit({ content: '\u274C Confirmation timed out.', embeds: [], components: [expiredRow] }).catch(() => {});
      deleteFollowerPanel(message.author.id, message.channelId);
    } catch {
      // Message may be deleted — ignore
    }
  }, 5 * 60 * 1000);
}
