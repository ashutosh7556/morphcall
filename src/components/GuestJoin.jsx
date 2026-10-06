import React from 'react';
import { Phone, PhoneCall, AlertCircle, X } from 'lucide-react';

// Plain join screen for people who open an invite link. Deliberately neutral: no voice
// effects, presets or voice-changer wording, so the call looks like an ordinary voice call.
export default function GuestJoin({ roomCode, notice, onDismissNotice, onJoin, isCallInProgress }) {
  return (
    <div className="guest-join">
      <div className="glass-panel guest-card">
        <div className="guest-icon">
          <PhoneCall size={30} />
        </div>
        <h1 className="guest-title">You're invited to a call</h1>
        <p className="guest-subtitle">Room {roomCode}</p>

        {notice && (
          <div className={`call-notice ${notice.type}`} role="status">
            <AlertCircle size={15} className="call-notice-icon" />
            <span>{notice.text}</span>
            <button type="button" className="call-notice-close" onClick={onDismissNotice} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <button type="button" className="call-btn" onClick={onJoin} disabled={isCallInProgress}>
          <div className="call-btn-inner">
            <Phone size={24} className="call-icon" />
          </div>
          <span className="call-label">{notice ? 'Join Again' : 'Join Call'}</span>
        </button>

        <p className="guest-hint">Your browser will ask to use the microphone. Headphones give the best sound.</p>
      </div>
    </div>
  );
}
