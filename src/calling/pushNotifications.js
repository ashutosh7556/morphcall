/**
 * pushNotifications.js
 * Service worker + Web Push subscription so contacts can ring this device even when
 * the app is closed.
 */
import { getIdentity, rpc } from './identity';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function pushSupport() {
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'This browser does not support notifications.' };
  if (!('PushManager' in window) || !('Notification' in window)) {
    if (isIOS() && !isStandalone()) {
      return {
        supported: false,
        reason: 'On iPhone, tap Share → Add to Home Screen, then open the app from your home screen to get call notifications.',
      };
    }
    return { supported: false, reason: 'This browser does not support push notifications.' };
  }
  return { supported: true };
}

// True when this browser holds a push subscription (what actually lets contacts ring it)
export async function hasPushSubscription() {
  if (!pushSupport().supported) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}

export function notificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

let registrationPromise = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  registrationPromise ??= navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('Service worker registration failed', err);
    return null;
  });
  return registrationPromise;
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Ask for notification permission (must run from a tap) and register this device's push
 * subscription with the server. Throws with a readable message on failure.
 */
export async function enablePushNotifications() {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them in your browser settings to receive calls.');
  }

  const registration = await registerServiceWorker();
  if (!registration) throw new Error('Could not start the notification service.');
  await navigator.serviceWorker.ready;

  const { publicKey } = await rpc('pushKey');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await rpc('register', { name: getIdentity().name, subscription: subscription.toJSON() });
  return true;
}

// Keep the server's copy of the subscription fresh (it can rotate) when permission exists
export async function refreshPushSubscription() {
  if (pushSupport().supported && notificationPermission() === 'granted') {
    try {
      await enablePushNotifications();
    } catch {
      // ignore; the user can re-enable from the contacts panel
    }
  }
}
