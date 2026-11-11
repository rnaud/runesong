// Procedural music engine: a step sequencer on the Web Audio clock.
// Layers stack with `intensity` (0..4). The lead line is either a synth
// (Instrumental) or a pre-rendered Chimera vocal stem (Choir mode).
import { VOCAL_LEAD_IN, vocalUrl } from './songs.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const STEPS_PER_CYCLE = 128; // 8 bars of 16ths

const TIMBRE = {
  hollow: { arp: 'triangle', pad: 1100, lead: 'triangle', half: false },
  sanctum: { arp: 'sine', pad: 800, lead: 'sine', half: true },
  citadel: { arp: 'sawtooth', pad: 700, lead: 'square', half: false },
  spire: { arp: 'square', pad: 1500, lead: 'triangle', half: false },
};

export class Music {
  constructor() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);

    // music bus (fades between levels) and fx bus (hits, always audible)
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.fx = ctx.createGain();
    this.fx.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.delay = ctx.createDelay(1.5);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.frequency.value = 2600;
    this.delay.connect(dlp).connect(this.delayFb).connect(this.delay);
    const dwet = ctx.createGain();
    dwet.gain.value = 0.35;
    dlp.connect(dwet).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.vocals = new Map();
    this.level = null;
    this.intensity = 0;
    this.choir = false;
    this.running = false;
    this.t0 = 0;
    this.step = 0.125;
    this.spb = 0.5;
    this.kickTime = -10;
  }

  impulse(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return buf;
  }

  async loadVocals(level) {
    if (this.vocals.has(level.id)) return true;
    try {
      const bufs = await Promise.all(
        level.verses.map(async (_, i) => {
          const r = await fetch(vocalUrl(level, i));
          if (!r.ok) throw new Error(r.status);
          return this.ctx.decodeAudioData(await r.arrayBuffer());
        }),
      );
      this.vocals.set(level.id, bufs);
      return true;
    } catch (e) {
      console.warn('vocal stems unavailable', e);
      return false;
    }
  }

  start(level, choir) {
    this.stop(0.05);
    const ctx = this.ctx;
    this.level = level;
    this.tim = TIMBRE[level.id];
    this.choir = choir;
    this.spb = 60 / level.bpm;
    this.step = this.spb / 4;
    this.delay.delayTime.value = this.spb * 0.75;
    this.t0 = ctx.currentTime + 0.25;
    this.next = 0;
    this.verse = 0;
    this.intensity = 1;
    this.running = true;
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  stop(fade = 1.2) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    const bus = this.bus;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => bus.disconnect(), fade * 1000 + 200);
  }

  beats() {
    return (this.ctx.currentTime - this.t0) / this.spb;
  }
  // 1 right on a kick, decaying to 0
  pulse() {
    return Math.exp(-Math.max(0, this.ctx.currentTime - this.kickTime) * 7);
  }
  // next 16th-note grid time at least `min` seconds away
  grid(min = 0.1) {
    const t = this.ctx.currentTime + min;
    return this.t0 + Math.ceil((t - this.t0) / this.step) * this.step;
  }

  pump() {
    if (!this.running) return;
    const horizon = this.ctx.currentTime + 0.15;
    while (this.t0 + this.next * this.step < horizon) {
      this.schedule(this.next, this.t0 + this.next * this.step);
      this.next++;
    }
  }

  schedule(n, t) {
    const L = this.level, I = this.intensity, tim = this.tim;
    const s = n % STEPS_PER_CYCLE, bar = s >> 4, st = s & 15;
    const [root, q] = L.chords[bar];
    const third = q === 'm' ? 3 : 4;
    const tones = [0, 7, 12, 12 + third, 19, 24, 24 + third, 19];

    if (st === 0) this.pad(root, third, t, this.spb * 4);
    if (s === 0 && I >= 1) this.lead(t);

    if (I >= 1) {
      const kick = tim.half ? st === 0 || st === 10 : st % 4 === 0 || (L.id === 'citadel' && st === 14 && I >= 3);
      if (kick) this.kick(t);
      if (st % 2 === 0) this.bass(root + (st % 8 === 6 ? 12 : 0) + (st === 12 && I >= 3 ? 7 : 0), t);
    }
    if (I >= 2) {
      if (tim.half ? st === 8 : st === 4 || st === 12) this.snare(t);
      if (st % 4 === 2) this.hat(t, 0.22);
      else if (I >= 4 && st % 2 === 1) this.hat(t, 0.08);
    }
    if (I >= 3 || (I <= 1 && st % 4 === 0)) {
      const m = root + 24 + tones[(st + bar * 3) % tones.length];
      this.pluck(m, t, I >= 3 ? 0.11 : 0.06, tim.arp, this.bus);
    }
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    this.env(g, t, 0.003, 0.95, 0.32);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
    const dt = (t - ctx.currentTime) * 1000;
    setTimeout(() => (this.kickTime = t), Math.max(0, dt));
  }

  noiseHit(t, type, freq, peak, dec, send = 0) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    this.env(g, t, 0.002, peak, dec);
    src.connect(f).connect(g).connect(this.bus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dec + 0.05);
  }
  snare(t) {
    this.noiseHit(t, 'bandpass', 1900, 0.5, 0.16, 0.3);
  }
  hat(t, v) {
    this.noiseHit(t, 'highpass', 7500, v, 0.045);
  }

  bass(m, t) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.value = mtof(m);
    o2.frequency.value = mtof(m - 12);
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + this.step * 1.7);
    this.env(g, t, 0.005, 0.26, this.step * 1.8);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.bus);
    o.start(t); o2.start(t);
    o.stop(t + this.step * 2); o2.stop(t + this.step * 2);
  }

  pad(root, third, t, dur) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(this.tim.pad * 0.6, t);
    f.frequency.linearRampToValueAtTime(this.tim.pad * (1 + this.intensity * 0.25), t + dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.5);
    g.gain.setValueAtTime(0.085, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    f.connect(g);
    g.connect(this.bus);
    g.connect(this.reverb);
    for (const iv of [12, 12 + third, 19, 24]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(root + iv);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1);
      }
    }
  }

  pluck(m, t, vol, wave, out, send = 0.5) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), s = ctx.createGain();
    o.type = wave;
    o.frequency.value = mtof(m);
    this.env(g, t, 0.004, vol, 0.28);
    s.gain.value = send;
    o.connect(g).connect(out);
    g.connect(s);
    s.connect(this.delay);
    s.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.4);
  }

  // one 8-bar verse: sung stem in Choir mode, otherwise a breathy synth lead
  lead(t) {
    const ctx = this.ctx, L = this.level;
    const v = this.verse++ % L.verses.length;
    const stems = this.choir && this.vocals.get(L.id);
    if (stems) {
      const src = ctx.createBufferSource(), g = ctx.createGain(), s = ctx.createGain(), hp = ctx.createBiquadFilter();
      src.buffer = stems[v];
      hp.type = 'highpass';
      hp.frequency.value = 120;
      g.gain.value = 1.25;
      s.gain.value = 0.4;
      src.connect(hp).connect(g).connect(this.bus);
      g.connect(s);
      s.connect(this.reverb);
      s.connect(this.delay);
      const at = t - VOCAL_LEAD_IN;
      if (at >= ctx.currentTime) src.start(at);
      else src.start(ctx.currentTime, ctx.currentTime - at);
      return;
    }
    let when = t;
    for (const [m, beats] of L.verses[v].notes) {
      const dur = beats * this.spb;
      if (m) this.flute(m + 12, when, dur * 0.92);
      when += dur;
    }
  }

  flute(m, t, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator();
    const g = ctx.createGain(), s = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = this.tim.lead;
    o2.type = 'sine';
    o.frequency.value = mtof(m);
    o2.frequency.value = mtof(m) * 2;
    lfo.frequency.value = 5.2;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + Math.min(0.35, dur));
    lfo.connect(lg);
    lg.connect(o.frequency);
    const vol = this.tim.lead === 'square' ? 0.07 : 0.13;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.06, dur - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.bus);
    s.gain.value = 0.5;
    g.connect(s);
    s.connect(this.reverb);
    s.connect(this.delay);
    for (const n of [o, o2, lfo]) {
      n.start(t);
      n.stop(t + dur + 0.15);
    }
  }

  // ---- gameplay sounds (quantised by the caller with grid()) ----
  hitAt(t, i, kill) {
    const sc = this.level.scale;
    const m = sc[Math.min(sc.length - 1, i + 2)];
    this.pluck(m, t, 0.2, 'triangle', this.fx, 0.7);
    this.pluck(m + 12, t, 0.06, 'sine', this.fx, 0.7);
    if (kill) {
      const bus = this.bus;
      this.bus = this.fx;
      this.noiseHit(t, 'highpass', 5000, 0.16, 0.18, 0.5);
      this.bus = bus;
    }
  }
  lockTick(i) {
    const sc = this.level.scale;
    this.pluck(sc[Math.min(sc.length - 1, i)] + 12, this.ctx.currentTime, 0.07, 'sine', this.fx, 0.3);
  }
  thud() {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    this.env(g, t, 0.005, 0.5, 0.45);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + 0.5);
  }
  chime(up = true) {
    const sc = this.level.scale, t = this.grid(0.02);
    [0, 2, 4, 7].forEach((k, i) => this.pluck(sc[up ? k : 7 - k] + 12, t + i * this.step, 0.14, 'triangle', this.fx, 0.8));
  }
  finale() {
    const L = this.level, t = this.grid(0.05);
    this.stop(2.5);
    const [root] = L.chords[0];
    const bus = this.bus;
    this.bus = this.fx;
    this.pad(root, L.chords[0][1] === 'm' ? 3 : 4, t, 5);
    this.noiseHit(t, 'lowpass', 400, 0.7, 1.6, 0.8);
    this.bus = bus;
    L.scale.slice(0, 10).forEach((m, i) => this.pluck(m + 12, t + i * this.step, 0.13, 'triangle', this.fx, 0.9));
  }
}
