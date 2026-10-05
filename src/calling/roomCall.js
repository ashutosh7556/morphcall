/**
 * roomCall.js
 * Free browser-to-browser voice calls over WebRTC.
 *
 * - Signaling: PeerJS public broker (free, no backend). It only exchanges connection
 *   details; the room code is the host's peer ID.
 * - Audio: sent directly between the two browsers (encrypted DTLS-SRTP). Each side sends
 *   the morphed VoiceEngine output, never the raw microphone.
 * - A small data channel carries hang-up, mute and voice-preset updates, because PeerJS
 *   does not reliably report the remote side closing a media call.
 */
import { Peer } from 'peerjs';

const ID_PREFIX = 'morphcall-v1-';
const CONNECT_TIMEOUT_MS = 25000;

// Public STUN servers let each browser discover its public address. Networks that block
// peer-to-peer traffic entirely would additionally need a TURN relay (not free).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function generateRoomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + n);
}

export function normalizeRoomCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

/**
 * One call session. Callbacks:
 * - onStatus(status): 'waiting' | 'connecting' | 'connected'
 * - onConnectionState(state): raw ICE state for display ('checking', 'connected', ...)
 * - onRemoteStream(stream): friend's audio
 * - onMessage(msg): { type: 'preset' | 'mute', ... } from the friend
 * - onEnded(reason | null): call is over (reason is shown to the user)
 */
export class RoomCall {
  constructor(handlers) {
    this.handlers = handlers;
    this.peer = null;
    this.call = null;
    this.conn = null;
    this.localStream = null;
    this.ended = false;
    this.connected = false;
    this.timeoutId = null;
  }

  // Create a room and wait for a friend to join it
  async host(roomCode, localStream) {
    this.localStream = localStream;
    this.peer = await this.openPeer(ID_PREFIX + roomCode);
    this.handlers.onStatus('waiting');

    this.peer.on('call', (call) => {
      if (this.call) {
        call.close(); // room is already in use by another friend
        return;
      }
      this.handlers.onStatus('connecting');
      this.startTimeout();
      call.answer(this.localStream);
      this.attachCall(call);
    });

    this.peer.on('connection', (conn) => {
      if (this.conn) {
        conn.close();
        return;
      }
      this.attachData(conn);
    });
  }

  // Join a friend's room
  async join(roomCode, localStream) {
    this.localStream = localStream;
    this.peer = await this.openPeer();
    this.handlers.onStatus('connecting');
    this.startTimeout();

    const target = ID_PREFIX + roomCode;
    this.attachData(this.peer.connect(target, { reliable: true }));
    this.attachCall(this.peer.call(target, this.localStream));
  }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id
        ? new Peer(id, { config: { iceServers: ICE_SERVERS } })
        : new Peer({ config: { iceServers: ICE_SERVERS } });
      let opened = false;

      peer.on('open', () => {
        opened = true;
        resolve(peer);
      });

      peer.on('error', (err) => {
        const message = describePeerError(err);
        if (!opened) {
          peer.destroy();
          reject(new Error(message));
        } else {
          this.end(message);
        }
      });

      // Lost the signaling server after connecting: an active call keeps working
      peer.on('disconnected', () => {
        if (!this.connected && !this.ended) this.end('Lost connection to the signaling server.');
      });
    });
  }

  attachCall(call) {
    this.call = call;

    call.on('stream', (remoteStream) => this.handlers.onRemoteStream(remoteStream));
    call.on('close', () => this.end('Your friend left the call.'));
    call.on('error', (err) => this.end(err?.message || 'The call failed.'));

    const pc = call.peerConnection;
    if (pc) {
      const update = () => {
        const state = pc.iceConnectionState;
        this.handlers.onConnectionState(state);
        if ((state === 'connected' || state === 'completed') && !this.connected) {
          this.connected = true;
          this.clearTimeout();
          this.handlers.onStatus('connected');
        } else if (state === 'failed') {
          this.end('Could not connect directly. One of your networks blocks peer-to-peer audio; try a different Wi-Fi or mobile data.');
        }
      };
      pc.addEventListener('iceconnectionstatechange', update);
      update();
    }
  }

  attachData(conn) {
    this.conn = conn;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hangup') {
        this.end('Your friend ended the call.');
      } else {
        this.handlers.onMessage(msg);
      }
    });
    conn.on('open', () => this.handlers.onMessage({ type: 'channel-open' }));
    conn.on('close', () => {
      if (this.connected) this.end('Your friend left the call.');
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch {
        // ignore
      }
    }
  }

  startTimeout() {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      if (!this.connected) this.end('Could not connect. Check the room code and that your friend is still in the room.');
    }, CONNECT_TIMEOUT_MS);
  }

  clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // Local user hangs up
  hangup() {
    this.send({ type: 'hangup' });
    // Give the hang-up message a moment to leave before tearing down
    setTimeout(() => this.end(null), 150);
  }

  end(reason) {
    if (this.ended) return;
    this.ended = true;
    this.clearTimeout();
    try {
      if (this.call) this.call.close();
      if (this.conn) this.conn.close();
      if (this.peer) this.peer.destroy();
    } catch {
      // ignore
    }
    if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
    this.handlers.onEnded(reason);
  }
}

function describePeerError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'Room not found. Check the code, or ask your friend to create the room again.';
    case 'unavailable-id':
      return 'That room code is already in use. Create a new room.';
    case 'browser-incompatible':
      return 'This browser does not support voice calls (WebRTC).';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the free signaling server. Check your internet connection and try again.';
    default:
      return err?.message || 'Connection error.';
  }
}
