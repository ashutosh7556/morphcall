import React, { useState } from 'react';
import { X, Settings, User, Bell, BellRing, Info, Trash2, DoorOpen } from 'lucide-react';
import InstallButton from '../InstallButton';

export default function SettingsModal({
  isOpen,
  onClose,
  plain,
  myName,
  onSaveName,
  pushOn,
  pushState,
  onEnablePush,
  isEnablingPush,
  onHowItWorks,
  onClearHistory,
  onJoinRoom,
}) {
  const [name, setName] = useState(myName || '');
  const [saved, setSaved] = useState(false);
  const [room, setRoom] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <Settings className="modal-icon" size={22} />
            <div>
              <h2 className="modal-title">Settings</h2>
              <p className="modal-subtitle">Profile, notifications and app</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <form
            className="settings-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await onSaveName(name.trim());
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            <label htmlFor="settings-name">Your name (shown to contacts)</label>
            <div className="settings-inline">
              <div className="input-with-icon">
                <User size={16} />
                <input id="settings-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
              </div>
              <button type="submit" className="btn-gradient btn-sm">{saved ? 'Saved' : 'Save'}</button>
            </div>
          </form>

          <div className="settings-row">
            <label>Call notifications</label>
            {pushOn ? (
              <p className="settings-status on">
                <BellRing size={16} /> On: contacts can ring you even when the app is closed.
              </p>
            ) : pushState.supported && pushState.permission !== 'denied' ? (
              <button type="button" className="btn-outline" onClick={onEnablePush} disabled={isEnablingPush}>
                <Bell size={16} />
                <span>{isEnablingPush ? 'Turning on...' : 'Turn on notifications'}</span>
              </button>
            ) : (
              <p className="settings-status">{pushState.supported ? 'Blocked in your browser settings.' : pushState.reason}</p>
            )}
          </div>

          <form
            className="settings-row"
            onSubmit={(e) => {
              e.preventDefault();
              onJoinRoom(room);
            }}
          >
            <label htmlFor="settings-room">Join a quick room</label>
            <div className="settings-inline">
              <div className="input-with-icon">
                <DoorOpen size={16} />
                <input
                  id="settings-room"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit room code"
                  value={room}
                  onChange={(e) => setRoom(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <button type="submit" className="btn-gradient btn-sm" disabled={room.length !== 6}>Join</button>
            </div>
          </form>

          <div className="settings-row settings-actions">
            <InstallButton />
            {!plain && (
              <button type="button" className="cellular-info-btn" onClick={onHowItWorks}>
                <Info size={16} />
                <span>How It Works</span>
              </button>
            )}
            <button type="button" className="cellular-info-btn danger-btn" onClick={onClearHistory}>
              <Trash2 size={16} />
              <span>Clear call log</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
