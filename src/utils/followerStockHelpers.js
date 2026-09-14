import { EmbedBuilder } from 'discord.js';

/**
 * Utilities for the Followers Stock System.
 */

/**
 * Parse an amount string that may contain k/K suffixes.
 * Accepts: "100", "1000", "1k", "2.5k", "10k", "2500"
 * @param {string} input
 * @returns {number|null} parsed amount, or null if invalid
 */
export function parseAmount(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(k)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0) return null;

  const amount = match[2] ? Math.round(value * 1000) : Math.round(value);
  if (amount <= 0) return null;

  return amount;
}

/**
 * Format a number with commas.
 * @param {number} n
 * @returns {string}
 */
export function formatAmount(n) {
  return (n || 0).toLocaleString('en-US');
}

/**
 * Determine stock status based on current stock.
 * @param {number} currentStock
 * @returns {{ emoji: string, label: string }}
 */
export function getStockStatus(currentStock) {
  if (currentStock <= 0) return { emoji: '\uD83D\uDD34', label: 'Out of Stock' };
  if (currentStock < 1000) return { emoji: '\uD83D\uDFE1', label: 'Low Stock' };
  return { emoji: '\uD83D\uDFE2', label: 'In Stock' };
}

/**
 * Format a relative-time string for "Last Updated".
 * @param {Date|null} date
 * @returns {string}
 */
export function formatLastUpdated(date) {
  if (!date) return 'never';
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Parse a hex color string into a numeric value.
 * @param {string} input
 * @returns {number}
 */
export function parseColor(input) {
  if (!input) return 0x2b2d31;
  const cleaned = input.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return 0x2b2d31;
  return parseInt(cleaned, 16);
}

/**
 * Build the public stock embed from a FollowerStock document.
 * @param {object} stockDoc
 * @returns {import('discord.js').EmbedBuilder}
 */
export function buildStockEmbed(stockDoc) {
  const status = getStockStatus(stockDoc.currentStock);
  const cfg = stockDoc.embedConfig || {};

  const stockInfo = `${status.emoji} **Status:** ${status.label}\n\u{1F465} **Available:** ${formatAmount(stockDoc.currentStock)} Followers\n\u{1F550} **Last Updated:** ${formatLastUpdated(stockDoc.lastUpdated)}`;

  const description = cfg.description && cfg.description.trim()
    ? `${cfg.description.trim()}\n\n${stockInfo}`
    : stockInfo;

  const embed = new EmbedBuilder()
    .setTitle(cfg.title || 'Roblox Followers Stock')
    .setDescription(description)
    .setColor(parseColor(cfg.color));

  if (cfg.image && cfg.image.trim()) {
    embed.setImage(cfg.image.trim());
  }
  if (cfg.footer && cfg.footer.trim()) {
    embed.setFooter({ text: cfg.footer.trim() });
  }

  return embed;
}
