const ROBLOX_API_TIMEOUT = 10_000;

/**
 * Fetch with a timeout wrapper so Roblox API calls never hang indefinitely.
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROBLOX_API_TIMEOUT);\n  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Look up a Roblox user by username and return { id, name }.
 * Uses Roblox's public v1 users-by-usernames API.
 * @param {string} username
 * @returns {Promise<{ id: string, name: string } | null>}
 */
export async function getRobloxUserId(username) {
  const cleaned = (username || '').trim();
  if (!cleaned) return null;

  let response;
  try {
    response = await fetchWithTimeout('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [cleaned], excludeBannedUsers: false }),
    });
  } catch (err) {
    console.error('[ROBLOX API] Username lookup request failed:', err.name);
    throw new Error('Roblox API request failed. Please try again later.');
  }

  if (response.status === 429) {
    throw new Error('Roblox API rate limit reached. Please try again later.');
  }

  if (!response.ok) {
    console.error('[ROBLOX API] Username lookup returned status:', response.status);
    throw new Error('Roblox API returned an error. Please try again later.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Roblox API returned an invalid response.');
  }

  if (!data || !Array.isArray(data.data) || data.data.length === 0) {
    return null;
  }

  const user = data.data[0];
  if (!user || !user.id) return null;

  return { id: String(user.id), name: user.name };
}

/**
 * Get the follower count for a Roblox user by user ID.
 * Uses Roblox's public friends/followers API.
 * @param {string} robloxUserId
 * @returns {Promise<number>}
 */
export async function getFollowerCount(robloxUserId) {
  if (!robloxUserId) return 0;

  let response;
  try {
    response = await fetchWithTimeout(`https://friends.roblox.com/v1/users/${robloxUserId}/followers/count`);
  } catch (err) {
    console.error('[ROBLOX API] Follower count request failed:', err.name);
    throw new Error('Roblox API request failed.');
  }

  if (response.status === 429) {
    throw new Error('Roblox API rate limit reached.');
  }

  if (!response.ok) {
    console.error('[ROBLOX API] Follower count returned status:', response.status);
    throw new Error('Roblox API returned an error.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Roblox API returned an invalid response.');
  }

  if (typeof data?.count !== 'number') {
    throw new Error('Roblox API returned an invalid follower count.');
  }

  return data.count;
}
