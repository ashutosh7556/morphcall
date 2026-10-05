import React, { useEffect, useRef } from 'react';
import { voiceEngine } from '../audio/VoiceEngine';

// Color schemes based on selected voice effect
const THEME_COLORS = {
  girl: { primary: '#ec4899', secondary: '#f472b6', glow: 'rgba(236, 72, 153, 0.45)' },
  kid: { primary: '#f59e0b', secondary: '#fbbf24', glow: 'rgba(245, 158, 11, 0.45)' },
  deep: { primary: '#6366f1', secondary: '#818cf8', glow: 'rgba(99, 102, 241, 0.45)' },
  robot: { primary: '#06b6d4', secondary: '#22d3ee', glow: 'rgba(6, 182, 212, 0.45)' },
  radio: { primary: '#f97316', secondary: '#fb923c', glow: 'rgba(249, 115, 22, 0.45)' },
  normal: { primary: '#10b981', secondary: '#34d399', glow: 'rgba(16, 185, 129, 0.45)' },
};

/**
 * AudioVisualizer
 * High-performance canvas audio visualizer displaying real-time waveform,
 * spectral frequency bars, and volume glow corresponding to the transformed voice.
 */
export default function AudioVisualizer({
  isActive = false,
  preset = 'normal',
  isMuted = false,
  height = 90,
}) {
  const canvasRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const theme = THEME_COLORS[preset] || THEME_COLORS.normal;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Re-measure on resize/rotation and when a hidden mobile tab becomes visible
    let width = 320;
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const measured = canvas.clientWidth;
      if (!measured) return;
      width = measured;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);

    const bufferLength = 256;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    let idleAngle = 0;

    const render = () => {
      const h = height;

      ctx.clearRect(0, 0, width, h);

      if (isActive && !isMuted) {
        voiceEngine.getByteTimeDomainData(timeData);
        voiceEngine.getByteFrequencyData(freqData);

        // Draw frequency bars in the background
        const numBars = 36;
        const barWidth = width / numBars - 2;
        ctx.fillStyle = theme.glow;

        for (let i = 0; i < numBars; i++) {
          const freqVal = freqData[Math.floor((i / numBars) * 64)] || 0;
          const barHeight = (freqVal / 255) * (h * 0.7);
          const x = i * (barWidth + 2);
          const y = h - barHeight;

          ctx.fillRect(x, y, barWidth, barHeight);
        }

        // Draw smooth waveform line in front
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = theme.primary;
        ctx.shadowColor = theme.secondary;
        ctx.shadowBlur = 10;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0; // 0.0 to 2.0
          const yPos = (v * h) / 2;

          if (i === 0) {
            ctx.moveTo(x, yPos);
          } else {
            ctx.lineTo(x, yPos);
          }

          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      } else {
        // Idle ambient sine wave
        idleAngle += 0.04;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isMuted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();

        for (let x = 0; x < width; x += 4) {
          const amp = isMuted ? 2 : 4;
          const y = h / 2 + Math.sin(x * 0.03 + idleAngle) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isActive, isMuted, height, theme]);

  return (
    <div className="visualizer-wrapper">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  );
}
