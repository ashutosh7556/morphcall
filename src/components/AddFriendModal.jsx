import React, { useEffect, useState } from 'react';
import { X, UserPlus, Copy, Share2, Check, KeyRound } from 'lucide-react';
import { formatPairCode } from '../calling/identity';

/**
 * Add a friend with a one-time code.
 * mode 'share' : create a code / invite link to send (room creator's app)
 * mode 'enter' : type a code a friend sent you
 */
export default function AddFriendModal({ isOpen, initialMode = 'share', myName, onClose, onCreateCode, onRedeemCode }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState(myName || '');
  const [code, setCode] = useState(null); // { code, expiresAt }
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null); // { type: 'error' | 'success' | 'busy', text }
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Countdown for the code's expiry
  useEffect(() => {
    if (!code) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code]);

  if (!isOpen) return null;

  const needsName = !name.trim();
  const secondsLeft = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;
  const link = code ? `${window.location.origin}${window.location.pathname}?add=${code.code}` : '';

  const handleCreate = async () => {
    if (needsName) {
      setStatus({ type: 'error', text: 'Enter your name first. Your friend will see it.' });
      return;
    }
    setStatus({ type: 'busy', text: 'Creating code...' });
    try {
      const result = await onCreateCode(name.trim());
      setCode({ code: result.code, expiresAt: Date.now() + result.ttl * 1000 });
      setNow(Date.now());
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    }
  };

  const handleShare = async () => {
    // Neutral wording: it reads like an ordinary call app invite
    const text = `Add me on Voice Call so we can call each other. Code: ${formatPairCode(code.code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Voice Call', text, url: link });
        return;
      } catch {
        // cancelled: fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; code is visible on screen
    }
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (needsName) {
      setStatus({ type: 'error', text: 'Enter your name first. Your friend will see it.' });
      return;
    }
    setStatus({ type: 'busy', text: 'Adding contact...' });
    try {
      const friend = await onRedeemCode(input, name.trim());
      setStatus({ type: 'success', text: `${friend.name} was added to your contacts.` });
      setInput('');
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card add-friend-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <UserPlus className="modal-icon" size={22} />
            <div>
              <h2 className="modal-title">Add Friend</h2>
              <p className="modal-subtitle">Connect once with a code, then call anytime</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-tabs">
          <button type="button" className={`tab-btn ${mode === 'share' ? 'active' : ''}`} onClick={() => { setMode('share'); setStatus(null); }}>
            Share my code
          </button>
          <button type="button" className={`tab-btn ${mode === 'enter' ? 'active' : ''}`} onClick={() => { setMode('enter'); setStatus(null); }}>
            Enter a code
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="my-name">Your name (shown to friends)</label>
            <div className="input-with-icon">
              <UserPlus size={16} />
              <input
                id="my-name"
                type="text"
                maxLength={30}
                placeholder="e.g. Alex"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {mode === 'share' && (
            <>
              {!code || secondsLeft === 0 ? (
                <button type="button" className="save-config-btn" onClick={handleCreate} disabled={status?.type === 'busy'}>
                  {status?.type === 'busy' ? 'Creating...' : code ? 'Create a new code' : 'Create one-time code'}
                </button>
              ) : (
                <div className="room-invite">
                  <span className="room-invite-label">Send this code or link to your friend</span>
                  <span className="room-invite-code pair-code">{formatPairCode(code.code)}</span>
                  <button type="button" className="room-share-btn" onClick={handleShare}>
                    {copied ? <Check size={15} /> : navigator.share ? <Share2 size={15} /> : <Copy size={15} />}
                    <span>{copied ? 'Copied!' : navigator.share ? 'Share invite' : 'Copy invite link'}</span>
                  </button>
                  <span className="room-invite-label">
                    Works once · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
              <p className="config-desc">
                When your friend uses the code, they appear in your contacts automatically and you can call each other
                anytime.
              </p>
            </>
          )}

          {mode === 'enter' && (
            <form className="voip-form" onSubmit={handleRedeem}>
              <div className="form-group">
                <label htmlFor="pair-code">Friend's code</label>
                <div className="input-with-icon">
                  <KeyRound size={16} />
                  <input
                    id="pair-code"
                    type="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="ABCD-2345"
                    value={input}
                    onChange={(e) => setInput(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
              <button type="submit" className="save-config-btn" disabled={status?.type === 'busy' || input.replace(/[^A-Z0-9]/gi, '').length !== 8}>
                {status?.type === 'busy' ? 'Adding...' : 'Add contact'}
              </button>
            </form>
          )}

          {status && status.type !== 'busy' && (
            <div className={`alert-card ${status.type === 'success' ? 'success' : 'warning'}`}>
              <div className="alert-text">{status.text}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
