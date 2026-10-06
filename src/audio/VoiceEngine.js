/**
 * VoiceEngine.js
 * Real-time Web Audio API voice processing engine:
 * - DTMF keypad tone generation (dual sine waves)
 * - Microphone stream acquisition & processing
 * - Natural real-time pitch shifting (PSOLA) with formant control via AudioWorklet
 * - Formant shaping and vocal acoustic filters (Kid, Deep Man, Robot, Radio, Normal)
 * - Real-time AnalyserNode for waveform/spectrum visualizer
 * - Local loopback monitor (Hear Myself) with feedback safety
 * - WebRTC-ready MediaStreamDestination for VoIP / outbound calling
 */

// AudioWorklet code as an inline string to avoid bundling/MIME-type complications.
//
// TD-PSOLA pitch shifter with independent formant control:
// - Detects the voice pitch period (YIN on a downsampled copy of the input)
// - Cuts two-period Hann grains centred one pitch period apart
// - Re-spaces the grains at period / pitchRatio, so pitch changes but the
//   vocal tract shape (formants) is kept -> natural voice, no chipmunk effect
// - Formants are moved separately by resampling each grain by formantRatio
//   (e.g. ~1.15 for a female vocal tract, ~0.88 for a large male one)
const PITCH_WORKLET_CODE = `
class PsolaPitchShifter extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;

    this.size = 16384;
    this.mask = this.size - 1;
    this.inBuf = new Float32Array(this.size);
    this.outBuf = new Float32Array(this.size);
    this.inPos = 0;

    this.minRatio = 0.6;
    this.maxRatio = 2.0;
    this.minFormant = 0.8;
    this.maxFormant = 1.4;
    this.pitchRatio = 1.0;
    this.formantRatio = 1.0;

    // Voice pitch search range: 70 Hz - 400 Hz
    this.minPeriod = Math.floor(sr / 400);
    this.maxPeriod = Math.ceil(sr / 70);
    this.lookahead = Math.ceil(this.maxPeriod / this.minFormant + this.maxPeriod / this.minRatio);
    this.latency = this.lookahead + this.maxPeriod + 64;

    this.period = Math.round(sr / 130);
    this.voiced = false;
    this.unvoicedHold = 0;
    this.unvoicedPeriod = Math.round(sr * 0.006);
    this.nextSynth = 0;
    this.analysisMark = 0;

    // Pitch detection runs on a ~12 kHz copy to keep CPU low on phones
    this.ds = Math.max(1, Math.round(sr / 12000));
    this.detWin = Math.round((0.032 * sr) / this.ds);
    this.detMaxLag = Math.ceil(this.maxPeriod / this.ds) + 2;
    this.detMinLag = Math.max(2, Math.floor(this.minPeriod / this.ds));
    this.detBuf = new Float32Array(this.detWin + this.detMaxLag + 2);
    this.detDiff = new Float32Array(this.detMaxLag + 2);
    this.detHop = 512;
    this.sinceDet = 0;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.pitchRatio === 'number') {
        this.pitchRatio = Math.max(this.minRatio, Math.min(this.maxRatio, d.pitchRatio));
      }
      if (typeof d.formantRatio === 'number') {
        this.formantRatio = Math.max(this.minFormant, Math.min(this.maxFormant, d.formantRatio));
      }
    };
  }

  // YIN pitch detector, returns period in samples or 0 when unvoiced/silent
  detectPitch() {
    const ds = this.ds;
    const mask = this.mask;
    const win = this.detWin;
    const maxLag = this.detMaxLag;
    const n = win + maxLag;
    const x = this.detBuf;
    const start = this.inPos - n * ds;

    let energy = 0;
    for (let k = 0; k < n; k++) {
      let acc = 0;
      const base = start + k * ds;
      for (let m = 0; m < ds; m++) acc += this.inBuf[(base + m) & mask];
      acc /= ds;
      x[k] = acc;
      if (k < win) energy += acc * acc;
    }
    if (Math.sqrt(energy / win) < 0.006) return 0;

    const d = this.detDiff;
    let runningSum = 0;
    let bestTau = -1;
    let bestVal = 1e9;
    let firstTau = -1;
    d[0] = 1;
    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      for (let j = 0; j < win; j++) {
        const diff = x[j] - x[j + tau];
        sum += diff * diff;
      }
      runningSum += sum;
      const cm = runningSum > 0 ? (sum * tau) / runningSum : 1;
      d[tau] = cm;
      if (tau >= this.detMinLag) {
        if (cm < bestVal) { bestVal = cm; bestTau = tau; }
        if (firstTau < 0 && cm < 0.15) firstTau = tau;
      }
    }

    let tau = firstTau;
    if (tau > 0) {
      while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
    } else if (bestVal < 0.3) {
      tau = bestTau;
    } else {
      return 0;
    }

    // Parabolic interpolation for sub-sample accuracy
    let refined = tau;
    if (tau > 1 && tau < maxLag) {
      const a = d[tau - 1];
      const b = d[tau];
      const c = d[tau + 1];
      const den = a - 2 * b + c;
      if (Math.abs(den) > 1e-9) refined = tau + (0.5 * (a - c)) / den;
    }
    return refined * ds;
  }

  updatePitch() {
    const p = this.detectPitch();
    if (p >= this.minPeriod && p <= this.maxPeriod) {
      const rel = p / this.period;
      this.period = this.voiced && rel > 0.8 && rel < 1.25 ? this.period * 0.6 + p * 0.4 : p;
      this.voiced = true;
      this.unvoicedHold = 0;
    } else if (++this.unvoicedHold > 2) {
      // Hold the last period briefly so one missed detection does not crackle
      this.voiced = false;
    }
  }

  addGrain(t) {
    const mask = this.mask;
    const a = this.pitchRatio;
    const f = this.formantRatio;
    const T = this.voiced
      ? this.period
      : this.unvoicedPeriod * (0.8 + 0.4 * Math.random()); // jitter avoids buzz on breath / "s"
    const center = this.nextSynth;

    // Analysis marks advance one pitch period at a time and follow synthesis time
    if (this.analysisMark > center || center - this.analysisMark > 3 * T) {
      this.analysisMark = center;
    }
    while (this.analysisMark + T <= center) this.analysisMark += T;

    const halfLen = Math.max(8, Math.floor(T / f));
    const gain = Math.min(1.6, f / a);
    const src = this.analysisMark;
    const dst = Math.round(center);
    const invHalf = Math.PI / (halfLen + 1);

    for (let j = -halfLen; j <= halfLen; j++) {
      const o = dst + j;
      if (o < t) continue; // already played
      const w = 0.5 + 0.5 * Math.cos(j * invHalf);
      const pos = src + j * f;
      const ip = Math.floor(pos);
      const fr = pos - ip;
      const s0 = this.inBuf[ip & mask];
      const s1 = this.inBuf[(ip + 1) & mask];
      this.outBuf[o & mask] += w * (s0 + (s1 - s0) * fr) * gain;
    }

    this.nextSynth += T / a;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outChannel = output[0];
    const inChannel = input && input[0];
    const mask = this.mask;
    const bypass = Math.abs(this.pitchRatio - 1) < 0.003 && Math.abs(this.formantRatio - 1) < 0.003;

    for (let i = 0; i < outChannel.length; i++) {
      this.inBuf[this.inPos & mask] = inChannel ? inChannel[i] : 0;
      this.inPos++;

      if (++this.sinceDet >= this.detHop) {
        this.sinceDet = 0;
        if (!bypass) this.updatePitch();
      }

      const t = this.inPos - this.latency;
      if (t < 0) {
        outChannel[i] = 0;
        continue;
      }

      if (bypass) {
        // Same latency as the shifted path so switching presets does not jump
        outChannel[i] = this.inBuf[t & mask];
        this.outBuf[t & mask] = 0;
        this.nextSynth = t;
        continue;
      }

      if (this.nextSynth < t) this.nextSynth = t;
      while (this.nextSynth <= t + this.lookahead) this.addGrain(t);

      const idx = t & mask;
      outChannel[i] = this.outBuf[idx];
      this.outBuf[idx] = 0;
    }

    for (let ch = 1; ch < output.length; ch++) output[ch].set(outChannel);
    return true;
  }
}

registerProcessor('psola-pitch-shifter', PsolaPitchShifter);
`;

