/**
 * ringtone.js
 * Incoming-call ring (classic double ring) plus vibration where supported.
 * Browsers may keep it silent until the user has tapped the page once; the push
 * notification provides the system ring when the app is in the background.
 */

let ctx = null;
let timer = null;

function ringOnce() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.5].forEach((offset) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.02);
    gain.gain.setValueAtTime(0.18, now + offset + 0.38);
    gain.gain.linearRampToValueAtTime(0, now + offset + 0.42);
    gain.connect(ctx.destination);
    [440, 480].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.45);
    });
  });
  if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
}

export function startRingtone() {
  stopRingtone();
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
  ringOnce();
  timer = setInterval(ringOnce, 3000);
}

export function stopRingtone() {
  clearInterval(timer);
  timer = null;
  if (navigator.vibrate) navigator.vibrate(0);
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
}
