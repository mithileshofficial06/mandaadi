// Synthesised sound (Web Audio): no files, nothing to license.
// Continuous layers: wind (rises with apparent wind), water hiss (rises with speed), sail flap
// (when head to wind). One-shots: tack snap, mark bell, start horn and pips, island thud.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

type Layers = {
  windGain: GainNode;
  windFilter: BiquadFilterNode;
  waterGain: GainNode;
  waterFilter: BiquadFilterNode;
  flapGain: GainNode;
  flapLfo: OscillatorNode;
};
let layers: Layers | null = null;

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  // pinkish noise (Paul Kellet's economy filter)
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
  }
  noiseBuf = b;
  return b;
}

function loopNoise(c: AudioContext): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  s.loopStart = Math.random();
  s.start(0, Math.random() * 1.5);
  return s;
}

export const sfx = {
  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp).connect(ctx.destination);
        buildLayers(ctx, master);
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* audio is optional */
    }
  },
  setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  },
  get muted(): boolean {
    return muted;
  },
  /** speed01: boat speed share; wind01: apparent wind; luff: 0..1 head to wind. */
  setMotion(speed01: number, wind01: number, luff: number): void {
    if (!ctx || !layers) return;
    const t = ctx.currentTime;
    layers.windGain.gain.setTargetAtTime(0.05 + 0.2 * wind01, t, 0.25);
    layers.windFilter.frequency.setTargetAtTime(380 + 900 * wind01, t, 0.3);
    layers.waterGain.gain.setTargetAtTime(0.02 + 0.32 * speed01 * speed01, t, 0.15);
    layers.waterFilter.frequency.setTargetAtTime(900 + 2200 * speed01, t, 0.2);
    layers.flapGain.gain.setTargetAtTime(0.32 * luff, t, 0.08);
  },
  stopMotion(): void {
    if (!ctx || !layers) return;
    const t = ctx.currentTime;
    layers.windGain.gain.setTargetAtTime(0.05, t, 0.6);
    layers.waterGain.gain.setTargetAtTime(0.01, t, 0.6);
    layers.flapGain.gain.setTargetAtTime(0, t, 0.1);
  },
  tack(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    // the sail snapping across: a noise crack and a low canvas thump
    burst(ctx, master, t, 0.12, 1400, 2.5, 0.5);
    burst(ctx, master, t + 0.05, 0.25, 320, 1.2, 0.35);
    thump(ctx, master, t + 0.04, 85, 0.35);
  },
  bell(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    bellStrike(ctx, master, t, 0.32);
    bellStrike(ctx, master, t + 0.42, 0.22);
  },
  pip(): void {
    if (!ctx || !master) return;
    horn(ctx, master, ctx.currentTime, 0.16, 0.22);
  },
  gun(): void {
    if (!ctx || !master) return;
    horn(ctx, master, ctx.currentTime, 0.9, 0.38);
  },
  finish(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    horn(ctx, master, t, 0.5, 0.32);
    horn(ctx, master, t + 0.7, 0.9, 0.32);
  },
  hit(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    thump(ctx, master, t, 60, 0.6);
    burst(ctx, master, t, 0.45, 500, 0.7, 0.3);
  },
  gust(): void {
    if (!ctx || !master) return;
    burst(ctx, master, ctx.currentTime, 1.4, 700, 0.6, 0.12, 0.5);
  },
};

function buildLayers(c: AudioContext, out: AudioNode): void {
  const wind = loopNoise(c);
  const windFilter = c.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.Q.value = 0.7;
  windFilter.frequency.value = 500;
  const windGain = c.createGain();
  windGain.gain.value = 0.05;
  // slow gusting modulation of the wind layer
  const gustLfo = c.createOscillator();
  gustLfo.frequency.value = 0.17;
  const gustDepth = c.createGain();
  gustDepth.gain.value = 0.03;
  gustLfo.connect(gustDepth).connect(windGain.gain);
  gustLfo.start();
  wind.connect(windFilter).connect(windGain).connect(out);

  const water = loopNoise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 700;
  const waterFilter = c.createBiquadFilter();
  waterFilter.type = 'lowpass';
  waterFilter.frequency.value = 1500;
  const waterGain = c.createGain();
  waterGain.gain.value = 0.02;
  // lapping: slow amplitude wobble
  const lap = c.createOscillator();
  lap.frequency.value = 0.9;
  const lapDepth = c.createGain();
  lapDepth.gain.value = 0.012;
  lap.connect(lapDepth).connect(waterGain.gain);
  lap.start();
  water.connect(hp).connect(waterFilter).connect(waterGain).connect(out);

  const flap = loopNoise(c);
  const flapFilter = c.createBiquadFilter();
  flapFilter.type = 'bandpass';
  flapFilter.frequency.value = 900;
  flapFilter.Q.value = 0.9;
  const flapAm = c.createGain();
  flapAm.gain.value = 0;
  const flapLfo = c.createOscillator();
  flapLfo.type = 'square';
  flapLfo.frequency.value = 7.5;
  const flapLfoGain = c.createGain();
  flapLfoGain.gain.value = 0.5;
  flapLfo.connect(flapLfoGain).connect(flapAm.gain);
  flapLfo.start();
  const flapGain = c.createGain();
  flapGain.gain.value = 0;
  flap.connect(flapFilter).connect(flapAm).connect(flapGain).connect(out);

  layers = { windGain, windFilter, waterGain, waterFilter, flapGain, flapLfo };
}

function burst(c: AudioContext, out: AudioNode, t: number, dur: number, freq: number, q: number, vol: number, attack = 0.005): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

function thump(c: AudioContext, out: AudioNode, t: number, freq: number, vol: number): void {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(freq * 1.8, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.35);
}

function bellStrike(c: AudioContext, out: AudioNode, t: number, vol: number): void {
  const car = c.createOscillator();
  car.frequency.value = 1180;
  const mod = c.createOscillator();
  mod.frequency.value = 1180 * 1.4;
  const modGain = c.createGain();
  modGain.gain.setValueAtTime(900, t);
  modGain.gain.exponentialRampToValueAtTime(20, t + 1.8);
  mod.connect(modGain).connect(car.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0006, t + 2.4);
  car.connect(g).connect(out);
  car.start(t);
  mod.start(t);
  car.stop(t + 2.5);
  mod.stop(t + 2.5);
}

function horn(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number): void {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1100;
  f.Q.value = 2;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol, t + dur - 0.06);
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const fr of [233, 236.5, 466]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = fr;
    const og = c.createGain();
    og.gain.value = fr > 400 ? 0.25 : 0.5;
    o.connect(og).connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  f.connect(g).connect(out);
}
