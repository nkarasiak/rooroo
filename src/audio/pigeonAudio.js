export class PigeonAudio {
  constructor() {
    this._ctx = null;
    this._ready = false;
    this._lastCoo = 0;
  }

  // Must be called from a user gesture
  init() {
    if (this._ready) return;
    this._ready = true;
    this._ctx = new AudioContext();
    this._startAmbient();
  }

  _startAmbient() {
    const ctx = this._ctx;

    // Low city hum
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.value = 58;
    humGain.gain.value = 0.025;
    hum.connect(humGain);
    humGain.connect(ctx.destination);
    hum.start();

    // Second harmonic texture
    const hum2 = ctx.createOscillator();
    const hum2Gain = ctx.createGain();
    hum2.type = 'triangle';
    hum2.frequency.value = 116;
    hum2Gain.gain.value = 0.008;
    hum2.connect(hum2Gain);
    hum2Gain.connect(ctx.destination);
    hum2.start();

    // Distant traffic rumble (filtered noise)
    this._noiseLoop();
  }

  _noiseLoop() {
    const ctx = this._ctx;
    const interval = 4 + Math.random() * 8;
    setTimeout(() => {
      if (!this._ready) return;
      const bufLen = ctx.sampleRate * 1.2;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        const fade = Math.min(i / (bufLen * 0.1), 1) * Math.min((bufLen - i) / (bufLen * 0.3), 1);
        d[i] = (Math.random() * 2 - 1) * fade * 0.04;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 180 + Math.random() * 80;
      const gain = ctx.createGain();
      gain.gain.value = 0.4 + Math.random() * 0.4;
      src.connect(filt);
      filt.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      this._noiseLoop();
    }, interval * 1000);
  }

  flap() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const bufLen = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 500;
    filt.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);

    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  coo() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // Throttle — pigeons don't coo every frame
    if (now - this._lastCoo < 3) return;
    this._lastCoo = now;

    // "Coo" = two-note sweep: high → low → mid
    const notes = [
      { freq: 380, dur: 0.18, delay: 0 },
      { freq: 290, dur: 0.28, delay: 0.2 },
      { freq: 340, dur: 0.22, delay: 0.52 },
    ];
    for (const { freq, dur, delay } of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.linearRampToValueAtTime(freq * 0.88, now + delay + dur);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.06, now + delay + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    }
  }

  peck() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  land() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const bufLen = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }
}
