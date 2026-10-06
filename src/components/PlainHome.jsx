import React, { useState } from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';
import { formatPairCode } from '../calling/identity';

/**
 * First visit from an "add friend" link: the friend enters their name and the contact
 * is saved. Afterwards the friend gets the plain dashboard (no voice effects anywhere).
 */
export default function PlainHome({ myName, pendingAddCode, onRedeemPending }) {
  const [name, setName] = useState(myName || '');
  const [status, setStatus] = useState(null); // { type, text }

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
