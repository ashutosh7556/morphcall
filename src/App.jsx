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
import { PRESETS } from './constants/presets';
import { RoomCall, generateRoomCode, normalizeRoomCode } from './calling/roomCall';
import { defaultSpeakerOn, routeCallAudio } from './calling/audioOutput';
import './App.css';

// Invite links look like https://site/?room=123456
const invitedRoomCode = normalizeRoomCode(new URLSearchParams(window.location.search).get('room'));
// People who open an invite link get a plain call screen: only the room creator
// can use voice effects, and guests never see that effects exist.
const isGuestLink = Boolean(invitedRoomCode);

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
  const sessionRef = useRef(null); // active RoomCall
  const callInfoRef = useRef(null); // { code, preset } while a call is in progress
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

  // Neutral tab title for invited guests
  useEffect(() => {
    document.title = isGuestLink ? 'Voice Call' : 'MorphCall - Real-time Voice Changer';
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
    connectedAtRef.current = Date.now();
    voiceEngine.playCallChime('connect');
    setCallState('connected');
    timerRef.current = setInterval(() => {
      setCallDuration(Math.round((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
  };

  // Cleanup when a call ends (either side, or on error). Runs once per session and
  // only reads refs, because it is also called from WebRTC event handlers.
  const finishCall = (session, reason) => {
    if (sessionRef.current !== session) return;
    sessionRef.current = null;

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
      setCallHistory((prev) => [
        {
          id: Date.now().toString(),
          number: `Room ${info.code}`,
          preset: info.preset,
          duration: wasConnected
            ? `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : 'Not connected',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ]);
    }

    voiceEngine.playCallChime('hangup');
    setCallState('idle');
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

  // Start a browser-to-browser call: 'host' creates the room, 'guest' joins it
  const startSession = async (role, code) => {
    if (sessionRef.current) return;

    try {
      // Microphone -> VoiceEngine; its output is what the friend hears.
      // Only the room creator sends the selected effect; guests send their natural voice.
      await voiceEngine.startMicrophone();
      if (role === 'host') voiceEngine.applyPreset(activePreset, pitchOffset);
      else voiceEngine.applyPreset('normal', 0);
      voiceEngine.setMute(false);
      setIsMuted(false);
    } catch (err) {
      setCallNotice({ type: 'error', text: `Microphone permission is required: ${err.message}` });
      return;
    }

    const outbound = voiceEngine.getOutboundStream();
    if (!outbound) {
      setCallNotice({ type: 'error', text: 'Voice engine is not ready. Please try again.' });
      return;
    }
    // The call gets its own copy so ending it never stops the engine's stream
    const localStream = outbound.clone();

    const session = new RoomCall({
      onStatus: (status) => {
        if (sessionRef.current !== session) return;
        if (status === 'connected') markConnected();
        else setCallState(status);
      },
      onConnectionState: (state) => {
        if (sessionRef.current === session) setConnectionState(state);
      },
      onRemoteStream: (remoteStream) => {
        const el = remoteAudioRef.current;
        if (!el || sessionRef.current !== session) return;
        el.srcObject = remoteStream;
        routeCallAudio(el, speakerOnRef.current).then(setOutputMode);
        el.play().catch(() => {
          setCallNotice({ type: 'info', text: 'Tap anywhere on the page if you cannot hear your friend.' });
        });
      },
      onMessage: (msg) => {
        if (sessionRef.current !== session) return;
        if (msg.type === 'channel-open') {
          session.send({ type: 'mute', muted: isMutedRef.current });
        } else if (msg.type === 'mute') {
          setIsRemoteMuted(Boolean(msg.muted));
        }
      },
      onQuality: (quality) => {
        if (sessionRef.current === session) setNetworkQuality(quality);
      },
      onEnded: (reason) => finishCall(session, reason),
    });

    sessionRef.current = session;
    callRoleRef.current = role;
    callInfoRef.current = { code, preset: role === 'host' ? activePreset : 'normal' };
    setCallRole(role);
    setRoomCode(code);
    setConnectionState(null);
    setIsRemoteMuted(false);
    setNetworkQuality(null);
    setCallNotice(null);
    setCallDuration(0);
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

  // Rejoin a room from history
  const handleRedial = (label, preset) => {
    const code = normalizeRoomCode(label);
    if (code) setRoomCode(code);
    if (preset) {
      handleSelectPreset(preset);
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
          <strong>Free browser-to-browser calls:</strong> create a room, share the 6-digit code, and talk with your
          friend using your morphed voice. No phone numbers, no accounts, no cost.
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

          {/* Column 2: Room Call Pad */}
          <div className={`panel-column dialer-column ${activeTab === 'dialer' ? 'tab-visible' : 'tab-hidden-mobile'}`}>
            <div className="glass-panel dialer-card">
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

      {/* In-Call Active Screen Modal / Overlay */}
      {callState !== 'idle' && (
        <ActiveCallScreen
          roomCode={roomCode}
          role={callRole}
          callState={callState}
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
