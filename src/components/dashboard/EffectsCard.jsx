import React from 'react';
import { AudioLines, Mic, MicOff, Headphones } from 'lucide-react';
import { PRESETS } from '../../constants/presets';

const MIN = -8;
const MAX = 8;

export default function EffectsCard({
  activePreset,
  onSelectPreset,
  pitchOffset,
  onChangePitchOffset,
  isTestingMic,
  onToggleTestMic,
  isMonitoring,
  onToggleMonitoring,
}) {
  const pct = ((pitchOffset - MIN) / (MAX - MIN)) * 100;

  return (
    <section className="card effects-card" data-view="effects" id="section-effects">
      <div className="card-head">
        <div className="card-title">
          <AudioLines size={22} className="card-title-icon" />
          <h2>Voice Effects</h2>
        </div>
        <span className="pill-live">
          <i /> Real-time
        </span>
      </div>

      <div className="effect-grid">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const selected = preset.id === activePreset;
          return (
            <button
              key={preset.id}
              type="button"
              className={`effect-tile ${selected ? 'selected' : ''}`}
              style={{ '--tile-color': preset.color }}
              onClick={() => onSelectPreset(preset.id)}
              aria-pressed={selected}
            >
              <Icon size={26} className="effect-tile-icon" />
              <span className="effect-tile-name">{preset.tileName || preset.name}</span>
              <span className="effect-tile-desc">{preset.tileDesc || preset.subtitle}</span>
            </button>
          );
        })}
      </div>

      <div className="pitch-block">
        <div className="pitch-head">
          <span>Pitch Adjustment</span>
          <span className="pitch-value">
            {pitchOffset > 0 ? `+${pitchOffset}` : pitchOffset} semitones
          </span>
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step="1"
          value={pitchOffset}
          onChange={(e) => onChangePitchOffset(parseInt(e.target.value, 10))}
          className="range"
          style={{ '--pct': `${pct}%` }}
          aria-label="Pitch adjustment in semitones"
        />
        <div className="pitch-ticks">
          {[-8, -4, 0, 4, 8].map((t) => (
            <button key={t} type="button" onClick={() => onChangePitchOffset(t)}>
              {t > 0 ? `+${t}` : t}
            </button>
          ))}
        </div>
      </div>

      <div className="effects-actions">
        <button type="button" className={`btn-outline ${isTestingMic ? 'on' : ''}`} onClick={onToggleTestMic}>
          {isTestingMic ? <MicOff size={18} /> : <Mic size={18} />}
          <span>{isTestingMic ? 'Stop Live Voice' : 'Start Live Voice'}</span>
        </button>
        <button type="button" className={`btn-outline ${isMonitoring ? 'on' : ''}`} onClick={onToggleMonitoring}>
          <Headphones size={18} />
          <span>{isMonitoring ? 'Stop Hearing' : 'Hear Myself'}</span>
        </button>
      </div>
      {isMonitoring && <p className="card-hint">Wear headphones while hearing yourself to avoid echo.</p>}
    </section>
  );
}
