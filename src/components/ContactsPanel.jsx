import React from 'react';
import { Users, UserPlus, Phone, X, Bell, BellOff, KeyRound } from 'lucide-react';

const PRESENCE_LABELS = {
  connecting: 'Connecting...',
  online: 'Online, ready for calls',
  reconnecting: 'Reconnecting...',
  duplicate: 'Open in another tab (that tab receives calls)',
};

/**
 * Saved contacts with one-tap calling.
 * pushState: { supported, reason, permission } for incoming-call notifications.
 */
export default function ContactsPanel({
  contacts,
  presenceStatus,
  pushState,
  onEnablePush,
  isEnablingPush = false,
  onCall,
  onRemove,
  onAddFriend,
  onEnterCode,
  isCallInProgress = false,
}) {
  const pushOn = pushState.supported && pushState.permission === 'granted' && pushState.subscribed;

  return (
    <div className="contacts-panel">
      <div className="history-header">
        <div className="history-title">
          <Users size={16} />
          <span>Contacts ({contacts.length})</span>
        </div>
        <span className={`presence-dot ${presenceStatus === 'online' ? 'online' : ''}`} title={PRESENCE_LABELS[presenceStatus]}>
          {PRESENCE_LABELS[presenceStatus] || presenceStatus}
        </span>
      </div>

      {/* Incoming-call notifications */}
      {!pushOn && (
        <div className="push-card">
          <BellOff size={16} className="push-card-icon" />
          <div className="push-card-text">
            {pushState.supported ? (
              pushState.permission === 'denied' ? (
                <span>Notifications are blocked. Allow them in your browser settings to receive calls when the app is closed.</span>
              ) : (
                <span>Turn on notifications to receive calls even when the app is closed.</span>
              )
            ) : (
              <span>{pushState.reason}</span>
            )}
          </div>
          {pushState.supported && pushState.permission !== 'denied' && (
            <button type="button" className="push-card-btn" onClick={onEnablePush} disabled={isEnablingPush}>
              <Bell size={14} />
              <span>{isEnablingPush ? 'Enabling...' : 'Turn On'}</span>
            </button>
          )}
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="history-empty contacts-empty">
          <Users size={26} className="empty-icon" />
          <p>No contacts yet</p>
          <span>
            {onAddFriend
              ? 'Tap Add Friend and send the one-time code to someone. After that you can call them anytime.'
              : 'Ask your friend for a code to add them.'}
          </span>
        </div>
      ) : (
        <div className="history-list contacts-list">
          {contacts.map((contact) => (
            <div key={contact.id} className="history-item">
              <div className="history-item-left">
                <div className="contact-avatar">{contact.name.slice(0, 1).toUpperCase()}</div>
                <div className="history-details">
                  <span className="history-number">{contact.name}</span>
                  <span className="history-meta">{contact.hasPush ? 'Can receive calls anytime' : 'Rings when their app is open'}</span>
                </div>
              </div>
              <div className="history-item-actions">
                <button
                  type="button"
                  className="redial-btn"
                  onClick={() => onCall(contact)}
                  disabled={isCallInProgress}
                  title={`Call ${contact.name}`}
                >
                  <Phone size={15} />
                  <span>Call</span>
                </button>
                <button
                  type="button"
                  className="delete-log-btn"
                  onClick={() => onRemove(contact)}
                  title={`Remove ${contact.name}`}
                  aria-label={`Remove ${contact.name}`}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="contacts-actions">
        {onAddFriend && (
          <button type="button" className="create-room-btn" onClick={onAddFriend}>
            <UserPlus size={18} />
            <span>Add Friend</span>
          </button>
        )}
        <button type="button" className="contacts-code-btn" onClick={onEnterCode}>
          <KeyRound size={15} />
          <span>I have a code</span>
        </button>
      </div>
    </div>
  );
}
