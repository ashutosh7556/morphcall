/**
 * roomCall.js
 * Quick browser-to-browser voice calls with a one-off room code.
 *
 * - Signaling: PeerJS public broker (free, no backend). It only exchanges connection
 *   details; the room code is the host's peer ID.
 * - Audio: sent directly between the two browsers (encrypted DTLS-SRTP). Each side sends
 *   the VoiceEngine output, never the raw microphone.
 * - A small data channel carries hang-up and mute updates, because PeerJS does not
 *   reliably report the remote side closing a media call.
 */
import { Peer } from 'peerjs';
import {
  ICE_FAILED_MESSAGE,
  PEER_OPTIONS,
  SIGNALING_ERROR_MESSAGE,
  isSignalingError,
  tuneOpus,
  watchConnection,
} from './rtc';

const ID_PREFIX = 'morphcall-v1-';
const CONNECT_TIMEOUT_MS = 25000;

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
 * - onMessage(msg): { type: 'mute', ... } from the friend
 * - onQuality({ level, lossPct, jitterMs, rttMs }): network quality every 2 s
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
    this.stopWatching = null;
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
      call.answer(this.localStream, { sdpTransform: tuneOpus });
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
    this.attachCall(this.peer.call(target, this.localStream, { sdpTransform: tuneOpus }));
  }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
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

    if (call.peerConnection) {
      this.stopWatching = watchConnection(call.peerConnection, {
        onState: (state) => this.handlers.onConnectionState(state),
        onConnected: () => {
          this.connected = true;
          this.clearTimeout();
          this.handlers.onStatus('connected');
        },
        onFailed: () => this.end(ICE_FAILED_MESSAGE),
        onQuality: (q) => this.handlers.onQuality?.(q),
      });
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
    if (this.stopWatching) this.stopWatching();
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
  if (isSignalingError(err)) return SIGNALING_ERROR_MESSAGE;
  switch (err?.type) {
    case 'peer-unavailable':
      return 'Room not found. Check the code, or ask your friend to create the room again.';
    case 'unavailable-id':
      return 'That room code is already in use. Create a new room.';
    case 'browser-incompatible':
      return 'This browser does not support voice calls (WebRTC).';
    default:
      return err?.message || 'Connection error.';
  }
}
