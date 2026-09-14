import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { FollowerStock } from '../db/models/FollowerStock.js';
import { formatAmount } from '../utils/followerStockHelpers.js';
import { registerFollowerPanel } from '../components/follower-panel.js';

export const data = new SlashCommandBuilder()
  .setName('follower')
  .setDescription('Configure the Roblox Followers Stock System.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  let stockDoc;
  try {
    stockDoc = await FollowerStock.findOne({ guildId: interaction.guild.id });
  } catch (err) {
    console.error('[FOLLOWER STOCK] Failed to fetch config:', err.message);
    await interaction.reply({ content: '\u274C The database is unavailable. Please try again later.', ephemeral: true });
    return;
  }

  if (!stockDoc) {
    stockDoc = new FollowerStock({
      guildId: interaction.guild.id,
      startingStock: 0,
      currentStock: 0,
    });
    try {
      await stockDoc.save();
    } catch (err) {
      console.error('[FOLLOWER STOCK] Failed to create config:', err.message);
      await interaction.reply({ content: '\u274C Failed to initialize the stock system. Please try again.', ephemeral: true });
      return;
    }
  }

  registerFollowerPanel(interaction.user.id, interaction.channelId, interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('\u{1F4E6} Followers Stock Setup')
    .setDescription(
      `**Starting Stock:** ${formatAmount(stockDoc.startingStock)}\n` +
      `**Current Stock:** ${formatAmount(stockDoc.currentStock)}\n` +
      `**Stock Channel:** ${stockDoc.channelId ? `<#${stockDoc.channelId}>` : 'Not set'}\n` +
      `**Stock Message:** ${stockDoc.messageId ? `[Message](${`https://discord.com/channels/${interaction.guild.id}/${stockDoc.channelId}/${stockDoc.messageId}`})` : 'Not sent'}`,
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

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
