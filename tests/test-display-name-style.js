/**
 * Temporary test: PATCH /users/@me with display-name style payload.
 *
 * Tests the global /users/@me endpoint only — does NOT modify guild
 * nicknames or touch /guilds/{guild.id}/members/@me.
 *
 * Uses the existing DISCORD_TOKEN environment variable for authentication.
 * Logs the exact success or Discord API error response.
 *
 * Run: node tests/test-display-name-style.js
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const ENDPOINT = '/users/@me';

const payload = {
  display_name_styles: {
    font_id: 15,
    effect_id: 7,
    colors: [0, 4737096, 7105644, 10263708, 16579836],
  },
  display_name_font_id: 15,
  display_name_effect_id: 7,
  display_name_colors: [0, 4737096, 7105644, 10263708, 16579836],
};

async function main() {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.error('[TEST DISPLAY NAME] DISCORD_TOKEN is not set in the environment.');
    process.exit(1);
  }

  const url = `${DISCORD_API_BASE}${ENDPOINT}`;

  console.log(`[TEST DISPLAY NAME] Sending PATCH ${url}`);
  console.log('[TEST DISPLAY NAME] Payload:', JSON.stringify(payload, null, 2));

  let response;
  let rawBody;

  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    rawBody = await response.text();
  } catch (err) {
    console.error('[TEST DISPLAY NAME] Network/fetch error:');
    console.error(err);
    process.exit(1);
  }

  console.log(`[TEST DISPLAY NAME] Status: ${response.status} ${response.statusText}`);
  console.log('[TEST DISPLAY NAME] Response headers:');
  for (const [key, value] of response.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
    console.log('[TEST DISPLAY NAME] Response body (JSON):');
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log('[TEST DISPLAY NAME] Response body (raw):');
    console.log(rawBody || '(empty)');
  }

  if (response.ok) {
    console.log('[TEST DISPLAY NAME] Result: SUCCESS');
  } else {
    console.log('[TEST DISPLAY NAME] Result: DISCORD API ERROR');
  }
}

main().catch((err) => {
  console.error('[TEST DISPLAY NAME] Unhandled error:', err);
  process.exit(1);
});
