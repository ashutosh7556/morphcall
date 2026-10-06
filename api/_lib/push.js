import webpush from 'web-push';
import { HttpError } from './http.js';

let configured = false;

function ensureConfigured() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    throw new HttpError(503, 'not_configured', 'Call notifications are not configured on the server (missing VAPID keys).');
  }
  if (!configured) {
    webpush.setVapidDetails((process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim(), publicKey, privateKey);
    configured = true;
  }
  return publicKey;
}

export function getPublicKey() {
  return ensureConfigured();
}

/**
 * Send a notification payload to one device. Returns 'sent', 'gone' (subscription
 * expired; caller should delete it) or 'failed'.
 */
export async function sendPush(subscription, payload, { ttl = 60, urgency = 'normal' } = {}) {
  ensureConfigured();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: ttl, urgency });
    return 'sent';
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone';
    console.warn('[push] send failed', err.statusCode, err.body || err.message);
    return 'failed';
  }
}
