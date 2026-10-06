import React from 'react';
import { History, Trash2, Clock, PhoneForwarded, X } from 'lucide-react';
import { PRESETS } from '../constants/presets';

export default function CallHistory({ history, onRedial, onDeleteEntry, onClearHistory }) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <Clock size={28} className="empty-icon" />
        <p>No recent outgoing calls yet.</p>
        <span>Create or join a room to start a call with your morphed voice.</span>
      </div>
    );
  }

  return (
    <div className="call-history-section">
      <div className="history-header">
        <div className="history-title">
          <History size={16} />
          <span>Recent Morphed Calls ({history.length})</span>
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

          return (
            <div key={item.id} className="history-item">
              <div className="history-item-left">
                <div
                  className="history-preset-badge"
                  style={{ background: presetObj.glow, color: presetObj.color }}
                >
                  {presetObj.name.split(' ')[0]}
                </div>
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
                  onClick={() => onRedial(item.number, item.preset)}
                  title="Rejoin this room with the same voice effect"
                >
                  <PhoneForwarded size={16} />
                  <span>Rejoin</span>
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
