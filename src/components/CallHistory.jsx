import React from 'react';
import { History, Trash2, Clock, PhoneForwarded, PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, X } from 'lucide-react';
import { PRESETS } from '../constants/presets';

const DIRECTION_ICONS = {
  incoming: PhoneIncoming,
  outgoing: PhoneOutgoing,
  missed: PhoneMissed,
};

// plain: neutral version for the friend's app (no voice-effect badges or wording)
export default function CallHistory({ history, onRedial, onDeleteEntry, onClearHistory, plain = false }) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <Clock size={28} className="empty-icon" />
        <p>No recent calls yet.</p>
        <span>{plain ? 'Calls with your contacts will show up here.' : 'Call a contact or join a room to get started.'}</span>
      </div>
    );
  }

  return (
    <div className="call-history-section">
      <div className="history-header">
        <div className="history-title">
          <History size={16} />
          <span>Recent Calls ({history.length})</span>
        </div>
        <button
          type="button"
          className="clear-history-btn"
          onClick={onClearHistory}
          title="Clear call log"
        >
          <Trash2 size={14} />
          <span>Clear All</span>
        </button>
      </div>

      <div className="history-list">
        {history.map((item) => {
          const presetObj = PRESETS.find((p) => p.id === item.preset) || PRESETS[0];
          const DirectionIcon = DIRECTION_ICONS[item.direction];
          const isContact = Boolean(item.contactId);

          return (
            <div key={item.id} className={`history-item ${item.direction === 'missed' ? 'missed' : ''}`}>
              <div className="history-item-left">
                {plain || !item.preset ? (
                  <div className="history-direction-icon">
                    {DirectionIcon ? <DirectionIcon size={16} /> : <Phone size={16} />}
                  </div>
                ) : (
                  <div
                    className="history-preset-badge"
                    style={{ background: presetObj.glow, color: presetObj.color }}
                  >
                    {presetObj.name.split(' ')[0]}
                  </div>
                )}
                <div className="history-details">
                  <span className="history-number">{item.number}</span>
                  <span className="history-meta">
                    {item.time} • {item.duration}
                  </span>
                </div>
              </div>

              <div className="history-item-actions">
                <button
                  type="button"
                  className="redial-btn"
                  onClick={() => onRedial(item)}
                  title={isContact ? `Call ${item.number}` : 'Rejoin this room'}
                >
                  {isContact ? <Phone size={15} /> : <PhoneForwarded size={16} />}
                  <span>{isContact ? 'Call' : 'Rejoin'}</span>
                </button>
                <button
                  type="button"
                  className="delete-log-btn"
                  onClick={() => onDeleteEntry(item.id)}
                  title="Delete this call log"
                  aria-label={`Delete call log for ${item.number}`}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
