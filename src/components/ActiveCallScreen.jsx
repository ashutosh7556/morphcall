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
  Check,
  Volume2,
  Ear,
  Phone
} from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import { PRESETS } from '../constants/presets';

const QUALITY_LABELS = {
  good: 'Network: Good',
  fair: 'Network: Fair',
  poor: 'Network: Weak',
};

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
  title, // contact name for contact calls (rooms show "Room 123456")
  role, // 'host' | 'guest' (room creator / caller can use effects)
  callState, // 'waiting' | 'ringing' | 'incoming' | 'connecting' | 'connected'
  onAccept,
  onDecline,
  connectionState,
  durationSeconds,
  activePreset,
  onSelectPreset,
  isRemoteMuted,
  networkQuality,
  speakerOn,
  outputMode, // 'device' | 'volume' (browser cannot switch outputs)
  onToggleSpeaker,
  isMuted,
  onToggleMute,
  isMonitoring,
  onToggleMonitoring,
  onEndCall,
}) {
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [copied, setCopied] = useState(false);
  // Only the room creator can use (or see) voice effects
  const isHost = role === 'host';

  // Format call duration MM:SS
  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const inviteLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const handleShare = async () => {
    // Neutral wording: the invite does not mention voice effects
    const text = `Join my voice call (room ${roomCode})`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Voice call', text, url: inviteLink });
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
  const accentColor = isHost ? currentPresetObj.color : '#8b5cf6';

  return (
    <div className="active-call-modal">
      <div className="active-call-inner">
        {/* Call Header */}
        <div className="call-header">
          <div className="caller-avatar-pulse">
            <div className="avatar-circle" style={{ borderColor: accentColor }}>
              <User size={36} color="#ffffff" />
            </div>
            {callState === 'connected' && <span className="pulse-ring" style={{ borderColor: accentColor }} />}
          </div>

          <h3 className="callee-number">{title || `Room ${roomCode}`}</h3>

          <div className="call-status-badge">
            {callState === 'waiting' && <span className="status-text ringing">Waiting for your friend to join...</span>}
            {callState === 'ringing' && <span className="status-text ringing">Calling...</span>}
            {callState === 'incoming' && <span className="status-text ringing">Incoming call</span>}
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

          {/* Active Voice Pill (room creator / caller only) */}
          {isHost && callState !== 'incoming' && (
            <div className="call-voice-pill" onClick={() => setShowVoiceDrawer(!showVoiceDrawer)}>
              <span className="effect-indicator" style={{ background: currentPresetObj.color }} />
              <span>Your voice: <strong>{currentPresetObj.name}</strong></span>
              <span className="tap-change">Tap to change</span>
            </div>
          )}

          {/* Connection & friend status */}
          <div className="call-meta-row">
            {connectionState && (
              <span className={`call-mode-tag conn-${connectionState}`}>
                {CONNECTION_LABELS[connectionState] || connectionState}
              </span>
            )}
            {callState === 'connected' && networkQuality && (
              <span
                className={`call-mode-tag quality-${networkQuality.level}`}
                title={`Loss ${networkQuality.lossPct.toFixed(1)}% · Jitter ${Math.round(networkQuality.jitterMs)} ms${
                  networkQuality.rttMs != null ? ` · Delay ${Math.round(networkQuality.rttMs)} ms` : ''
                }`}
              >
                {QUALITY_LABELS[networkQuality.level]}
              </span>
            )}
            {callState === 'connected' && isRemoteMuted && (
              <span className="call-mode-tag conn-failed">Friend muted</span>
            )}
          </div>

          {callState === 'connected' && networkQuality?.level === 'poor' && (
            <p className="call-quality-hint">
              Weak connection: voice may break up. Move closer to Wi-Fi, or switch between Wi-Fi and mobile data.
            </p>
          )}
        </div>

        {callState === 'incoming' ? (
          <div className="incoming-actions">
            <div className="end-call-container">
              <button type="button" className="end-call-btn" onClick={onDecline} aria-label="Decline">
                <PhoneOff size={28} />
              </button>
              <span className="end-label">Decline</span>
            </div>
            <div className="end-call-container">
              <button type="button" className="accept-call-btn" onClick={onAccept} aria-label="Accept">
                <Phone size={28} />
              </button>
              <span className="end-label">Accept</span>
            </div>
          </div>
        ) : (
        <>
        {/* Real-Time Audio Visualizer (your outgoing voice) */}
        <div className="call-visualizer-container">
          <AudioVisualizer
            isActive={callState !== 'waiting' || isMonitoring}
            preset={activePreset}
            isMuted={isMuted}
            height={85}
          />
          <div className="visualizer-info">
            <span>{isHost ? 'Your Morphed Voice' : 'Your Voice'}</span>
            <span>{isMuted ? 'Microphone Muted' : isHost ? 'Mic Live & Filtered' : 'Mic Live'}</span>
          </div>
        </div>

        {/* In-Call Quick Voice Drawer */}
        {isHost && showVoiceDrawer && (
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

          {/* Speaker ON/OFF */}
          <button
            type="button"
            className={`control-circle-btn ${speakerOn ? 'active' : ''}`}
            onClick={onToggleSpeaker}
            aria-pressed={speakerOn}
          >
            {speakerOn ? <Volume2 size={22} /> : <Ear size={22} />}
            <span className="btn-label">{speakerOn ? 'Speaker On' : 'Speaker Off'}</span>
          </button>

          {/* Loopback Monitor (Hear Myself), room creator only */}
          {isHost && (
            <button
              type="button"
              className={`control-circle-btn ${isMonitoring ? 'active' : ''}`}
              onClick={onToggleMonitoring}
            >
              <Headphones size={22} />
              <span className="btn-label">Hear Myself</span>
            </button>
          )}
        </div>

        {outputMode === 'volume' && (
          <p className="speaker-hint">
            {speakerOn ? 'Speaker on: full volume.' : 'Speaker off: handset volume.'} This browser chooses the output
            device itself.
          </p>
        )}

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
          <span className="end-label">
            {callState === 'waiting' ? 'Close Room' : callState === 'ringing' ? 'Cancel' : 'End Call'}
          </span>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
