/**
 * audioOutput.js
 * Speaker / earpiece switching for the friend's audio, as far as the browser allows.
 *
 * - Where setSinkId() is available (Chrome desktop & Android) and the device list exposes
 *   a speaker or earpiece output, audio is routed to that device.
 * - Otherwise (e.g. iOS Safari) the page cannot pick the output, so Speaker OFF plays at
 *   handset level and Speaker ON at full volume.
 */

const SPEAKER_RE = /speaker/i;
const EARPIECE_RE = /earpiece|handset|receiver/i;
const HANDSET_VOLUME = 0.45;

const canSelectOutput =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

// Phones start in earpiece mode like a normal call; desktops have no earpiece
export const defaultSpeakerOn = () =>
  !(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);

/** Returns 'device' when a real output switch happened, 'volume' when emulated. */
export async function routeCallAudio(el, speakerOn) {
  if (!el) return 'volume';
  let routed = false;

  if (canSelectOutput && navigator.mediaDevices?.enumerateDevices) {
    try {
      const outputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
      const speaker = outputs.find((d) => SPEAKER_RE.test(d.label));
      const earpiece = outputs.find((d) => EARPIECE_RE.test(d.label) && !SPEAKER_RE.test(d.label));
      const target = speakerOn ? speaker : earpiece;

      if (target) {
        await el.setSinkId(target.deviceId);
        routed = true;
      } else if (el.sinkId) {
        await el.setSinkId(''); // back to the system default output
      }
    } catch {
      // output selection blocked or unsupported: fall back to volume
    }
  }

  el.volume = speakerOn || routed ? 1 : HANDSET_VOLUME;
  return routed ? 'device' : 'volume';
}
