const AUTHORIZED_USER_ID = '1505729763296411891';
const DISCORD_API_BASE = 'https://discord.com/api/v10';

const PREFIX = 'R!';

/**
 * Handle R! Bot Profile and R! Bot Banner prefix commands.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled
 */
export async function handleBotProfilePrefix(message) {
  const content = message.content.slice(PREFIX.length).trim();
  const lower = content.toLowerCase();

  if (lower === 'bot profile' || lower.startsWith('bot profile ')) {
    await handleBotProfile(message);
    return true;
  }

  if (lower === 'bot banner' || lower.startsWith('bot banner ')) {
    await handleBotBanner(message);
    return true;
  }

  return false;
}

/**
 * Download an attachment and return it as a base64 data URI.
 * @param {import('discord.js').Attachment} attachment
 * @returns {Promise<{dataUri: string, contentType: string} | null>}
 */
async function downloadAttachmentAsDataUri(attachment) {
  const contentType = attachment.contentType || '';
  if (!contentType.startsWith('image/')) {
    return null;
  }

  let arrayBuffer;
  try {
    const res = await fetch(attachment.url);
    if (!res.ok) return null;
    arrayBuffer = await res.arrayBuffer();
  } catch {
    return null;
  }

  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  return { dataUri: `data:${contentType};base64,${base64}`, contentType };
}

/**
 * PATCH /guilds/{guild.id}/members/@me with a single field.
 * @param {string} token
 * @param {string} guildId
 * @param {string} field
 * @param {string} value
 * @returns {Promise<{ok: boolean, status: number, body: string}>}
 */
async function patchGuildMember(token, guildId, field, value) {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/@me`;

  let response;
  let rawBody;

  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ [field]: value }),
    });
    rawBody = await response.text();
  } catch (err) {
    return { ok: false, status: 0, body: err.message };
  }

  return { ok: response.ok, status: response.status, body: rawBody };
}

async function handleBotProfile(message) {
  if (message.author.id !== AUTHORIZED_USER_ID) {
    await message.reply('\u274C You are not authorized to use this command.');
    return;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply('\u274C Please attach an image to set as the bot\u2019s server profile picture.');
    return;
  }

  const downloaded = await downloadAttachmentAsDataUri(attachment);
  if (!downloaded) {
    await message.reply('\u274C The attached file is not a valid image. Please attach a PNG, JPEG, or GIF file.');
    return;
  }

  const token = process.env.DISCORD_TOKEN;
  const result = await patchGuildMember(token, message.guild.id, 'avatar', downloaded.dataUri);

  if (result.ok) {
    await message.reply('\u2705 The bot\u2019s server profile picture has been updated for this server.');
  } else {
    console.error('[BOT PROFILE] Discord API error:', result.status, result.body);
    await message.reply(`\u274C Failed to update the server profile picture. Discord API returned status ${result.status}.`);
  }
}

async function handleBotBanner(message) {
  if (message.author.id !== AUTHORIZED_USER_ID) {
    await message.reply('\u274C You are not authorized to use this command.');
    return;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply('\u274C Please attach an image to set as the bot\u2019s server banner.');
    return;
  }

  const downloaded = await downloadAttachmentAsDataUri(attachment);
  if (!downloaded) {
    await message.reply('\u274C The attached file is not a valid image. Please attach a PNG, JPEG, or GIF file.');
    return;
  }

  const token = process.env.DISCORD_TOKEN;
  const result = await patchGuildMember(token, message.guild.id, 'banner', downloaded.dataUri);

  if (result.ok) {
    await message.reply('\u2705 The bot\u2019s server banner has been updated for this server.');
  } else {
    console.error('[BOT BANNER] Discord API error:', result.status, result.body);
    await message.reply(`\u274C Failed to update the server banner. Discord API returned status ${result.status}.`);
  }
}
