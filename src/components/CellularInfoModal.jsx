import React from 'react';
import {
  X,
  Info,
  AlertTriangle,
  CheckCircle2,
  Mic,
  Cpu,
  Users,
  ChevronRight
} from 'lucide-react';

export default function CellularInfoModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <Info className="modal-icon" size={22} />
            <div>
              <h2 className="modal-title">How MorphCall Works</h2>
              <p className="modal-subtitle">Free browser-to-browser calls with real-time voice effects</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="solution-section">
            <h4 className="section-subheading">Free calls with your morphed voice</h4>
            <p className="solution-intro">
              Your voice is changed on your own device, then sent straight to your friend's browser over WebRTC.
              No phone numbers, accounts or paid services.
            </p>

            <div className="diagram-flow">
              <div className="diagram-step">
                <div className="step-icon"><Mic size={24} /></div>
                <div className="step-title">1. Your Mic</div>
                <div className="step-desc">You speak normally after allowing mic access</div>
              </div>

              <div className="diagram-arrow"><ChevronRight size={20} /></div>

              <div className="diagram-step">
                <div className="step-icon"><Cpu size={24} /></div>
                <div className="step-title">2. Voice Effect</div>
                <div className="step-desc">Kid, Deep, Girl... applied in real time before sending</div>
              </div>

              <div className="diagram-arrow"><ChevronRight size={20} /></div>

              <div className="diagram-step">
                <div className="step-icon"><Users size={24} /></div>
                <div className="step-title">3. Friend's Browser</div>
                <div className="step-desc">Audio travels peer-to-peer, encrypted, and your friend hears the morphed voice</div>
              </div>
            </div>
          </div>

          <div className="reason-section">
            <h4 className="section-subheading">How to call a friend</h4>
            <ul className="reason-list">
              <li>Pick a voice in <strong>Voice Effects</strong>. Use <strong>Start Live Voice</strong> to preview it.</li>
              <li>Tap <strong>Create Room</strong> and share the 6-digit code or invite link.</li>
              <li>Your friend opens the same website, enters the code and taps <strong>Join Room</strong>.</li>
              <li>Talk! You can switch voices, mute, or end the call anytime.</li>
            </ul>
          </div>

          <div className="alert-card success">
            <CheckCircle2 className="alert-icon" size={22} />
            <div className="alert-text">
              <strong>Private by design:</strong> a free public signaling server only helps the two browsers find each
              other using the room code. The audio itself goes directly between you and your friend.
            </div>
          </div>

          <div className="alert-card warning">
            <AlertTriangle className="alert-icon" size={22} />
            <div className="alert-text">
              <strong>Tips:</strong> wear headphones to avoid echo. Phones need the site opened over https. If a call
              never connects, one network is blocking peer-to-peer audio: try Wi-Fi instead of mobile data (or the
              other way around).
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
