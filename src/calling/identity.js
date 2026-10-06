/**
 * identity.js
 * This browser's permanent identity (no accounts): a random device ID that friends call,
 * a secret that proves ownership to the server, and a display name.
 */

const IDENTITY_KEY = 'morphcall_identity';
const MODE_KEY = 'morphcall_mode';
const CONTACTS_KEY = 'morphcall_contacts';

function randomString(bytes, alphabet) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((v) => alphabet[v % alphabet.length]).join('');
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
}

export function getIdentity() {
  let identity = read(IDENTITY_KEY, null);
  if (!identity?.id || !identity?.secret) {
    identity = {
      id: randomString(20, 'abcdefghijklmnopqrstuvwxyz0123456789'),
      secret: randomString(40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'),
      name: '',
    };
    write(IDENTITY_KEY, identity);
  }
  return identity;
}

export function saveName(name) {
  const identity = getIdentity();
  identity.name = String(name || '').trim().slice(0, 30);
  write(IDENTITY_KEY, identity);
  return identity;
}

// 'full' = owner app with voice effects, 'plain' = friend's plain call app
export function getMode() {
  return read(MODE_KEY, null);
}

export function setMode(mode) {
  write(MODE_KEY, mode);
}

export function getCachedContacts() {
  return read(CONTACTS_KEY, []);
}

export function cacheContacts(contacts) {
  write(CONTACTS_KEY, contacts);
}

export class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Calls /api/rpc with this device's credentials attached
export async function rpc(action, params = {}) {
  const { id, secret } = getIdentity();
  let res;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, deviceId: id, secret, ...params }),
    });
  } catch {
    throw new RpcError('network', 'Could not reach the server. Check your internet connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new RpcError(data.error || 'server_error', data.message || `Request failed (${res.status}).`);
  return data;
}

// "ABCD2345" -> "ABCD-2345"
export function formatPairCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
