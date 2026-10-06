/**
 * installPrompt.js
 * "Install App" support. Chrome/Edge (Android & desktop) fire `beforeinstallprompt` once
 * when the PWA is installable, often before React renders, so it is captured here at
 * import time (imported from main.jsx) and replayed to subscribers.
 */

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own button instead of the mini-infobar
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function getInstallState() {
  return {
    installed: installed || isStandalone(),
    canPrompt: Boolean(deferredPrompt),
    ios: isIOS(),
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shows the browser's install dialog. Returns 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null; // a prompt event can only be used once
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}
