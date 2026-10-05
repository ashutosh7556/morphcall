import React from 'react';
import { 
  Headphones, 
  Mic, 
  MicOff, 
  Sliders, 
  Volume2 
} from 'lucide-react';
import { PRESETS } from '../constants/presets';

export default function VoiceSelector({
  activePreset,
  onSelectPreset,
  pitchOffset,
  onChangePitchOffset,
  isMonitoring,
  onToggleMonitoring,
  isTestingMic,
  onToggleTestMic,
  disabled = false,
}) {
  return (
    <div className="voice-selector-container">
      <div className="section-header">
        <div className="section-title-wrap">
          <Sliders className="section-icon" size={18} />
          <h2 className="section-title">Voice Morphing Effects</h2>
        </div>
        <span className="live-tag">REAL-TIME DSP</span>
      </div>

      {/* Preset Cards Grid */}
      <div className="preset-grid">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isSelected = activePreset === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-card ${isSelected ? 'selected' : ''}`}
              style={{
                '--preset-color': preset.color,
                '--preset-glow': preset.glow,
              }}
              onClick={() => onSelectPreset(preset.id)}
              disabled={disabled}
            >
              <div className="preset-header">
                <div className="preset-icon-box">
                  <Icon size={20} />
                </div>
                <span className="preset-badge">{preset.badge}</span>
              </div>
              <div className="preset-info">
                <span className="preset-name">{preset.name}</span>
                <span className="preset-desc">{preset.subtitle}</span>
              </div>
              {isSelected && <div className="active-pill">ACTIVE</div>}
            </button>
          );
        })}
      </div>

      {/* Fine-Tuning Pitch Control */}
      <div className="fine-tuning-card">
        <div className="fine-tune-header">
          <div className="tune-label">
            <Volume2 size={16} />
            <span>Fine-Tune Pitch Offset</span>
          </div>
          <span className="tune-value">
            {pitchOffset > 0 ? `+${pitchOffset}` : pitchOffset} semitones
          </span>
        </div>
        <input
          type="range"
          min="-8"
          max="8"
          step="1"
          value={pitchOffset}
          onChange={(e) => onChangePitchOffset(parseInt(e.target.value, 10))}
          className="pitch-slider"
          disabled={disabled}
        />
        <div className="pitch-ticks">
          <span>-8 Deepest</span>
          <button
            type="button"
            className="reset-pitch-btn"
            onClick={() => onChangePitchOffset(0)}
            title="Reset to 0"
          >
            0 Reset
          </button>
          <span>+8 Highest</span>
        </div>
      </div>

      {/* Mic Test & Loopback Controls */}
      <div className="audio-monitor-bar">
        <button
          type="button"
          className={`action-btn test-mic-btn ${isTestingMic ? 'active' : ''}`}
          onClick={onToggleTestMic}
        >
          {isTestingMic ? <MicOff size={16} /> : <Mic size={16} />}
          <span>{isTestingMic ? 'Stop Live Voice' : 'Start Live Voice'}</span>
        </button>

        <button
          type="button"
          className={`action-btn monitor-btn ${isMonitoring ? 'active' : ''}`}
          onClick={onToggleMonitoring}
          title="Listen to your morphed voice in headphones"
        >
          <Headphones size={16} />
          <span>{isMonitoring ? 'Muting Ear Monitor' : 'Hear Myself (Loopback)'}</span>
        </button>
      </div>

      {isMonitoring && (
        <div className="feedback-warning">
          <span>🎧 <strong>Tip:</strong> Wear headphones while "Hear Myself" is on to avoid echo/acoustic feedback.</span>
        </div>
      )}
    </div>
  );
}
