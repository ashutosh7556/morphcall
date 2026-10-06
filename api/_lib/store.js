// Tiny key-value store: Upstash Redis over its REST API in production (free tier),
// an in-memory map for local development when no Redis credentials are set.
import { HttpError } from './http.js';

// Accepts the names Vercel's Upstash integration creates, with or without a custom
// prefix (e.g. KV_REST_API_URL, STORAGE_KV_REST_API_URL, UPSTASH_REDIS_REST_URL).
function findEnv(suffixes, exclude) {
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || (exclude && exclude.test(name))) continue;
    if (suffixes.some((suffix) => name === suffix || name.endsWith(`_${suffix}`))) return value.trim();
  }
  return '';
}

const url = () => findEnv(['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL']);
const token = () => findEnv(['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'], /READ_ONLY/);

// Names (never values) of database-looking variables, to explain configuration problems
const relatedEnvNames = () =>
  Object.keys(process.env).filter((name) => /REDIS|UPSTASH|(^|_)KV_/.test(name)).sort();

async function redis(...command) {
  let res;
  try {
    res = await fetch(url(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
  } catch (err) {
    throw new HttpError(503, 'db_unreachable', `Could not reach the Upstash Redis database (${err.message}). Check the REST URL.`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(503, 'db_auth_failed', 'The Upstash Redis token was rejected. Reconnect the database in Vercel and redeploy.');
  }
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result;
}

// --- in-memory fallback (local dev only; data is lost when the dev server restarts) ---
const mem = (globalThis.__morphcallMemStore ??= { kv: new Map(), sets: new Map() });

function memGet(key) {
  const entry = mem.kv.get(key);
  if (!entry) return null;
  if (entry.expires && entry.expires < Date.now()) {
    mem.kv.delete(key);
    return null;
  }
  return entry.value;
}

function isMemoryMode() {
  if (url() && token()) return false;
  if (process.env.VERCEL) {
    const found = relatedEnvNames();
    throw new HttpError(
      503,
      'not_configured',
      `Contacts are not configured on the server (missing Upstash Redis REST URL/token). ${
        found.length
          ? `Database variables found: ${found.join(', ')}. The REST URL and REST token are needed (names ending in KV_REST_API_URL and KV_REST_API_TOKEN).`
          : 'No database variables found: connect an Upstash Redis database to this project in Vercel and redeploy.'
      }`
    );
  }
  return true;
}

export async function getJson(key) {
  const raw = isMemoryMode() ? memGet(key) : await redis('GET', key);
  return raw ? JSON.parse(raw) : null;
}

export async function setJson(key, value, ttlSeconds) {
  const raw = JSON.stringify(value);
  if (isMemoryMode()) {
    mem.kv.set(key, { value: raw, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    return;
  }
  if (ttlSeconds) await redis('SET', key, raw, 'EX', String(ttlSeconds));
  else await redis('SET', key, raw);
}

export async function del(key) {
  if (isMemoryMode()) mem.kv.delete(key);
  else await redis('DEL', key);
}

export async function setAdd(key, member) {
  if (isMemoryMode()) {
    if (!mem.sets.has(key)) mem.sets.set(key, new Set());
    mem.sets.get(key).add(member);
  } else {
    await redis('SADD', key, member);
  }
}

export async function setRemove(key, member) {
  if (isMemoryMode()) mem.sets.get(key)?.delete(member);
  else await redis('SREM', key, member);
}

export async function setMembers(key) {
  if (isMemoryMode()) return [...(mem.sets.get(key) || [])];
  return (await redis('SMEMBERS', key)) || [];
}

export async function setHas(key, member) {
  if (isMemoryMode()) return Boolean(mem.sets.get(key)?.has(member));
  return (await redis('SISMEMBER', key, member)) === 1;
}
