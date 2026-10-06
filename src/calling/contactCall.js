/**
 * contactCall.js
 * Calls between saved contacts.
 *
 * Presence: while the app is open, each device stays registered on the free PeerJS broker
 * under a permanent ID derived from its device ID, so contacts can reach it directly.
 *
 * Call flow:
 *   Caller -> server push "ring" (wakes a closed app)  +  direct data connection (open app)
 *   Callee taps Accept -> sends { type: 'accept' } over a data connection
 *   Caller -> starts the WebRTC media call -> callee answers -> talking
 * A small message protocol on the data connection carries accept / decline / busy /
 * cancel / hangup / mute.
 */
import { Peer } from 'peerjs';
import { ICE_FAILED_MESSAGE, PEER_OPTIONS, isSignalingError, tuneOpus, watchConnection } from './rtc';

const USER_PREFIX = 'morphcall-u-';
const RING_TIMEOUT_MS = 45000;
const CONNECT_TIMEOUT_MS = 25000;

const peerIdFor = (deviceId) => USER_PREFIX + deviceId;

export function newCallId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

/**
 * Keeps this device reachable while the app is open.
 * handlers: onStatus('connecting' | 'online' | 'reconnecting' | 'duplicate'),
 *           onIncoming({ callId, fromId, fromName, conn })
 */
export class Presence {
  constructor(deviceId, handlers) {
    this.deviceId = deviceId;
    this.handlers = handlers;
    this.peer = null;
    this.active = null; // ContactCall in progress
    this.status = 'connecting';
    this.destroyed = false;
    this.retryDelay = 2000;
    this.retryTimer = null;
  }

  start() {
    if (this.peer || this.destroyed) return;
    this.setStatus(this.status === 'duplicate' ? 'duplicate' : 'connecting');
    const peer = new Peer(peerIdFor(this.deviceId), PEER_OPTIONS);
    this.peer = peer;

    peer.on('open', () => {
      this.retryDelay = 2000;
      this.setStatus('online');
    });
    peer.on('connection', (conn) => this.handleConnection(conn));
    peer.on('call', (call) => this.handleMediaCall(call));
    peer.on('disconnected', () => {
      if (peer.destroyed || this.destroyed) return;
      this.setStatus('reconnecting');
      setTimeout(() => {
        if (!peer.destroyed && peer.disconnected) {
          try {
            peer.reconnect();
          } catch {
            this.restartLater();
          }
        }
      }, 1500);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.active?.handlePeerUnavailable();
      } else if (err.type === 'unavailable-id') {
        // The app is open in another tab, which receives the calls
        this.setStatus('duplicate');
        this.restartLater(15000);
      } else if (isSignalingError(err)) {
        this.setStatus('reconnecting');
        this.restartLater();
      } else {
        console.warn('Presence error', err);
      }
    });
  }

  restartLater(delay = this.retryDelay) {
    if (this.destroyed) return;
    const old = this.peer;
    this.peer = null;
    try {
      old?.destroy();
    } catch {
      // ignore
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), delay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
  }

  setStatus(status) {
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  get isOnline() {
    return Boolean(this.peer && this.peer.open);
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.retryTimer);
    try {
      this.peer?.destroy();
    } catch {
      // ignore
    }
  }

  handleConnection(conn) {
    const meta = conn.metadata || {};
    if (this.active && meta.callId && meta.callId === this.active.callId) {
      this.active.attachConn(conn);
      return;
    }
    if (meta.kind === 'ring') {
      if (this.active) {
        sendAndClose(conn, { type: 'busy' });
        return;
      }
      this.handlers.onIncoming?.({
        callId: meta.callId,
        fromId: conn.peer.slice(USER_PREFIX.length),
        fromName: meta.name || 'Contact',
        conn,
      });
      return;
    }
    // An answer to a call that has already ended here
    sendAndClose(conn, { type: 'gone' });
  }

  handleMediaCall(call) {
    const meta = call.metadata || {};
    if (this.active && meta.callId === this.active.callId) this.active.attachIncomingMedia(call);
    else call.close();
  }

  connect(deviceId, metadata) {
    return this.peer.connect(peerIdFor(deviceId), { reliable: true, metadata });
  }

  call(deviceId, stream, metadata) {
    return this.peer.call(peerIdFor(deviceId), stream, { sdpTransform: tuneOpus, metadata });
  }
}

function sendAndClose(conn, msg) {
  conn.on('open', () => {
    try {
      conn.send(msg);
    } catch {
      // ignore
    }
    setTimeout(() => conn.close(), 400);
  });
}

/**
 * One call with a contact.
 * options: { role: 'caller' | 'callee', callId, peerId, peerName, myName, conn? }
 * handlers: onStatus('ringing' | 'incoming' | 'connecting' | 'connected'), onConnectionState,
 *           onRemoteStream, onMessage, onQuality, onCancelRing (caller gave up), onEnded(reason, info)
 *           where info = { missed: boolean }
 */
export class ContactCall {
  constructor(presence, options, handlers) {
    this.presence = presence;
    this.role = options.role;
    this.callId = options.callId;
    this.peerId = options.peerId;
    this.peerName = options.peerName || 'Contact';
    this.myName = options.myName || 'Friend';
    this.handlers = handlers;
    this.conn = null;
    this.media = null;
    this.localStream = null;
    this.queue = [];
    this.accepted = false;
    this.mediaConnected = false;
    this.ended = false;
    this.timer = null;
    this.stopWatching = null;

    presence.active = this;
    if (options.conn) this.attachConn(options.conn);
  }

