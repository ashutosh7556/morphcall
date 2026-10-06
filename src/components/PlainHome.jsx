import React, { useState } from 'react';
import { PhoneCall, UserPlus, AlertCircle, X } from 'lucide-react';
import ContactsPanel from './ContactsPanel';
import CallHistory from './CallHistory';
import { formatPairCode } from '../calling/identity';

/**
 * Friend's plain call app: contacts, recents and calls only. No voice effects and no
 * voice-changer wording anywhere, so it looks like an ordinary calling app.
 */
export default function PlainHome({
  myName,
  pendingAddCode,
  onRedeemPending,
  notice,
  onDismissNotice,
  history,
  onRedial,
  onDeleteEntry,
  onClearHistory,
  ...contactsProps
}) {
  const [name, setName] = useState(myName || '');
  const [status, setStatus] = useState(null); // { type, text }

  // First visit from an "add friend" link: save the contact
  if (pendingAddCode) {
    const handleSave = async (e) => {
      e.preventDefault();
      if (!name.trim()) {
        setStatus({ type: 'error', text: 'Enter your name so your friend knows who you are.' });
        return;
      }
      setStatus({ type: 'busy', text: 'Saving contact...' });
      try {
        await onRedeemPending(name.trim());
      } catch (err) {
        setStatus({ type: 'error', text: err.message });
      }
    };

    return (
      <div className="guest-join">
        <form className="glass-panel guest-card" onSubmit={handleSave}>
          <div className="guest-icon">
            <UserPlus size={30} />
          </div>
          <h1 className="guest-title">Add contact</h1>
          <p className="guest-subtitle">Code {formatPairCode(pendingAddCode)}</p>

          <div className="form-group plain-name-field">
            <label htmlFor="plain-name">Your name</label>
            <div className="input-with-icon">
              <UserPlus size={16} />
              <input
                id="plain-name"
                type="text"
                maxLength={30}
                placeholder="e.g. Sam"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {status && status.type !== 'busy' && (
            <div className="call-notice error" role="status">
              <AlertCircle size={15} className="call-notice-icon" />
              <span>{status.text}</span>
            </div>
          )}

          <button type="submit" className="call-btn" disabled={status?.type === 'busy'}>
            <span className="call-label">{status?.type === 'busy' ? 'Saving...' : 'Save contact'}</span>
          </button>
          <p className="guest-hint">After this you can call each other anytime from this page.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="plain-home">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo-icon plain-logo">
            <PhoneCall size={20} />
          </div>
          <div className="brand-text">
            <h1 className="brand-name">Voice Call</h1>
            {myName && <span className="brand-tagline">Signed in as {myName}</span>}
          </div>
        </div>
      </header>

      <div className="plain-grid">
        <div className="glass-panel">
          {notice && (
            <div className={`call-notice ${notice.type}`} role="status">
              <AlertCircle size={15} className="call-notice-icon" />
              <span>{notice.text}</span>
              <button type="button" className="call-notice-close" onClick={onDismissNotice} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}
          <ContactsPanel {...contactsProps} />
        </div>

        <div className="glass-panel">
          <CallHistory
            plain
            history={history}
            onRedial={onRedial}
            onDeleteEntry={onDeleteEntry}
            onClearHistory={onClearHistory}
          />
        </div>
      </div>
    </div>
  );
}