// DTMF Frequencies (Row & Column)
const DTMF_FREQS = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

export class VoiceEngine {
  constructor() {
    this.audioCtx = null;
    this.micStream = null;
    this.micSource = null;
    this.workletNode = null;
    this.isWorkletLoaded = false;

    // Filters and processing nodes
    this.inputGain = null;
    this.highpassFilter = null;
    this.lowpassFilter = null;
    this.peakingFilter = null;
    this.lowShelfFilter = null;
    this.highShelfFilter = null;
    this.shaperNode = null;
    this.compressor = null;
    this.rumbleFilter = null;
    this.outputGain = null;
    this.monitorGain = null;
    this.analyser = null;
    this.mediaStreamDest = null;

    // Current settings
    this.currentPreset = 'normal'; // 'normal' | 'kid' | 'deep' | 'robot' | 'radio'
    this.customPitchSemi = 0; // -12 to +12 semitones
    this.isMonitoring = false; // hear myself loopback
    this.isMuted = false;
    this.isMicActive = false;
    this.isEchoActive = false;

    // Call state audio cues
    this.ringToneOsc1 = null;
    this.ringToneOsc2 = null;
    this.ringInterval = null;
  }

  // Ensure AudioContext is initialized and running (resumes on user interaction)
  async initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      // 'balanced' uses a slightly larger audio buffer than the default 'interactive',
      // which avoids crackles and dropouts on busy phones during calls
      this.audioCtx = new AudioCtxClass({ latencyHint: 'balanced' });