  // Caller: ring the contact (push is sent by the app through the server)
  startOutgoing(localStream) {
    if (!this.presence.isOnline) {
      this.end('Not connected to the call service yet. Please try again in a moment.');
      return;
    }
    this.localStream = localStream;
    this.handlers.onStatus('ringing');
    this.attachConn(this.presence.connect(this.peerId, { kind: 'ring', callId: this.callId, name: this.myName }));
    this.setTimer(RING_TIMEOUT_MS, () => this.end('No answer.', { cancel: true }));
  }

  // Callee: show the incoming call screen
  showIncoming() {
    this.handlers.onStatus('incoming');
    this.setTimer(RING_TIMEOUT_MS, () => this.end(`Missed call from ${this.peerName}.`, { missed: true }));
  }

  accept(localStream) {
    if (this.ended || this.accepted) return;
    this.localStream = localStream;
    this.accepted = true;
    this.handlers.onStatus('connecting');
    if (!this.conn) this.attachConn(this.presence.connect(this.peerId, { kind: 'accept', callId: this.callId }));
    this.send({ type: 'accept', callId: this.callId });
    this.setTimer(CONNECT_TIMEOUT_MS, () => this.end('Could not connect the call. Please try again.'));
  }

  decline() {
    if (this.ended) return;
    if (!this.conn && this.presence.isOnline) {
      this.attachConn(this.presence.connect(this.peerId, { kind: 'decline', callId: this.callId }));
    }
    this.send({ type: 'decline' });
    this.end(null, { missed: true });
  }

  handlePeerUnavailable() {
    // Caller's direct ring could not reach an app that is closed: the push notification
    // still rings it, so keep waiting. A callee that cannot reach the caller has nobody to talk to.
    if (this.role === 'callee' && !this.mediaConnected) {
      this.end(`${this.peerName} is no longer calling.`, { missed: !this.accepted });
    }
  }

  attachConn(conn) {
    if (this.conn && this.conn !== conn) {
      const old = this.conn;
      setTimeout(() => old.close(), 1000);
    }
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      const pending = this.queue.splice(0);
      pending.forEach((msg) => conn.send(msg));
      this.handlers.onMessage?.({ type: 'channel-open' });
    });
    conn.on('data', (msg) => {
      if (msg && typeof msg === 'object') this.onData(msg);
    });
    conn.on('close', () => {
      if (this.conn === conn && this.mediaConnected) this.end(`${this.peerName} left the call.`);
    });
  }

  onData(msg) {
    switch (msg.type) {
      case 'accept':
        if (this.role === 'caller' && !this.accepted && !this.ended) {
          this.accepted = true;
          this.handlers.onStatus('connecting');
          this.setTimer(CONNECT_TIMEOUT_MS, () => this.end('Could not connect the call. Please try again.'));
          this.attachMedia(this.presence.call(this.peerId, this.localStream, { callId: this.callId }));
        }
        break;
      case 'decline':
        this.end(`${this.peerName} declined the call.`);
        break;
      case 'busy':
        this.end(`${this.peerName} is on another call.`);
        break;
      case 'cancel':
        this.end(this.role === 'callee' ? `Missed call from ${this.peerName}.` : null, { missed: true });
        break;
      case 'gone':
        this.end(`${this.peerName} is no longer calling.`, { missed: this.role === 'callee' && !this.accepted });
        break;
      case 'hangup':
        this.end(`${this.peerName} ended the call.`);
        break;
      default:
        this.handlers.onMessage?.(msg);
    }
  }

  attachIncomingMedia(call) {
    if (this.role !== 'callee' || !this.accepted || this.media) {
      call.close();
      return;
    }
    call.answer(this.localStream, { sdpTransform: tuneOpus });
    this.attachMedia(call);
  }

  attachMedia(call) {
    this.media = call;
    call.on('stream', (stream) => this.handlers.onRemoteStream(stream));
    call.on('close', () => this.end(`${this.peerName} left the call.`));
    call.on('error', (err) => this.end(err?.message || 'The call failed.'));
    if (call.peerConnection) {
      this.stopWatching = watchConnection(call.peerConnection, {
        onState: (state) => this.handlers.onConnectionState?.(state),
        onConnected: () => {
          this.mediaConnected = true;
          this.clearTimer();
          this.handlers.onStatus('connected');
        },
        onFailed: () => this.end(ICE_FAILED_MESSAGE),
        onQuality: (q) => this.handlers.onQuality?.(q),
      });
    }
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch {
        // ignore
      }
    } else {
      this.queue.push(msg);
    }
  }

  // Local user ends the call (or cancels while it is still ringing)
  hangup() {
    if (this.role === 'caller' && !this.accepted) {
      this.end(null, { cancel: true });
    } else if (this.role === 'callee' && !this.accepted) {
      this.decline();
    } else {
      this.send({ type: 'hangup' });
      this.end(null);
    }
  }

  setTimer(ms, fn) {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  end(reason, { cancel = false, missed = false } = {}) {
    if (this.ended) return;
    this.ended = true;
    this.clearTimer();
    if (this.stopWatching) this.stopWatching();
    if (cancel && this.role === 'caller' && !this.accepted) {
      this.send({ type: 'cancel' });
      this.handlers.onCancelRing?.();
    }
    const conn = this.conn;
    // Let the last message (hangup / cancel / decline) leave before closing; if the
    // connection is still opening, give it time to open and flush the queue first
    setTimeout(() => {
      try {
        conn?.close();
      } catch {
        // ignore
      }
    }, this.queue.length > 0 ? 4000 : 400);
    try {
      this.media?.close();
    } catch {
      // ignore
    }
    if (this.presence.active === this) this.presence.active = null;
    if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
    this.handlers.onEnded(reason, { missed });
  }
}
