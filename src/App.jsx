import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Sparkles,
  Info,
  History,
  Sliders,
  AlertCircle,
  X
} from 'lucide-react';
import { voiceEngine } from './audio/VoiceEngine';
import DialerPad from './components/DialerPad';
import VoiceSelector from './components/VoiceSelector';
import ActiveCallScreen from './components/ActiveCallScreen';
import AudioVisualizer from './components/AudioVisualizer';
import CellularInfoModal from './components/CellularInfoModal';
import CallHistory from './components/CallHistory';
import GuestJoin from './components/GuestJoin';
import ContactsPanel from './components/ContactsPanel';
import AddFriendModal from './components/AddFriendModal';
import PlainHome from './components/PlainHome';
import { PRESETS } from './constants/presets';
import { RoomCall, generateRoomCode, normalizeRoomCode } from './calling/roomCall';
import { defaultSpeakerOn, routeCallAudio } from './calling/audioOutput';
import { ContactCall, Presence, newCallId } from './calling/contactCall';
import { cacheContacts, getCachedContacts, getIdentity, getMode, rpc, saveName, setMode } from './calling/identity';
import {
  enablePushNotifications,
  hasPushSubscription,
  notificationPermission,
  pushSupport,
  refreshPushSubscription,
  registerServiceWorker,
} from './calling/pushNotifications';
import { startRingtone, stopRingtone } from './calling/ringtone';
import './App.css';

