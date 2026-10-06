import React from 'react';
import { User, Phone, Zap, X, ChevronRight, KeyRound, DoorOpen } from 'lucide-react';
import { avatarColor, classifyInput } from './helpers';

export default function CallCard({
  plain = false,
  selectedContact,
  contacts,
  input,
  onInputChange,
  onSelectContact,
  onCallNow,
  onQuickCall,
  activePresetObj,
  onOpenEffects,
  isCallInProgress,
}) {
  const parsed = classifyInput(input);
  const suggestions =
    parsed.kind === 'search'
      ? contacts.filter((c) => c.name.toLowerCase().includes(parsed.value)).slice(0, 4)
      : [];

  let actionLabel = 'Call Now';
  if (parsed.kind === 'room') actionLabel = 'Join Room';
  else if (parsed.kind === 'friendCode') actionLabel = 'Add Friend';

  const canAct =
    !isCallInProgress &&
    (parsed.kind === 'room' || parsed.kind === 'friendCode' || suggestions.length > 0 || (parsed.kind === 'empty' && selectedContact));

  const EffectIcon = activePresetObj?.icon;

  return (
    <section className="card call-card" data-view="home" id="section-home">
      <div className="call-hero">
        <div className="hero-ring">
          <div className="hero-avatar" style={selectedContact ? { background: avatarColor(selectedContact.name) } : undefined}>
            {selectedContact ? selectedContact.name.slice(0, 1).toUpperCase() : <User size={44} />}
          </div>
        </div>
        <h2 className="hero-name">{selectedContact ? selectedContact.name : 'Who do you want to call?'}</h2>
        <span className={`hero-status ${selectedContact?.hasPush ? 'online' : ''}`}>
          {selectedContact
            ? selectedContact.hasPush
              ? 'Can receive calls anytime'
              : 'Rings when their app is open'
            : contacts.length
              ? 'Pick a contact or enter a code'
              : 'Add a friend or enter a room code'}
        </span>
      </div>

      <div className="code-box-wrap">
        <form
          className="search-box code-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAct) onCallNow();
          }}
        >
          {parsed.kind === 'room' ? <DoorOpen size={18} /> : parsed.kind === 'friendCode' ? <KeyRound size={18} /> : <User size={18} />}
          <input
            type="text"
            autoComplete="off"
            placeholder="Enter friend code or search contact..."
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label="Friend code, room code or contact name"
          />
          {input && (
            <button type="button" className="code-box-clear" onClick={() => onInputChange('')} aria-label="Clear">
              <X size={16} />
            </button>
          )}
        </form>

        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectContact(c);
                    onInputChange('');
                  }}
                >
                  <span className="mini-avatar" style={{ background: avatarColor(c.name) }}>
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {parsed.kind === 'room' && <p className="code-hint">Room code: you'll join your friend's quick room.</p>}
        {parsed.kind === 'friendCode' && <p className="code-hint">Friend code: you'll be added to each other's contacts.</p>}
      </div>

      <button type="button" className="btn-gradient btn-call" onClick={onCallNow} disabled={!canAct}>
        <Phone size={20} />
        <span>{actionLabel}</span>
      </button>

      <button type="button" className="btn-dark btn-quick" onClick={onQuickCall} disabled={isCallInProgress}>
        <Zap size={18} />
        <span>Quick Call</span>
        <small>share a room code</small>
      </button>

      {!plain && activePresetObj && (
        <button type="button" className="selected-effect" onClick={onOpenEffects}>
          <span className="selected-effect-label">Selected Voice Effect</span>
          <span className="selected-effect-row">
            <span className="selected-effect-icon" style={{ color: activePresetObj.color }}>
              {EffectIcon && <EffectIcon size={22} />}
            </span>
            <span className="selected-effect-text">
              <strong>{activePresetObj.name}</strong>
              <small>{activePresetObj.subtitle}</small>
            </span>
            <ChevronRight size={18} className="selected-effect-chevron" />
          </span>
        </button>
      )}
    </section>
  );
}
