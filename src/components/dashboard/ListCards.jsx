import React, { useEffect, useRef, useState } from 'react';
import {
  Users, UserPlus, Search, Phone, MoreVertical, Clock, KeyRound, Bell,
  ArrowDownLeft, ArrowUpRight, PhoneMissed, Trash2, UserMinus, DoorOpen,
} from 'lucide-react';
import { avatarColor } from './helpers';

// Small "⋮" menu for list rows
function RowMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="row-menu" ref={ref}>
      <button type="button" className="row-menu-btn" onClick={() => setOpen(!open)} aria-label={label} aria-expanded={open}>
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="row-menu-pop" role="menu">
          {items.map(({ label: text, icon: Icon, onClick, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              className={danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
            >
              <Icon size={15} />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactsCard({
  contacts,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  onCall,
  onRemove,
  onAddFriend,
  onEnterCode,
  pushState,
  onEnablePush,
  isEnablingPush,
  isCallInProgress,
  canShare = true,
}) {
  const q = search.trim().toLowerCase();
  const filtered = q ? contacts.filter((c) => c.name.toLowerCase().includes(q)) : contacts;
  const pushOn = pushState.supported && pushState.permission === 'granted' && pushState.subscribed;

  return (
    <section className="card list-card" data-view="contacts" id="section-contacts">
      <div className="card-head">
        <div className="card-title">
          <Users size={22} className="card-title-icon" />
          <h2>
            Contacts <span className="muted">({contacts.length})</span>
          </h2>
        </div>
        {canShare && (
          <button type="button" className="btn-gradient btn-sm" onClick={onAddFriend}>
            <UserPlus size={16} />
            <span>Add Friend</span>
          </button>
        )}
      </div>

      {!pushOn && (
        <div className="push-banner">
          <Bell size={16} />
          <span>
            {pushState.supported
              ? pushState.permission === 'denied'
                ? 'Notifications are blocked in your browser settings, so calls only ring while the app is open.'
                : 'Turn on notifications to receive calls when the app is closed.'
              : pushState.reason}
          </span>
          {pushState.supported && pushState.permission !== 'denied' && (
            <button type="button" onClick={onEnablePush} disabled={isEnablingPush}>
              {isEnablingPush ? '...' : 'Turn On'}
            </button>
          )}
        </div>
      )}

      <label className="search-box list-search">
        <Search size={17} />
        <input
          type="search"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search contacts"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="list-empty">
          <Users size={26} />
          <p>{contacts.length ? 'No contacts match your search.' : 'No contacts yet'}</p>
          {!contacts.length && (
            <span>
              {canShare
                ? 'Tap Add Friend and send the one-time code. After that you can call each other anytime.'
                : 'Ask your friend for a code to add them.'}
            </span>
          )}
        </div>
      ) : (
        <ul className="list">
          {filtered.map((c) => (
            <li key={c.id} className={`list-row ${selectedId === c.id ? 'selected' : ''}`}>
              <button type="button" className="list-main" onClick={() => onSelect(c)}>
                <span className="avatar" style={{ background: avatarColor(c.name) }}>
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="list-text">
                  <strong>{c.name}</strong>
                  <small className={`status ${c.hasPush ? 'on' : ''}`}>
                    {c.hasPush ? 'Reachable anytime' : 'When app is open'}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="round-call"
                onClick={() => onCall(c)}
                disabled={isCallInProgress}
                aria-label={`Call ${c.name}`}
              >
                <Phone size={17} />
              </button>
              <RowMenu
                label={`More options for ${c.name}`}
                items={[
                  { label: 'Call', icon: Phone, onClick: () => onCall(c) },
                  { label: 'Remove contact', icon: UserMinus, onClick: () => onRemove(c), danger: true },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="link-btn" onClick={onEnterCode}>
        <KeyRound size={15} />
        I have a friend code
      </button>
    </section>
  );
}

const DIRECTION = {
  incoming: { icon: ArrowDownLeft, cls: 'in' },
  outgoing: { icon: ArrowUpRight, cls: 'out' },
  missed: { icon: PhoneMissed, cls: 'missed' },
};

export function RecentCallsCard({ history, onRedial, onDelete, onClearAll }) {
  return (
    <section className="card list-card" data-view="recents" id="section-recents">
      <div className="card-head">
        <div className="card-title">
          <Clock size={22} className="card-title-icon" />
          <h2>Recent Calls</h2>
        </div>
        {history.length > 0 && (
          <button type="button" className="link-btn link-btn-inline" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="list-empty">
          <Clock size={26} />
          <p>No recent calls yet</p>
          <span>Calls with your contacts and rooms show up here.</span>
        </div>
      ) : (
        <ul className="list">
          {history.map((item) => {
            const dir = DIRECTION[item.direction] || DIRECTION.outgoing;
            const DirIcon = item.contactId ? dir.icon : DoorOpen;
            return (
              <li key={item.id} className="list-row">
                <div className="list-main static">
                  <span className="avatar" style={{ background: avatarColor(item.number) }}>
                    {item.contactId ? item.number.slice(0, 1).toUpperCase() : '#'}
                  </span>
                  <span className="list-text">
                    <strong className={item.direction === 'missed' ? 'missed' : ''}>
                      <DirIcon size={14} className={`dir-icon ${item.contactId ? dir.cls : ''}`} />
                      {item.number}
                    </strong>
                    <small>
                      {item.time} • {item.duration}
                    </small>
                  </span>
                </div>
                <button
                  type="button"
                  className="round-call"
                  onClick={() => onRedial(item)}
                  aria-label={item.contactId ? `Call ${item.number}` : `Rejoin ${item.number}`}
                >
                  <Phone size={17} />
                </button>
                <RowMenu
                  label={`More options for ${item.number}`}
                  items={[
                    { label: item.contactId ? 'Call back' : 'Rejoin room', icon: Phone, onClick: () => onRedial(item) },
                    { label: 'Delete from log', icon: Trash2, onClick: () => onDelete(item.id), danger: true },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
