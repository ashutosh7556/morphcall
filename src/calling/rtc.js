/**
 * rtc.js
 * WebRTC settings shared by room calls and contact calls.
 */

// Public STUN servers let each browser discover its public address. Networks that block
// peer-to-peer traffic entirely would additionally need a TURN relay (not free).
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export const PEER_OPTIONS = { config: { iceServers: ICE_SERVERS } };

// Opus tuned for unstable mobile networks: in-band FEC rebuilds lost packets, a moderate
// mono bitrate survives congestion, DTX off avoids clipped word starts.
export function tuneOpus(sdp) {
  const match = sdp.match(/a=rtpmap:(\d+) opus\/48000[^\r\n]*/i);
  if (!match) return sdp;
  const pt = match[1];
  const params = 'minptime=10;useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;maxaveragebitrate=40000';
  const fmtp = new RegExp(`a=fmtp:${pt} [^\\r\\n]*`);
  return fmtp.test(sdp)
    ? sdp.replace(fmtp, `a=fmtp:${pt} ${params}`)
    : sdp.replace(match[0], `${match[0]}\r\na=fmtp:${pt} ${params}`);
}

// Larger receive buffer smooths network jitter (fewer gaps) at the cost of ~100 ms delay
const JITTER_BUFFER_MS = 150;

export function tuneTransport(pc) {
  for (const receiver of pc.getReceivers()) {
    if (receiver.track?.kind === 'audio' && 'jitterBufferTarget' in receiver) {
      try {
        receiver.jitterBufferTarget = JITTER_BUFFER_MS;
      } catch {
        // not supported in this browser
      }
    }
  }
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'audio') continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      sender.setParameters(params).catch(() => {});
    } catch {
      // not supported in this browser
    }
  }
}

// Packet loss, jitter and round-trip time of the incoming audio, sampled every 2 s.
// Returns a function that stops sampling.
export function startStats(pc, onQuality) {
  let last = null;
  const id = setInterval(async () => {
    try {
      const report = await pc.getStats();
      let inbound = null;
      let rtt = null;
      report.forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') inbound = s;
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && s.currentRoundTripTime != null) {
          rtt = s.currentRoundTripTime * 1000;
        }
      });
      if (!inbound) return;

      const prev = last;
      last = { received: inbound.packetsReceived || 0, lost: inbound.packetsLost || 0 };
      if (!prev) return;

      const received = last.received - prev.received;
      const lost = Math.max(0, last.lost - prev.lost);
      const lossPct = received + lost > 0 ? (lost / (received + lost)) * 100 : 0;
      const jitterMs = (inbound.jitter || 0) * 1000;

      let level = 'good';
      if (lossPct > 8 || jitterMs > 60 || (rtt != null && rtt > 500)) level = 'poor';
      else if (lossPct > 2 || jitterMs > 30 || (rtt != null && rtt > 250)) level = 'fair';

      onQuality?.({ level, lossPct, jitterMs, rttMs: rtt });
    } catch {
      // stats unavailable
    }
  }, 2000);
  return () => clearInterval(id);
}

// Follows the ICE state of a media call: reports it, tunes the transport once connected
// and starts quality sampling. Returns a cleanup function.
export function watchConnection(pc, { onState, onConnected, onFailed, onQuality }) {
  let connected = false;
  let stopStats = null;
  const update = () => {
    const state = pc.iceConnectionState;
    onState?.(state);
    if ((state === 'connected' || state === 'completed') && !connected) {
      connected = true;
      tuneTransport(pc);
      stopStats = startStats(pc, onQuality);
      onConnected?.();
    } else if (state === 'failed') {
      onFailed?.();
    }
  };
  pc.addEventListener('iceconnectionstatechange', update);
  update();
  return () => {
    pc.removeEventListener('iceconnectionstatechange', update);
    if (stopStats) stopStats();
  };
}

export const ICE_FAILED_MESSAGE =
  'Could not connect directly. One of your networks blocks peer-to-peer audio; try a different Wi-Fi or mobile data.';

export const SIGNALING_ERROR_MESSAGE =
  'Could not reach the free signaling server. Check your internet connection and try again.';

export function isSignalingError(err) {
  return ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err?.type);
}
