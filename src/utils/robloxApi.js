const ROBLOX_API_TIMEOUT = 10_000;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const CACHE_TTL_MS = 5_000;

let requestChain = Promise.resolve();

const followerCountCache = new Map();

/**
 * Enqueue a function into the sequential Roblox API request queue.
 * Only one request runs at a time; a small delay is added between requests.
 * Errors in one request do not block subsequent queued requests.
 * @param {() => Promise} fn
 * @returns {Promise}
 */
function enqueueSequential(fn) {
  const result = requestChain.then(fn, fn);
  requestChain = result.then(
    () => new Promise((r) => setTimeout(r, REQUEST_DELAY_MS)),
    () => new Promise((r) => setTimeout(r, REQUEST_DELAY_MS)),
  );
  return result;
}

/**
 * Parse the Retry-After header into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 * Returns -1 if the header is absent or unparseable.
 * @param {Response} response
 * @returns {number}
 */
function parseRetryAfter(response) {
  const header = response.headers.get('Retry-After');
  if (!header) return -1;

  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  }

  return -1;
}

/**
 * Compute backoff delay for a given retry attempt when Retry-After is absent.
 * Exponential: 1s, 2s, 4s (capped at 4s).
 * @param {number} attempt
 * @returns {number} milliseconds
 */
function exponentialBackoff(attempt) {
  return Math.min(1000 * Math.pow(2, attempt), 4000);
}

/**
 * Fetch with a timeout wrapper so Roblox API calls never hang indefinitely.
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROBLOX_API_TIMEOUT);
  try {
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

  return enqueueSequential(() => fetchUserIdWithRetry(cleaned));
}

async function fetchUserIdWithRetry(username, attempt = 0) {
  let response;
  try {
    response = await fetchWithTimeout('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
  } catch (err) {
    console.error('[ROBLOX API] Username lookup request failed:', err.name);
    throw new Error('Roblox API request failed. Please try again later.');
  }

  if (response.status === 429) {
    if (attempt < MAX_RETRIES) {
      const retryAfterMs = parseRetryAfter(response);
      const backoffMs = retryAfterMs > 0 ? retryAfterMs : exponentialBackoff(attempt);
      console.warn(`[ROBLOX API] Username lookup rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}).`);
      await new Promise((r) => setTimeout(r, backoffMs));
      return fetchUserIdWithRetry(username, attempt + 1);
    }
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
 * Results are cached for a short period so that multiple trackers for the
 * same Roblox account reuse a single API response within one check cycle.
 * @param {string} robloxUserId
 * @returns {Promise<number>}
 */
export async function getFollowerCount(robloxUserId) {
  if (!robloxUserId) return 0;

  const cached = followerCountCache.get(robloxUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  return enqueueSequential(() => fetchFollowerCountWithRetry(robloxUserId));
}

async function fetchFollowerCountWithRetry(robloxUserId, attempt = 0) {
  let response;
  try {
    response = await fetchWithTimeout(`https://friends.roblox.com/v1/users/${robloxUserId}/followers/count`);
  } catch (err) {
    console.error('[ROBLOX API] Follower count request failed:', err.name);
    throw new Error('Roblox API request failed.');
  }

  if (response.status === 429) {
    if (attempt < MAX_RETRIES) {
      const retryAfterMs = parseRetryAfter(response);
      const backoffMs = retryAfterMs > 0 ? retryAfterMs : exponentialBackoff(attempt);
      console.warn(`[ROBLOX API] Follower count rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}).`);
      await new Promise((r) => setTimeout(r, backoffMs));
      return fetchFollowerCountWithRetry(robloxUserId, attempt + 1);
    }
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

  followerCountCache.set(robloxUserId, {
    count: data.count,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data.count;
}
