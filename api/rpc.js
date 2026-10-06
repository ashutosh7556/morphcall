import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpError, readJson, sendJson } from './_lib/http.js';
import { del, getJson, setAdd, setHas, setJson, setMembers, setRemove } from './_lib/store.js';
import { getPublicKey, sendPush } from './_lib/push.js';

// POST /api/rpc  { action, deviceId, secret, ...params }
//
// Contacts & call notifications for MorphCall. There are no accounts: each browser
// creates a random device ID plus a secret, and proves ownership with that secret.
// Audio never passes through here; this only stores friendships and sends push "rings".

const PAIR_TTL_SECONDS = 15 * 60;
const PAIR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEVICE_ID = /^[a-z0-9]{16,40}$/;

const devKey = (id) => `dev:${id}`;
const friendsKey = (id) => `friends:${id}`;
const pairKey = (code) => `pair:${code}`;

const hashSecret = (secret) => createHash('sha256').update(String(secret)).digest('hex');

function cleanName(name) {
  const value = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return value || null;
}

function normalizePairCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Verify the caller owns this device ID. With create=true an unknown ID is registered.
async function authenticate(body, { create = false } = {}) {
  const { deviceId, secret } = body;
  if (!DEVICE_ID.test(String(deviceId || '')) || String(secret || '').length < 32) {
    throw new HttpError(400, 'bad_request', 'Invalid device credentials.');
  }
  const hash = hashSecret(secret);
  let device = await getJson(devKey(deviceId));

  if (!device) {
    if (!create) throw new HttpError(401, 'unknown_device', 'This device is not registered yet.');
    device = { name: cleanName(body.name) || 'Friend', secretHash: hash, subscription: null, createdAt: Date.now() };
    await setJson(devKey(deviceId), device);
    return { id: deviceId, device };
  }

  const ok = timingSafeEqual(Buffer.from(device.secretHash, 'hex'), Buffer.from(hash, 'hex'));
  if (!ok) throw new HttpError(403, 'forbidden', 'Device secret does not match.');
  return { id: deviceId, device };
}

async function notify(deviceId, payload, options) {
  const device = await getJson(devKey(deviceId));
  if (!device?.subscription) return 'no_subscription';
  const result = await sendPush(device.subscription, payload, options);
  if (result === 'gone') {
    device.subscription = null;
    await setJson(devKey(deviceId), device);
  }
  return result;
}

async function requireFriend(id, friendId) {
  if (!DEVICE_ID.test(String(friendId || '')) || !(await setHas(friendsKey(id), friendId))) {
    throw new HttpError(403, 'not_friends', 'You can only call people in your contacts.');
  }
}

const actions = {
  // Public VAPID key the browser needs to subscribe to push
  async pushKey() {
    return { publicKey: getPublicKey() };
  },

  // Create/update this device: display name and push subscription
  async register(body) {
    const { id, device } = await authenticate(body, { create: true });
    const name = cleanName(body.name);
    if (name) device.name = name;
    if (body.subscription !== undefined) {
      const sub = body.subscription;
      device.subscription = sub && typeof sub.endpoint === 'string' && sub.keys ? sub : null;
    }
    await setJson(devKey(id), device);
    return { ok: true, name: device.name, hasPush: Boolean(device.subscription) };
  },

  // One-time code for adding a friend
  async pairCreate(body) {
    const { id } = await authenticate(body, { create: true });
    let code = '';
    for (let i = 0; i < 8; i++) code += PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)];
    await setJson(pairKey(code), { id, createdAt: Date.now() }, PAIR_TTL_SECONDS);
    return { code, ttl: PAIR_TTL_SECONDS };
  },

  // Friend enters the code: both sides are saved as contacts and the code is used up
  async pairRedeem(body) {
    const { id, device } = await authenticate(body, { create: true });
    const name = cleanName(body.name);
    if (name && name !== device.name) {
      device.name = name;
      await setJson(devKey(id), device);
    }

    const code = normalizePairCode(body.code);
    const pair = code.length === 8 ? await getJson(pairKey(code)) : null;
    if (!pair) throw new HttpError(404, 'invalid_code', 'This code is invalid or has expired. Ask for a new one.');
    if (pair.id === id) throw new HttpError(400, 'own_code', 'That is your own code. Share it with your friend.');

    await del(pairKey(code));
    await setAdd(friendsKey(id), pair.id);
    await setAdd(friendsKey(pair.id), id);

    const owner = await getJson(devKey(pair.id));
    await notify(pair.id, { type: 'friend-added', id, name: device.name }, { ttl: 3600 });
    return { friend: { id: pair.id, name: owner?.name || 'Friend' } };
  },

  async contacts(body) {
    const { id } = await authenticate(body);
    const ids = await setMembers(friendsKey(id));
    const contacts = [];
    for (const friendId of ids) {
      const friend = await getJson(devKey(friendId));
      if (friend) contacts.push({ id: friendId, name: friend.name, hasPush: Boolean(friend.subscription) });
    }
    contacts.sort((a, b) => a.name.localeCompare(b.name));
    return { contacts };
  },

  async removeContact(body) {
    const { id } = await authenticate(body);
    const friendId = String(body.friendId || '');
    await setRemove(friendsKey(id), friendId);
    await setRemove(friendsKey(friendId), id);
    return { ok: true };
  },

  // Ring a contact: push notification that wakes their phone
  async ring(body) {
    const { id, device } = await authenticate(body);
    await requireFriend(id, body.to);
    const callId = String(body.callId || '').slice(0, 40);
    const result = await notify(
      body.to,
      { type: 'call', callId, fromId: id, fromName: device.name, at: Date.now() },
      { ttl: 45, urgency: 'high' }
    );
    return { push: result };
  },

  // Caller gave up: replace the ringing notification with a missed-call one
  async cancel(body) {
    const { id, device } = await authenticate(body);
    await requireFriend(id, body.to);
    const callId = String(body.callId || '').slice(0, 40);
    await notify(body.to, { type: 'cancel', callId, fromId: id, fromName: device.name }, { ttl: 300 });
    return { ok: true };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const body = await readJson(req);
    const action = actions[body.action];
    if (!action) throw new HttpError(400, 'unknown_action', 'Unknown action.');
    return sendJson(res, 200, await action(body));
  } catch (err) {
    if (err instanceof HttpError) {
      return sendJson(res, err.status, { error: err.code, message: err.message });
    }
    console.error('[rpc] failed', err);
    return sendJson(res, 500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
}