const urlParams = new URLSearchParams(window.location.search);
// Room invite links look like https://site/?room=123456
const invitedRoomCode = normalizeRoomCode(urlParams.get('room'));
// Add-friend links look like https://site/?add=ABCD2345
const addFriendCode = (urlParams.get('add') || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
// Opened from an incoming-call notification: ?incoming=<callId>&from=<deviceId>&name=<name>
const pushedCall = urlParams.get('incoming') && urlParams.get('from')
  ? { callId: urlParams.get('incoming'), fromId: urlParams.get('from'), fromName: urlParams.get('name') || 'Contact' }
  : null;
if (addFriendCode || pushedCall) window.history.replaceState(null, '', window.location.pathname);

// 'guest' : opened a room invite link -> plain join screen
// 'plain' : friend's plain call app (added via an add-friend link) -> no voice effects anywhere
// 'full'  : owner app with voice effects
const appMode = invitedRoomCode ? 'guest' : getMode() === 'plain' || (addFriendCode && !getMode()) ? 'plain' : 'full';
const isGuestLink = appMode === 'guest';

const readPushState = (subscribed = false) => ({ ...pushSupport(), permission: notificationPermission(), subscribed });

export default function App() {
  const [roomCode, setRoomCode] = useState(invitedRoomCode || '');
  const [activePreset, setActivePreset] = useState('normal');
  const [pitchOffset, setPitchOffset] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Call status
  const [callState, setCallState] = useState('idle'); // 'idle' | 'waiting' | 'connecting' | 'connected'
  const [callRole, setCallRole] = useState(null); // 'host' | 'guest'
  const [connectionState, setConnectionState] = useState(null); // WebRTC ICE state
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [networkQuality, setNetworkQuality] = useState(null); // { level, lossPct, jitterMs, rttMs }
  const [speakerOn, setSpeakerOn] = useState(defaultSpeakerOn);
  const [outputMode, setOutputMode] = useState(null); // 'device' | 'volume'
  const [callDuration, setCallDuration] = useState(0);
  const [activeTab, setActiveTab] = useState(invitedRoomCode ? 'dialer' : 'effects'); // 'dialer' | 'effects' | 'history'
  const [callNotice, setCallNotice] = useState(null); // { type: 'error' | 'info', text }
  const [callTitle, setCallTitle] = useState(null); // contact name during contact calls

  // Contacts & presence
  const [myName, setMyName] = useState(() => getIdentity().name);
  const [contacts, setContacts] = useState(getCachedContacts);
  const [presenceStatus, setPresenceStatus] = useState('connecting');
  const [pushState, setPushState] = useState(readPushState);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [addFriendModal, setAddFriendModal] = useState(null); // null | 'share' | 'enter'
  const [pendingAddCode, setPendingAddCode] = useState(addFriendCode);

  // Modals & History
  const [isCellularModalOpen, setIsCellularModalOpen] = useState(false);
  const [callHistory, setCallHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('morphcall_room_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read history from localStorage', e);
    }
    return [];
  });

  const timerRef = useRef(null);
  const sessionRef = useRef(null); // active RoomCall or ContactCall
  const presenceRef = useRef(null);
  const incomingHandlerRef = useRef(null);
  const callInfoRef = useRef(null); // { kind: 'room', code, preset } | { kind: 'contact', peerId, name, direction, preset }
  const connectedAtRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isTestingMicRef = useRef(isTestingMic);
  const activePresetRef = useRef(activePreset);
  const pitchOffsetRef = useRef(pitchOffset);
  const isMutedRef = useRef(isMuted);
  const speakerOnRef = useRef(speakerOn);
  const callRoleRef = useRef(null);

  useEffect(() => {
    isTestingMicRef.current = isTestingMic;
    activePresetRef.current = activePreset;
    pitchOffsetRef.current = pitchOffset;
    isMutedRef.current = isMuted;
    speakerOnRef.current = speakerOn;
  }, [isTestingMic, activePreset, pitchOffset, isMuted, speakerOn]);

  // Neutral tab title for invited guests and the friend's plain app
  useEffect(() => {
    document.title = appMode === 'full' ? 'MorphCall - Real-time Voice Changer' : 'Voice Call';
  }, []);

  const refreshContacts = async () => {
    try {
      const { contacts: list } = await rpc('contacts');
      setContacts(list);
      cacheContacts(list);
    } catch (err) {
      if (err.code === 'unknown_device') {
        setContacts([]);
        cacheContacts([]);
      }
    }
  };

  // Stay reachable for contact calls while the app is open; handle notification taps
  useEffect(() => {
    if (appMode === 'guest') return undefined;

    const presence = new Presence(getIdentity().id, {
      onStatus: setPresenceStatus,
      onIncoming: (call) => incomingHandlerRef.current?.(call),
    });
    presenceRef.current = presence;
    presence.start();

    const syncPushState = async () => setPushState(readPushState(await hasPushSubscription().catch(() => false)));
    registerServiceWorker().then(() => refreshPushSubscription()).then(syncPushState);
    refreshContacts();
    // Opened by tapping an incoming-call notification: show the call after this render
    if (pushedCall) setTimeout(() => incomingHandlerRef.current?.(pushedCall), 0);

    const handleSwMessage = (event) => {
      const data = event.data || {};
      if (data.source !== 'morphcall-sw') return;
      if (data.type === 'call') {
        incomingHandlerRef.current?.(data);
      } else if (data.type === 'cancel') {
        const session = sessionRef.current;
        if (session instanceof ContactCall && session.callId === data.callId && !session.accepted) {
          session.end(`Missed call from ${session.peerName}.`, { missed: true });
        }
      } else if (data.type === 'friend-added') {
        refreshContacts();
        setCallNotice({ type: 'info', text: `${data.name || 'Your friend'} added you as a contact.` });
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    const handleFocus = () => {
      refreshContacts();
      syncPushState();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      window.removeEventListener('focus', handleFocus);
      presence.destroy();
    };
  }, []);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('morphcall_room_history', JSON.stringify(callHistory));
    } catch (e) {
      console.warn('Could not save history to localStorage', e);
    }
  }, [callHistory]);

  // Tell the friend we left if the tab is closed mid-call
  useEffect(() => {
    const handlePageHide = () => {
      if (sessionRef.current) sessionRef.current.send({ type: 'hangup' });
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (sessionRef.current) sessionRef.current.end(null);
    };
  }, []);

  // A guest in a call always sends their natural voice
  const isGuestInCall = () => Boolean(sessionRef.current) && callRoleRef.current === 'guest';

  // Handle Preset Selection
  const handleSelectPreset = (presetId) => {
    setActivePreset(presetId);
    if (!isGuestInCall()) voiceEngine.applyPreset(presetId, pitchOffset);
  };

  // Handle Pitch Offset Change
  const handleChangePitchOffset = (newOffset) => {
    setPitchOffset(newOffset);
    if (!isGuestInCall()) voiceEngine.applyPreset(activePreset, newOffset);
  };

  // Speaker ON/OFF like a phone call
  const handleToggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    routeCallAudio(remoteAudioRef.current, next).then(setOutputMode);
  };

  // Handle Monitoring (Hear Myself)
  const handleToggleMonitoring = async () => {
    const nextState = !isMonitoring;
    setIsMonitoring(nextState);

    // If mic not active, activate it so loopback works immediately
    if (nextState && !voiceEngine.isMicActive) {
      try {
        await voiceEngine.startMicrophone();
        setIsTestingMic(true);
      } catch (err) {
        alert('Please allow microphone access to preview your voice: ' + err.message);
        setIsMonitoring(false);
        return;
      }
    }

    voiceEngine.setMonitoring(nextState);
  };

  // Handle Mic Preview Testing
  const handleToggleTestMic = async () => {
    if (isTestingMic) {
      // During a call the mic keeps feeding the call; only the preview stops
      if (!sessionRef.current) voiceEngine.stopMicrophone();
      setIsTestingMic(false);
      setIsMonitoring(false);
      voiceEngine.setMonitoring(false);
    } else {
      try {
        await voiceEngine.startMicrophone();
        setIsTestingMic(true);
        // Automatically turn on monitor so user can hear the preview
        setIsMonitoring(true);
        voiceEngine.setMonitoring(true);
      } catch (err) {
        alert('Could not access microphone: ' + err.message);
      }
    }
  };

  // Handle Mute Toggle
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    voiceEngine.setMute(nextMute);
    if (sessionRef.current) sessionRef.current.send({ type: 'mute', muted: nextMute });
  };

  const markConnected = () => {
    stopRingtone();
    connectedAtRef.current = Date.now();
    voiceEngine.playCallChime('connect');
    setCallState('connected');
    timerRef.current = setInterval(() => {
      setCallDuration(Math.round((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
  };

  // Cleanup when a call ends (either side, or on error). Runs once per session and
  // only reads refs, because it is also called from WebRTC event handlers.
  const finishCall = (session, reason, { missed = false } = {}) => {
    if (sessionRef.current !== session) return;
    sessionRef.current = null;
    stopRingtone();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    callRoleRef.current = null;
    // Restore the creator's chosen effect (a guest call forced Normal)
    voiceEngine.applyPreset(activePresetRef.current, pitchOffsetRef.current);

    const info = callInfoRef.current;
    callInfoRef.current = null;
    const totalSecs = connectedAtRef.current
      ? Math.round((Date.now() - connectedAtRef.current) / 1000)
      : 0;
    const wasConnected = Boolean(connectedAtRef.current);
    connectedAtRef.current = null;

    if (info) {
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const duration = wasConnected
        ? `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : info.kind === 'contact'
          ? missed && info.direction === 'incoming' ? 'Missed' : 'No answer'
          : 'Not connected';
      const entry = {
        id: Date.now().toString(),
        number: info.kind === 'contact' ? info.name : `Room ${info.code}`,
        preset: info.preset,
        duration,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      if (info.kind === 'contact') {
        entry.contactId = info.peerId;
        entry.direction = missed && info.direction === 'incoming' && !wasConnected ? 'missed' : info.direction;
      }
      setCallHistory((prev) => [entry, ...prev]);
    }

    voiceEngine.playCallChime('hangup');
    setCallState('idle');
    setCallTitle(null);
    setCallRole(null);
    setConnectionState(null);
    setIsRemoteMuted(false);
    setNetworkQuality(null);
    setOutputMode(null);
    setCallDuration(0);
    setCallNotice(reason ? { type: 'error', text: reason } : null);

    // Stop mic unless user was already in mic test mode
    if (!isTestingMicRef.current) {
      voiceEngine.stopMicrophone();
    }
  };

  // Microphone -> VoiceEngine -> a copy of its output for the call.
  // withEffects: the selected effect (room creator / caller); otherwise the natural voice.
  const prepareOutboundStream = async (withEffects) => {
    await voiceEngine.startMicrophone();
    if (withEffects) voiceEngine.applyPreset(activePresetRef.current, pitchOffsetRef.current);
    else voiceEngine.applyPreset('normal', 0);
    voiceEngine.setMute(false);
    setIsMuted(false);
    const outbound = voiceEngine.getOutboundStream();
    if (!outbound) throw new Error('Voice engine is not ready. Please try again.');
    // The call gets its own copy so ending it never stops the engine's stream
    return outbound.clone();
  };

  // Callbacks shared by room calls and contact calls
  const sessionHandlers = (getSession) => ({
    onStatus: (status) => {
      if (sessionRef.current !== getSession()) return;
      if (status === 'connected') markConnected();
      else setCallState(status);
    },
    onConnectionState: (state) => {
      if (sessionRef.current === getSession()) setConnectionState(state);
    },
    onRemoteStream: (remoteStream) => {
      const el = remoteAudioRef.current;
      if (!el || sessionRef.current !== getSession()) return;
      el.srcObject = remoteStream;
      routeCallAudio(el, speakerOnRef.current).then(setOutputMode);
      el.play().catch(() => {
        setCallNotice({ type: 'info', text: 'Tap anywhere on the page if you cannot hear your friend.' });
      });
    },
    onMessage: (msg) => {
      const session = getSession();
      if (sessionRef.current !== session) return;
      if (msg.type === 'channel-open') {
        session.send({ type: 'mute', muted: isMutedRef.current });
      } else if (msg.type === 'mute') {
        setIsRemoteMuted(Boolean(msg.muted));
      }
    },
    onQuality: (quality) => {
      if (sessionRef.current === getSession()) setNetworkQuality(quality);
    },
    onEnded: (reason, info) => finishCall(getSession(), reason, info),
  });

  const resetCallUi = (role) => {
    callRoleRef.current = role;
    setCallRole(role);
    setConnectionState(null);
    setIsRemoteMuted(false);
    setNetworkQuality(null);
    setCallNotice(null);
    setCallDuration(0);
  };

  // ----- Contact calls -----

  const startContactCall = async (contact) => {
    if (sessionRef.current) return;
    const presence = presenceRef.current;
    if (!presence?.isOnline) {
      setCallNotice({ type: 'error', text: 'Still connecting to the call service. Try again in a moment.' });
      return;
    }

    // Caller-only effects: the owner app sends the selected effect; the plain app never does
    const withEffects = appMode === 'full';
    let localStream;
    try {
      localStream = await prepareOutboundStream(withEffects);
    } catch (err) {
      setCallNotice({ type: 'error', text: `Microphone permission is required: ${err.message}` });
      return;
    }

    const callId = newCallId();
    let session = null;
    session = new ContactCall(
      presence,
      { role: 'caller', callId, peerId: contact.id, peerName: contact.name, myName: getIdentity().name || 'Friend' },
      {
        ...sessionHandlers(() => session),
        onCancelRing: () => rpc('cancel', { to: contact.id, callId }).catch(() => {}),
      }
    );
    sessionRef.current = session;
    callInfoRef.current = {
      kind: 'contact',
      peerId: contact.id,
      name: contact.name,
      direction: 'outgoing',
      preset: withEffects ? activePresetRef.current : null,
    };
    resetCallUi(withEffects ? 'host' : 'guest');
    setCallTitle(contact.name);
    setCallState('ringing');

    // Push notification rings the contact's phone even when their app is closed
    rpc('ring', { to: contact.id, callId }).catch(() => {});
    session.startOutgoing(localStream);
  };

  // Incoming ring: direct (app open) or from a notification tap
  const handleIncomingCall = ({ callId, fromId, fromName, conn }) => {
    const current = sessionRef.current;
    if (current) {
      if (current instanceof ContactCall && current.callId === callId) return; // same call, already showing
      if (conn) {
        conn.on('open', () => {
          conn.send({ type: 'busy' });
          setTimeout(() => conn.close(), 400);
        });
      }
      return;
    }

    const saved = contacts.find((c) => c.id === fromId);
    const peerName = saved?.name || fromName || 'Contact';
    let session = null;
    session = new ContactCall(
      presenceRef.current,
      { role: 'callee', callId, peerId: fromId, peerName, myName: getIdentity().name || 'Friend', conn },
      sessionHandlers(() => session)
    );
    sessionRef.current = session;
    // The person receiving the call always sends their natural voice
    callInfoRef.current = { kind: 'contact', peerId: fromId, name: peerName, direction: 'incoming', preset: null };
    resetCallUi('guest');
    setCallTitle(peerName);
    session.showIncoming();
    startRingtone();
  };

  // Presence and service-worker callbacks always reach the latest handler
  useEffect(() => {
    incomingHandlerRef.current = handleIncomingCall;
  });

  const waitForPresence = async (timeoutMs = 10000) => {
    const end = Date.now() + timeoutMs;
    while (!presenceRef.current?.isOnline && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return Boolean(presenceRef.current?.isOnline);
  };

  const handleAcceptIncoming = async () => {
    const session = sessionRef.current;
    if (!(session instanceof ContactCall)) return;
    stopRingtone();
    let localStream;
    try {
      localStream = await prepareOutboundStream(false);
    } catch (err) {
      session.decline();
      setCallNotice({ type: 'error', text: `Microphone permission is required: ${err.message}` });
      return;
    }
    if (!(await waitForPresence())) {
      localStream.getTracks().forEach((t) => t.stop());
      session.end('Could not reach the call service. Check your internet connection.');
      return;
    }
    session.accept(localStream);
  };

  const handleDeclineIncoming = () => {
    stopRingtone();
    if (sessionRef.current instanceof ContactCall) sessionRef.current.decline();
  };

  const handleRemoveContact = async (contact) => {
    if (!window.confirm(`Remove ${contact.name} from your contacts?`)) return;
    try {
      await rpc('removeContact', { friendId: contact.id });
    } catch (err) {
      setCallNotice({ type: 'error', text: err.message });
    }
    refreshContacts();
  };

  const handleEnablePush = async () => {
    setIsEnablingPush(true);
    try {
      await enablePushNotifications();
      setCallNotice({ type: 'info', text: 'Call notifications are on. Your contacts can ring you even when the app is closed.' });
    } catch (err) {
      setCallNotice({ type: 'error', text: err.message });
    } finally {
      setIsEnablingPush(false);
      setPushState(readPushState(await hasPushSubscription().catch(() => false)));
    }
  };

  const rememberName = async (name) => {
    const identity = saveName(name);
    setMyName(identity.name);
    await rpc('register', { name: identity.name });
  };

  const handleCreatePairCode = async (name) => {
    await rememberName(name);
    return rpc('pairCreate');
  };

  const handleRedeemPairCode = async (code, name) => {
    await rememberName(name);
    const { friend } = await rpc('pairRedeem', { code, name });
    await refreshContacts();
    return friend;
  };

  // Friend opened an add-friend link: save the contact and become a plain call app
  const handleRedeemPending = async (name) => {
    const friend = await handleRedeemPairCode(pendingAddCode, name);
    if (!getMode()) setMode('plain');
    setPendingAddCode(null);
    setCallNotice({
      type: 'info',
      text: `${friend.name} is now in your contacts. Turn on notifications below so you can receive calls.`,
    });
  };

  // ----- Room calls -----

  // Start a browser-to-browser call: 'host' creates the room, 'guest' joins it
  const startSession = async (role, code) => {
    if (sessionRef.current) return;

    // Only the room creator sends the selected effect; guests send their natural voice
    let localStream;
    try {
      localStream = await prepareOutboundStream(role === 'host');
    } catch (err) {
      setCallNotice({ type: 'error', text: `Microphone permission is required: ${err.message}` });
      return;
    }

    let session = null;
    session = new RoomCall(sessionHandlers(() => session));

    sessionRef.current = session;
    callInfoRef.current = { kind: 'room', code, preset: role === 'host' ? activePreset : 'normal' };
    resetCallUi(role);
    setRoomCode(code);
    setCallState(role === 'host' ? 'waiting' : 'connecting');

    try {
      if (role === 'host') await session.host(code, localStream);
      else await session.join(code, localStream);
    } catch (err) {
      localStream.getTracks().forEach((t) => t.stop());
      finishCall(session, err.message || 'Could not start the call.');
    }
  };

  const handleCreateRoom = () => startSession('host', generateRoomCode());

  const handleJoinRoom = () => {
    const code = normalizeRoomCode(roomCode);
    if (!code) {
      setCallNotice({ type: 'error', text: 'Enter the 6-digit room code your friend shared.' });
      return;
    }
    startSession('guest', code);
  };

  // End Call Sequence (user pressed hang up)
  const handleEndCall = () => {
    const session = sessionRef.current;
    if (!session) return;
    finishCall(session, null);
    session.hangup();
  };

  // Call back a contact, or rejoin a room, from history
  const handleRedial = (item) => {
    if (item.contactId) {
      startContactCall(contacts.find((c) => c.id === item.contactId) || { id: item.contactId, name: item.number });
      return;
    }
    const code = normalizeRoomCode(item.number);
    if (code) setRoomCode(code);
    if (item.preset) {
      handleSelectPreset(item.preset);
    }
    setActiveTab('dialer');
  };

  const handleDeleteHistoryEntry = (id) => {
    setCallHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all call logs?')) {
      setCallHistory([]);
    }
  };

  const currentPresetObj = PRESETS.find((p) => p.id === activePreset) || PRESETS[0];

  return (
    <div className="app-container">
      {/* Decorative ambient background glows */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />

      {/* Friend's audio (WebRTC remote stream) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {isGuestLink ? (
        <GuestJoin
          roomCode={roomCode}
          notice={callNotice}
          onDismissNotice={() => setCallNotice(null)}
          onJoin={handleJoinRoom}
          isCallInProgress={callState !== 'idle'}
        />
      ) : appMode === 'plain' ? (
        <PlainHome
          myName={myName}
          pendingAddCode={pendingAddCode}
          onRedeemPending={handleRedeemPending}
          notice={callNotice}
          onDismissNotice={() => setCallNotice(null)}
          history={callHistory}
          onRedial={handleRedial}
          onDeleteEntry={handleDeleteHistoryEntry}
          onClearHistory={handleClearHistory}
          contacts={contacts}
          presenceStatus={presenceStatus}
          pushState={pushState}
          onEnablePush={handleEnablePush}
          isEnablingPush={isEnablingPush}
          onCall={startContactCall}
          onRemove={handleRemoveContact}
          isCallInProgress={callState !== 'idle'}
          onEnterCode={() => setAddFriendModal('enter')}
        />
      ) : (
      <>
      {/* Header Bar */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo-icon">
            <Sparkles size={22} className="logo-sparkle" />
          </div>
          <div className="brand-text">
            <h1 className="brand-name">MorphCall</h1>
            <span className="brand-tagline">Free Voice-Changing Calls</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="cellular-info-btn"
            onClick={() => setIsCellularModalOpen(true)}
            title="How MorphCall works"
          >
            <Info size={16} />
            <span className="info-btn-text">How It Works</span>
          </button>
        </div>
      </header>

      {/* Notice Banner */}
      <div className="limitation-banner" onClick={() => setIsCellularModalOpen(true)}>
        <AlertCircle size={16} className="banner-icon" />
        <p className="banner-text">
          <strong>Free browser-to-browser calls:</strong> add a friend once with a one-time code, then call them anytime
          with your morphed voice. No phone numbers, no accounts, no cost.
        </p>
        <span className="banner-link">Learn more &rarr;</span>
      </div>

      {/* Main Workspace Layout */}
      <main className="main-layout">
        {/* Mobile Navigation Tabs */}
        <nav className="tab-navigation">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'dialer' ? 'active' : ''}`}
            onClick={() => setActiveTab('dialer')}
          >
            <Phone size={18} />
            <span>Call</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <Sliders size={18} />
            <span>Voice Effects</span>
            <span className="tab-preset-pill" style={{ background: currentPresetObj.color }}>
              {currentPresetObj.name.split(' ')[0]}
            </span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={18} />
            <span>Recents</span>
            {callHistory.length > 0 && (
              <span className="count-badge">{callHistory.length}</span>
            )}
          </button>
        </nav>

        {/* Dual Panel (Desktop side-by-side, mobile tabbed) */}
        <div className="content-grid">
          {/* Column 1: Voice Changer Selection */}
          <div className={`panel-column voice-column ${activeTab === 'effects' ? 'tab-visible' : 'tab-hidden-mobile'}`}>
            <div className="glass-panel">
              <VoiceSelector
                activePreset={activePreset}
                onSelectPreset={handleSelectPreset}
                pitchOffset={pitchOffset}
                onChangePitchOffset={handleChangePitchOffset}
                isMonitoring={isMonitoring}
                onToggleMonitoring={handleToggleMonitoring}
                isTestingMic={isTestingMic}
                onToggleTestMic={handleToggleTestMic}
              />

              {/* Real-Time Microphone Preview Visualizer */}
              <div className="preview-visualizer-box">
                <div className="box-header">
                  <div className="status-indicator">
                    <span className={`dot ${isTestingMic || callState !== 'idle' ? 'live' : ''}`} />
                    <span>{isTestingMic ? 'Live Mic Morphing' : 'Microphone Standby'}</span>
                  </div>
                  <span className="active-badge" style={{ color: currentPresetObj.color }}>
                    {currentPresetObj.name}
                  </span>
                </div>
                <AudioVisualizer
                  isActive={isTestingMic || callState === 'connected'}
                  preset={activePreset}
                  isMuted={isMuted}
                  height={75}
                />
              </div>
            </div>
          </div>

          {/* Column 2: Contacts + Room Call Pad */}
          <div className={`panel-column dialer-column ${activeTab === 'dialer' ? 'tab-visible' : 'tab-hidden-mobile'}`}>
            <div className="glass-panel contacts-card">
              <ContactsPanel
                contacts={contacts}
                presenceStatus={presenceStatus}
                pushState={pushState}
                onEnablePush={handleEnablePush}
                isEnablingPush={isEnablingPush}
                onCall={startContactCall}
                onRemove={handleRemoveContact}
                isCallInProgress={callState !== 'idle'}
                onAddFriend={() => setAddFriendModal('share')}
                onEnterCode={() => setAddFriendModal('enter')}
              />
            </div>

            <div className="glass-panel dialer-card">
              <h3 className="quick-room-title">Quick room (no contact needed)</h3>
              <div className="dialer-status-bar">
                <div className="carrier-badge">
                  <span className="signal-bars">
                    <span /><span /><span /><span />
                  </span>
                  <span>Free P2P Call</span>
                </div>
                <div className="active-effect-pill" style={{ borderColor: currentPresetObj.color }}>
                  <span className="effect-dot" style={{ background: currentPresetObj.color }} />
                  <span>Voice: <strong>{currentPresetObj.name}</strong></span>
                </div>
              </div>

              {callNotice && (
                <div className={`call-notice ${callNotice.type}`} role="status">
                  <AlertCircle size={15} className="call-notice-icon" />
                  <span>{callNotice.text}</span>
                  <button
                    type="button"
                    className="call-notice-close"
                    onClick={() => setCallNotice(null)}
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <DialerPad
                roomCode={roomCode}
                onRoomCodeChange={setRoomCode}
                onJoinRoom={handleJoinRoom}
                onCreateRoom={handleCreateRoom}
                isCallInProgress={callState !== 'idle'}
              />
            </div>
          </div>

          {/* Column 3: Call Recents & Logs */}
          <div className={`panel-column history-column ${activeTab === 'history' ? 'tab-visible' : 'tab-hidden-mobile'}`}>
            <div className="glass-panel">
              <CallHistory
                history={callHistory}
                onRedial={handleRedial}
                onDeleteEntry={handleDeleteHistoryEntry}
                onClearHistory={handleClearHistory}
              />
            </div>
          </div>
        </div>
      </main>

      {/* How It Works Modal */}
      <CellularInfoModal
        isOpen={isCellularModalOpen}
        onClose={() => setIsCellularModalOpen(false)}
      />

      {/* Footer */}
      <footer className="app-footer">
        <p>
          MorphCall &bull; Free Peer-to-Peer Voice Calls with Real-Time Voice Effects &bull; Runs in your browser
        </p>
      </footer>
      </>
      )}

      {/* Add Friend with a one-time code */}
      <AddFriendModal
        key={addFriendModal || 'closed'}
        isOpen={Boolean(addFriendModal)}
        initialMode={addFriendModal || 'share'}
        myName={myName}
        onClose={() => setAddFriendModal(null)}
        onCreateCode={handleCreatePairCode}
        onRedeemCode={handleRedeemPairCode}
      />

      {/* In-Call Active Screen Modal / Overlay */}
      {callState !== 'idle' && (
        <ActiveCallScreen
          roomCode={roomCode}
          title={callTitle}
          role={callRole}
          callState={callState}
          onAccept={handleAcceptIncoming}
          onDecline={handleDeclineIncoming}
          connectionState={connectionState}
          durationSeconds={callDuration}
          activePreset={activePreset}
          onSelectPreset={handleSelectPreset}
          isRemoteMuted={isRemoteMuted}
          networkQuality={networkQuality}
          speakerOn={speakerOn}
          outputMode={outputMode}
          onToggleSpeaker={handleToggleSpeaker}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isMonitoring={isMonitoring}
          onToggleMonitoring={handleToggleMonitoring}
          onEndCall={handleEndCall}
        />
      )}

    </div>
  );
}