      // Register worklet
      try {
        const blob = new Blob([PITCH_WORKLET_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await this.audioCtx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);
        this.isWorkletLoaded = true;
      } catch (err) {
        console.warn('AudioWorklet registration failed or unsupported, fallback mode', err);
        this.isWorkletLoaded = false;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  // Play standard DTMF Keypad Tone
  async playDtmfTone(char, duration = 0.16) {
    await this.initAudioContext();
    const freqs = DTMF_FREQS[char];
    if (!freqs) return;

    const [f1, f2] = freqs;
    const now = this.audioCtx.currentTime;

    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f1, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(f2, now);

    // Smooth envelope attack and decay to prevent pops
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.015);
    gainNode.gain.setValueAtTime(0.15, now + duration - 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  // Play realistic phone ringing sound (US / international standard 440Hz + 480Hz ring)
  startRingbackTone() {
    this.stopRingbackTone();
    if (!this.audioCtx) return;

    const playBeep = () => {
      if (!this.audioCtx || this.audioCtx.state !== 'running') return;
      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.1);
      gain.gain.setValueAtTime(0.07, now + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);
    };

    playBeep();
    this.ringInterval = setInterval(playBeep, 4000);
  }

  stopRingbackTone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Play call connected chime or hangup tone
  playCallChime(type = 'connect') {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    if (type === 'connect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Busy / hangup tone: 425Hz 3 quick beeps
      for (let i = 0; i < 3; i++) {
        const bOsc = this.audioCtx.createOscillator();
        const bGain = this.audioCtx.createGain();
        const t = now + i * 0.2;
        bOsc.frequency.setValueAtTime(425, t);
        bGain.gain.setValueAtTime(0.08, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        bOsc.connect(bGain);
        bGain.connect(this.audioCtx.destination);
        bOsc.start(t);
        bOsc.stop(t + 0.13);
      }
    }
  }

  // Initialize Microphone & DSP Pipeline
  // Choose which microphone to use ('' = system default). Takes effect on the next start.
  setInputDevice(deviceId) {
    this.inputDeviceId = deviceId || '';
  }

  async startMicrophone() {
    await this.initAudioContext();

    if (this.micStream) {
      return true; // Already running
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          ...(this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : {}),
        },
      });

      this.setupAudioPipeline();
      this.isMicActive = true;
      return true;
    } catch (err) {
      console.error('Microphone access failed:', err);
      this.isMicActive = false;
      throw err;
    }
  }

  // Build the complete processing graph
  setupAudioPipeline() {
    const ctx = this.audioCtx;
    this.micSource = ctx.createMediaStreamSource(this.micStream);

    // 1. Input Gain (for mute / sensitivity)
    this.inputGain = ctx.createGain();
    this.inputGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, ctx.currentTime);

    // 2. Rumble filter ahead of the pitch shifter (keeps pitch detection clean)
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'highpass';
    this.rumbleFilter.frequency.setValueAtTime(70, ctx.currentTime);

    // 3. Highpass Filter (preset low cut, applied after pitch shifting)
    this.highpassFilter = ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.setValueAtTime(80, ctx.currentTime);

