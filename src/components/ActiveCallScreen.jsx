import React, { useState } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  User,
  Sliders,
  Copy,
  Share2,
  Check
} from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import { PRESETS } from '../constants/presets';

const CONNECTION_LABELS = {
  new: 'Starting',
  checking: 'Finding route',
  connected: 'Peer-to-peer',
  completed: 'Peer-to-peer',
  disconnected: 'Unstable, reconnecting',
  failed: 'Failed',
  closed: 'Closed',
};

export default function ActiveCallScreen({
  roomCode,
  role, // 'host' | 'guest'
  callState, // 'waiting' | 'connecting' | 'connected'
  connectionState,
  durationSeconds,
  activePreset,
  onSelectPreset,
  remotePreset,
  isRemoteMuted,
  isMuted,
  onToggleMute,
  isMonitoring,
  onToggleMonitoring,
  onEndCall,
}) {
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [copied, setCopied] = useState(false);

  // Format call duration MM:SS
  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const inviteLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const handleShare = async () => {
    const text = `Join my MorphCall voice room: ${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MorphCall', text, url: inviteLink });
        return;
      } catch {
        // cancelled or unsupported: fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${inviteLink}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; the code is visible on screen anyway
    }
  };

  const currentPresetObj = PRESETS.find((p) => p.id === activePreset) || PRESETS[0];
  const remotePresetObj = PRESETS.find((p) => p.id === remotePreset);

  return (
    <div className="active-call-modal">
      <div className="active-call-inner">
        {/* Call Header */}
        <div className="call-header">
          <div className="caller-avatar-pulse">
            <div className="avatar-circle" style={{ borderColor: currentPresetObj.color }}>
              <User size={36} color="#ffffff" />
            </div>
            {callState === 'connected' && <span className="pulse-ring" style={{ borderColor: currentPresetObj.color }} />}
          </div>

          <h3 className="callee-number">Room {roomCode}</h3>

          <div className="call-status-badge">
            {callState === 'waiting' && <span className="status-text ringing">Waiting for your friend to join...</span>}
            {callState === 'connecting' && <span className="status-text dialing">Connecting...</span>}
            {callState === 'connected' && (
              <span className="status-text connected">
                <span className="live-dot" /> Connected ({formatTime(durationSeconds)})
              </span>
            )}
          </div>

          {/* Invite panel while the host waits */}
          {callState === 'waiting' && role === 'host' && (
            <div className="room-invite">
              <span className="room-invite-label">Share this code with your friend</span>
              <span className="room-invite-code">{roomCode}</span>
              <button type="button" className="room-share-btn" onClick={handleShare}>
                {copied ? <Check size={15} /> : navigator.share ? <Share2 size={15} /> : <Copy size={15} />}
                <span>{copied ? 'Copied!' : navigator.share ? 'Share invite' : 'Copy invite link'}</span>
              </button>
            </div>
          )}

          {/* Active Voice Pill */}
          <div className="call-voice-pill" onClick={() => setShowVoiceDrawer(!showVoiceDrawer)}>
            <span className="effect-indicator" style={{ background: currentPresetObj.color }} />
            <span>Your voice: <strong>{currentPresetObj.name}</strong></span>
            <span className="tap-change">Tap to change</span>
          </div>

          {/* Connection & friend status */}
          <div className="call-meta-row">
            {connectionState && (
              <span className={`call-mode-tag conn-${connectionState}`}>
                {CONNECTION_LABELS[connectionState] || connectionState}
              </span>
            )}
            {callState === 'connected' && remotePresetObj && (
              <span className="call-mode-tag simulated">Friend: {remotePresetObj.name}</span>
            )}
            {callState === 'connected' && isRemoteMuted && (
              <span className="call-mode-tag conn-failed">Friend muted</span>
            )}
          </div>
        </div>

        {/* Real-Time Audio Visualizer (your outgoing morphed voice) */}
        <div className="call-visualizer-container">
          <AudioVisualizer
            isActive={callState !== 'waiting' || isMonitoring}
            preset={activePreset}
            isMuted={isMuted}
            height={85}
          />
          <div className="visualizer-info">
            <span>Your Morphed Voice</span>
            <span>{isMuted ? 'Microphone Muted' : 'Mic Live & Filtered'}</span>
          </div>
        </div>

        {/* In-Call Quick Voice Drawer */}
        {showVoiceDrawer && (
          <div className="incall-voice-drawer">
            <div className="drawer-title">
              <Sliders size={14} />
              <span>Switch Voice Live</span>
            </div>
            <div className="drawer-preset-row">
              {PRESETS.map((p) => {
                const Icon = p.icon;
                const isSel = p.id === activePreset;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`drawer-preset-btn ${isSel ? 'active' : ''}`}
                    style={{ '--clr': p.color }}
                    onClick={() => {
                      onSelectPreset(p.id);
                    }}
                  >
                    <Icon size={16} />
                    <span>{p.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* In-Call Control Buttons */}
        <div className="call-control-grid">
          {/* Mute Button */}
          <button
            type="button"
            className={`control-circle-btn ${isMuted ? 'active-mute' : ''}`}
            onClick={onToggleMute}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            <span className="btn-label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {/* Loopback Monitor (Hear Myself) */}
          <button
            type="button"
            className={`control-circle-btn ${isMonitoring ? 'active' : ''}`}
            onClick={onToggleMonitoring}
          >
            <Headphones size={22} />
            <span className="btn-label">Hear Myself</span>
          </button>
        </div>

        {/* Hang Up Action Button */}
        <div className="end-call-container">
          <button
            type="button"
            className="end-call-btn"
            onClick={onEndCall}
            aria-label="End Call"
          >
            <PhoneOff size={28} />
          </button>
          <span className="end-label">{callState === 'waiting' ? 'Close Room' : 'End Call'}</span>
        </div>
      </div>
    </div>
  );
}
