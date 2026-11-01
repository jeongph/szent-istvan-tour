// Web Audio로 합성하는 오르간 화음과 긴 잔향
const CHORDS = [
  [38, 50, 53, 57, 62], // Dm
  [34, 50, 53, 58, 62], // B♭
  [41, 48, 53, 57, 60], // F
  [36, 48, 52, 55, 60], // C
  [43, 50, 55, 58, 62], // Gm
  [38, 50, 53, 57, 62], // Dm
  [45, 49, 52, 57, 61], // A
  [38, 50, 53, 57, 62], // Dm
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class OrganAmbience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.voices = [];
    this.step = 0;
    this.timer = null;
  }

  _init() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 6.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    const dry = ctx.createGain();
    dry.gain.value = 0.3;
    this.bus = ctx.createBiquadFilter();
    this.bus.type = 'lowpass';
    this.bus.frequency.value = 2400;
    this.bus.connect(dry).connect(this.master);
    this.bus.connect(this.verb).connect(wet).connect(this.master);
  }

  _voice(m, t) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(m < 46 ? 0.11 : 0.05, t + 2.4);
    g.connect(this.bus);
    const oscs = [[1, 'sine', 1], [2, 'triangle', 0.35], [3, 'sine', 0.16], [4, 'sine', 0.08]].map(([mul, type, amp]) => {
      const o = ctx.createOscillator(), a = ctx.createGain();
      o.type = type;
      o.frequency.value = hz(m) * mul;
      o.detune.value = (Math.random() - 0.5) * 6;
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      return o;
    });
    return { g, oscs };
  }

  _next() {
    const t = this.ctx.currentTime + 0.05;
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + 3.2);
      v.oscs.forEach((o) => o.stop(t + 3.4));
    }
    this.voices = CHORDS[this.step % CHORDS.length].map((m) => this._voice(m, t));
    this.step++;
  }

  start() {
    if (!this.ctx) this._init();
    this.ctx.resume();
    this.on = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.55, t + 2);
    if (!this.timer) {
      this._next();
      this.timer = setInterval(() => this._next(), 7000);
    }
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => {
      if (this.on) return;
      clearInterval(this.timer);
      this.timer = null;
      for (const v of this.voices) v.oscs.forEach((o) => o.stop());
      this.voices = [];
    }, 1700);
  }
}