    // 3. Low Shelf Filter (chest resonance / bass)
    this.lowShelfFilter = ctx.createBiquadFilter();
    this.lowShelfFilter.type = 'lowshelf';
    this.lowShelfFilter.frequency.setValueAtTime(200, ctx.currentTime);
    this.lowShelfFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 4. Peaking Filter (vocal tract formant boost)
    this.peakingFilter = ctx.createBiquadFilter();
    this.peakingFilter.type = 'peaking';
    this.peakingFilter.frequency.setValueAtTime(1000, ctx.currentTime);
    this.peakingFilter.Q.setValueAtTime(1.5, ctx.currentTime);
    this.peakingFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 5. High Shelf Filter (breathiness / "air")
    this.highShelfFilter = ctx.createBiquadFilter();
    this.highShelfFilter.type = 'highshelf';
    this.highShelfFilter.frequency.setValueAtTime(6500, ctx.currentTime);
    this.highShelfFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 6. Lowpass Filter (top end acoustic dampening)
    this.lowpassFilter = ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.setValueAtTime(12000, ctx.currentTime);

    // 6. Waveshaper for subtle radio / saturation
    this.shaperNode = ctx.createWaveShaper();
    this.shaperNode.curve = this.makeLinearCurve();
    this.shaperNode.oversample = '2x';

    // 7. Pitch Shifter Worklet (if loaded)
    if (this.isWorkletLoaded) {
      this.workletNode = new AudioWorkletNode(ctx, 'psola-pitch-shifter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
    }

    // 9. Dynamics Compressor (levels voice and prevents harsh peaks)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-20, ctx.currentTime);
    this.compressor.knee.setValueAtTime(10, ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    this.compressor.release.setValueAtTime(0.05, ctx.currentTime);

    // 10. Output Gain
    this.outputGain = ctx.createGain();
    this.outputGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 11. Analyser Node (for real-time visualizer)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    // 12. Local Monitor Gain (Hear Myself Loopback)
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.setValueAtTime(this.getMonitorLevel(), ctx.currentTime);

    // 13. WebRTC / Call Destination Node (can be piped to WebRTC PeerConnection)
    this.mediaStreamDest = ctx.createMediaStreamDestination();

    // CONNECT THE CHAIN:
    // micSource -> inputGain -> rumble -> (pitch worklet) -> highpass -> lowShelf -> peaking
    //   -> highShelf -> lowpass -> shaper -> compressor -> outputGain
    // EQ runs after the pitch shift so it shapes the final voice, not the original one.
    this.micSource.connect(this.inputGain);
    this.inputGain.connect(this.rumbleFilter);

    if (this.workletNode) {
      this.rumbleFilter.connect(this.workletNode);
      this.workletNode.connect(this.highpassFilter);
    } else {
      this.rumbleFilter.connect(this.highpassFilter);
    }

    this.highpassFilter.connect(this.lowShelfFilter);
    this.lowShelfFilter.connect(this.peakingFilter);
    this.peakingFilter.connect(this.highShelfFilter);
    this.highShelfFilter.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.shaperNode);
    this.shaperNode.connect(this.compressor);
    this.compressor.connect(this.outputGain);

    // Split output to:
    // - Analyser
    this.outputGain.connect(this.analyser);
    // - Outbound call stream destination (WebRTC / VoIP)
    this.outputGain.connect(this.mediaStreamDest);
    // - Monitor headphones (Hear Myself)
    this.outputGain.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);

