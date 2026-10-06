import React, { useEffect, useRef, useState } from 'react';
import { Mic, ChevronDown, ShieldCheck, Zap, Users } from 'lucide-react';
import { voiceEngine } from '../../audio/VoiceEngine';

const BARS = 20;

/**
 * Microphone picker with a live input level meter.
 * isLive: the mic is running (preview or call), so the meter shows real levels.
 */
export function MicrophoneCard({ isLive, selectedDeviceId, onSelectDevice }) {
  const [devices, setDevices] = useState([]);
  const [permission, setPermission] = useState('prompt');
  const [level, setLevel] = useState(0);
  const frameRef = useRef(null);

  // Microphone list (names appear once mic permission has been granted)
  useEffect(() => {
    const load = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'audioinput'));
      } catch {
        setDevices([]);
      }
    };
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);

    let status = null;
    navigator.permissions
      ?.query({ name: 'microphone' })
      .then((s) => {
        status = s;
        setPermission(s.state);
        s.onchange = () => {
          setPermission(s.state);
          load();
        };
      })
      .catch(() => {});

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', load);
      if (status) status.onchange = null;
    };
  }, [isLive]);

  // Live level from the voice engine's analyser
  useEffect(() => {
    if (!isLive) return undefined;
    const buf = new Uint8Array(256);
    let smooth = 0;
    const tick = () => {
      voiceEngine.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      smooth = Math.max(rms * 4, smooth * 0.85);
      setLevel(Math.min(1, smooth));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isLive]);

  const lit = isLive ? Math.round(level * BARS) : 0;
  const badge = isLive
    ? { text: 'Live', cls: 'live' }
    : permission === 'granted'
      ? { text: 'Ready', cls: 'ready' }
      : permission === 'denied'
        ? { text: 'Blocked', cls: 'blocked' }
        : { text: 'Not allowed yet', cls: '' };

  return (
    <section className="card mic-card" data-view="effects">
      <span className="mic-icon">
        <Mic size={24} />
      </span>
      <div className="mic-body">
        <div className="mic-top">
          <strong>Microphone</strong>
          <span className={`mic-badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <label className="mic-select">
          <select
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
            aria-label="Microphone"
          >
            <option value="">Default microphone</option>
            {devices
              .filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
          </select>
          <ChevronDown size={16} />
        </label>
      </div>
      <div className="level-meter" aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} className={i < lit ? (i > BARS * 0.8 ? 'hot' : 'on') : ''} />
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: ShieldCheck, title: 'Private & Secure', text: 'Encrypted peer-to-peer' },
  { icon: Zap, title: 'Real-time Audio', text: 'Low latency' },
  { icon: Users, title: 'No Sign Up', text: 'Just share a code' },
];

export function FeatureStrip() {
  return (
    <section className="card feature-strip" data-view="home">
      {FEATURES.map(({ icon: Icon, title, text }) => (
        <div key={title} className="feature">
          <span className="feature-icon">
            <Icon size={20} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{text}</small>
          </span>
        </div>
      ))}
    </section>
  );
}