    // Apply the active preset settings
    this.applyPreset(this.currentPreset, this.customPitchSemi);
  }

  // Waveshaper distortion curve generator
  makeDistortionCurve(amount = 20) {
    const k = amount;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  makeLinearCurve() {
    const curve = new Float32Array(2);
    curve[0] = -1;
    curve[1] = 1;
    return curve;
  }

  // Semitones to frequency ratio
  semitonesToRatio(semitones) {
    return Math.pow(2, semitones / 12);
  }

  // Set Voice Preset Effect
  applyPreset(presetKey, customOffset = 0) {
    this.currentPreset = presetKey;
    this.customPitchSemi = customOffset;

    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    let targetPitchSemi = customOffset;
    let formantRatio = 1.0;
    let airGain = 0;
    let hpFreq = 80;
    let lpFreq = 12000;
    let peakFreq = 1000;
    let peakGain = 0;
    let peakQ = 1.0;
    let shelfFreq = 200;
    let shelfGain = 0;
    let distortionAmount = 0;
    let outGainVal = 1.0;

    switch (presetKey) {
      case 'girl':
        // Girl / Female Voice: an adult male voice (~110-130 Hz) moved +7 semitones
        // lands in the female range (~165-195 Hz). Formants rise ~15% because a female
        // vocal tract is shorter - pitch alone sounds like a sped-up man, formants
        // alone sound like a small man; both together sound like a real woman.
        targetPitchSemi = 7 + customOffset;
        formantRatio = 1.15;
        hpFreq = 120; // thin out male chest weight
        lpFreq = 12000;
        peakFreq = 3000; // gentle presence, avoids nasal "machine" peak
        peakGain = 2.0;
        peakQ = 0.9;
        shelfFreq = 250;
        shelfGain = -3.0;
        airGain = 3.5; // breathy top end typical of female voices
        outGainVal = 1.05;
        break;

      case 'kid':
        // Kid Voice: high pitch with a much smaller vocal tract
        targetPitchSemi = 9 + customOffset;
        formantRatio = 1.28;
        hpFreq = 180;
        lpFreq = 10000;
        peakFreq = 3200; // child vocal tract acoustic resonance
        peakGain = 3.0;
        peakQ = 1.0;
        shelfFreq = 220;
        shelfGain = -5.0;
        airGain = 2.0;
        outGainVal = 1.1;
        break;

      case 'deep':
        // Deep Voice / Big Man: lower pitch and a longer vocal tract
        targetPitchSemi = -5 + customOffset;
        formantRatio = 0.88;
        hpFreq = 50;
        lpFreq = 7000;
        peakFreq = 2500;
        peakGain = -2.5; // soften nasal frequencies
        peakQ = 1.0;
        shelfFreq = 160;
        shelfGain = 4.0; // chest resonance
        airGain = -2.0;
        outGainVal = 1.15;
        break;

      case 'robot':
        // Cyber / Robot: slight pitch shift + sharp metallic bandpass resonance
        targetPitchSemi = 0 + customOffset;
        hpFreq = 300;
        lpFreq = 4500;
        peakFreq = 850;
        peakGain = 9.0;
        peakQ = 4.0; // high resonance
        distortionAmount = 15;
        outGainVal = 1.0;
        break;

      case 'radio':
        // Telecom / Walkie-Talkie: bandpass 350Hz - 3400Hz (standard PSTN bandwidth) + analog crunch
        targetPitchSemi = 0 + customOffset;
        hpFreq = 380;
        lpFreq = 3200;
        peakFreq = 1600;
        peakGain = 4.0;
        peakQ = 1.5;
        distortionAmount = 30;
        shelfFreq = 400;
        shelfGain = -10.0;
        outGainVal = 1.25;
        break;

      case 'normal':
      default:
        // Normal bypass: clean mic response
        targetPitchSemi = 0 + customOffset;
        hpFreq = 70;
        lpFreq = 14000;
        peakFreq = 1200;
        peakGain = 0;
        shelfGain = 0;
        distortionAmount = 0;
        outGainVal = 1.0;
        break;
    }

    // Apply pitch & formant shift to AudioWorklet
    const pitchRatio = this.semitonesToRatio(targetPitchSemi);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ pitchRatio, formantRatio });
    }

    // Apply Filter Parameters with smooth transitions
    if (this.highpassFilter) {
      this.highpassFilter.frequency.setTargetAtTime(hpFreq, now, 0.05);
    }
    if (this.lowpassFilter) {
      this.lowpassFilter.frequency.setTargetAtTime(lpFreq, now, 0.05);
    }
    if (this.peakingFilter) {
      this.peakingFilter.frequency.setTargetAtTime(peakFreq, now, 0.05);
      this.peakingFilter.gain.setTargetAtTime(peakGain, now, 0.05);
      this.peakingFilter.Q.setTargetAtTime(peakQ, now, 0.05);
    }
    if (this.lowShelfFilter) {
      this.lowShelfFilter.frequency.setTargetAtTime(shelfFreq, now, 0.05);
      this.lowShelfFilter.gain.setTargetAtTime(shelfGain, now, 0.05);
    }
    if (this.highShelfFilter) {
      this.highShelfFilter.gain.setTargetAtTime(airGain, now, 0.05);
    }
    if (this.shaperNode) {
      if (distortionAmount > 0) {
        this.shaperNode.curve = this.makeDistortionCurve(distortionAmount);
      } else {
        this.shaperNode.curve = this.makeLinearCurve();
      }
    }
    if (this.outputGain) {
      this.outputGain.gain.setTargetAtTime(outGainVal, now, 0.05);
    }
  }

  // Live monitor is silenced during the echo test, otherwise every word is heard twice
  getMonitorLevel() {
    return this.isMonitoring && !this.isEchoActive ? 0.8 : 0.0;
  }

  updateMonitorGain() {
    if (this.monitorGain && this.audioCtx) {
      this.monitorGain.gain.setTargetAtTime(this.getMonitorLevel(), this.audioCtx.currentTime, 0.03);
    }
  }

  // Toggle Hear Myself / Local Monitor
  setMonitoring(enabled) {
    this.isMonitoring = enabled;
    this.updateMonitorGain();
  }

  // Toggle Mute
  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.inputGain && this.audioCtx) {
      this.inputGain.gain.setTargetAtTime(isMuted ? 0.0 : 1.0, this.audioCtx.currentTime, 0.02);
    }
  }

  // Interactive Echo Voice Test Service
  startEchoTest() {
    this.stopEchoTest();
    if (!this.audioCtx || !this.outputGain) return;

    // Automated operator welcome prompt
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          'Echo service connected. Speak now to hear your morphed voice as the receiver hears it.'
        );
        utter.rate = 1.05;
        utter.pitch = 1.0;
        window.speechSynthesis.speak(utter);
      } catch (e) {
        console.warn('Speech synthesis error', e);
      }
    }

    this.isEchoActive = true;
    this.updateMonitorGain();

    // Connect a 1.3-second delay line from outputGain back to destination,
    // band-limited to a real phone line (300-3400 Hz) so it sounds like the receiver hears it
    const ctx = this.audioCtx;
    const delayNode = ctx.createDelay(4.0);
    delayNode.delayTime.setValueAtTime(1.3, ctx.currentTime);

    const lineHighpass = ctx.createBiquadFilter();
    lineHighpass.type = 'highpass';
    lineHighpass.frequency.setValueAtTime(300, ctx.currentTime);

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'lowpass';
    bpFilter.frequency.setValueAtTime(3400, ctx.currentTime);

    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.85, ctx.currentTime);

    this.outputGain.connect(delayNode);
    delayNode.connect(lineHighpass);
    lineHighpass.connect(bpFilter);
    bpFilter.connect(echoGain);
    echoGain.connect(ctx.destination);

    this.echoNodes = { delayNode, lineHighpass, bpFilter, echoGain };
  }

  stopEchoTest() {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (this.echoNodes && this.outputGain) {
      try {
        this.outputGain.disconnect(this.echoNodes.delayNode);
        this.echoNodes.delayNode.disconnect();
        this.echoNodes.lineHighpass.disconnect();
        this.echoNodes.bpFilter.disconnect();
        this.echoNodes.echoGain.disconnect();
      } catch {
        // ignore
      }
      this.echoNodes = null;
    }
    if (this.isEchoActive) {
      this.isEchoActive = false;
      this.updateMonitorGain();
    }
  }

  // Stop mic and release hardware
  stopMicrophone() {
    this.stopRingbackTone();
    this.stopEchoTest();
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.teardownAudioPipeline();
    this.isMicActive = false;
  }

  // Disconnect the processing graph. Without this every call left a pitch worklet
  // running in the background, and CPU load built up until audio started dropping out.
  teardownAudioPipeline() {
    const nodes = [
      this.micSource,
      this.inputGain,
      this.rumbleFilter,
      this.workletNode,
      this.highpassFilter,
      this.lowShelfFilter,
      this.peakingFilter,
      this.highShelfFilter,
      this.lowpassFilter,
      this.shaperNode,
      this.compressor,
      this.outputGain,
      this.analyser,
      this.monitorGain,
    ];
    nodes.forEach((node) => {
      if (node) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
    });
    if (this.workletNode) {
      this.workletNode.port.close();
    }
    this.micSource = null;
    this.inputGain = null;
    this.rumbleFilter = null;
    this.workletNode = null;
    this.highpassFilter = null;
    this.lowShelfFilter = null;
    this.peakingFilter = null;
    this.highShelfFilter = null;
    this.lowpassFilter = null;
    this.shaperNode = null;
    this.compressor = null;
    this.outputGain = null;
    this.analyser = null;
    this.monitorGain = null;
    this.mediaStreamDest = null;
  }

  // Get current processed MediaStream (ready for WebRTC peer connection)
  getOutboundStream() {
    return this.mediaStreamDest ? this.mediaStreamDest.stream : null;
  }

  // Get visualizer time-domain or frequency data
  getByteTimeDomainData(array) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array);
    }
  }

  getByteFrequencyData(array) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array);
    }
  }
}

// Singleton instance export for easy app-wide sharing
export const voiceEngine = new VoiceEngine();
