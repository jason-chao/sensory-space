import type { Sim } from "../core/sim";
import { mulberry32, subSeed, type Rand } from "../core/prng";
import { SCALES, VOICES } from "./voicelist";

/** Everything a voice needs from the engine. */
export interface VoiceCtx {
  ctx: AudioContext;
  out: GainNode;
  rand: Rand;
  noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  /** frequency of a scale degree; degree may exceed the scale length (wraps by octave) */
  freq(degree: number, octave: number): number;
  sim: Sim;
}

export interface Voice {
  /** called about 20 times a second while the voice is audible */
  update(now: number): void;
  stop(): void;
}

type VoiceFactory = (v: VoiceCtx) => Voice;

function noiseBuffers(ctx: AudioContext, rand: Rand) {
  const len = ctx.sampleRate * 8;
  const make = (kind: "white" | "pink" | "brown") => {
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = rand() * 2 - 1;
        if (kind === "white") d[i] = w * 0.5;
        else if (kind === "pink") {
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
        } else {
          last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2;
        }
      }
      // blend the end into the start so the loop point is inaudible
      const x = Math.floor(ctx.sampleRate * 0.5);
      for (let i = 0; i < x; i++) {
        const k = i / x;
        d[len - x + i] = d[len - x + i] * (1 - k) + d[i] * k;
      }
    }
    return buf;
  };
  return { white: make("white"), pink: make("pink"), brown: make("brown") };
}

function loop(v: VoiceCtx, buf: AudioBuffer): AudioBufferSourceNode {
  const s = v.ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.loopEnd = buf.duration - 0.5;
  s.start(0, v.rand() * 6);
  return s;
}

function lfo(v: VoiceCtx, hz: number, depth: number, target: AudioParam): OscillatorNode {
  const o = v.ctx.createOscillator(); o.frequency.value = hz;
  const g = v.ctx.createGain(); g.gain.value = depth;
  o.connect(g).connect(target); o.start();
  return o;
}

const drone: VoiceFactory = (v) => {
  const { ctx } = v;
  const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 600; filter.Q.value = 0.5;
  filter.connect(v.out);
  const notes = [{ d: 0, o: -1 }, { d: 0, o: 0 }, { d: 2, o: 0 }, { d: 4, o: 0 }, { d: 0, o: 1 }];
  const oscs: { o: OscillatorNode; d: number; oc: number; det: number }[] = [];
  const lfos: OscillatorNode[] = [];
  notes.forEach((n, i) => {
    const g = ctx.createGain(); g.gain.value = 0.11 / (1 + i * 0.25);
    lfos.push(lfo(v, 0.03 + 0.02 * i + v.rand() * 0.02, 0.05 / (1 + i * 0.25), g.gain));
    g.connect(filter);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = v.freq(n.d, n.o); o.detune.value = det + v.rand() * 2;
      o.connect(g); o.start();
      oscs.push({ o, d: n.d, oc: n.o, det });
    }
  });
  return {
    update(now) {
      for (const x of oscs) x.o.frequency.setTargetAtTime(v.freq(x.d, x.oc), now, 1.5);
      filter.frequency.setTargetAtTime(250 + 1700 * Math.pow(v.sim.v("a.tone"), 1.5), now, 1);
    },
    stop() { oscs.forEach((x) => x.o.stop()); lfos.forEach((l) => l.stop()); filter.disconnect(); },
  };
};

/** A bell-like note: sine carrier with a decaying FM shimmer and a soft attack. */
function bell(v: VoiceCtx, when: number, f: number, gain: number, decay: number, pan: number): void {
  const { ctx } = v;
  const car = ctx.createOscillator(); car.frequency.value = f;
  const mod = ctx.createOscillator(); mod.frequency.value = f * 3.5;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 0.6 * (0.3 + v.sim.v("a.tone")), when);
  mg.gain.exponentialRampToValueAtTime(0.01, when + decay * 0.4);
  mod.connect(mg).connect(car.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.04);
  env.gain.setTargetAtTime(0, when + 0.04, decay / 4);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  car.connect(env).connect(p).connect(v.out);
  car.start(when); mod.start(when);
  car.stop(when + decay + 1); mod.stop(when + decay + 1);
}

const chimes: VoiceFactory = (v) => {
  let next = v.ctx.currentTime + 1 + v.rand() * 3;
  let last = 2;
  return {
    update(now) {
      if (next < now - 0.5) next = now; // after a pause, do not play the backlog at once
      while (next < now + 0.3) {
        const n = SCALES[v.sim.store.str("a.scale")]?.steps.length ?? 5;
        // mostly small steps: melodies that wander are calmer than leaps
        last = Math.max(0, Math.min(2 * n, last + Math.round((v.rand() - 0.5) * 4)));
        bell(v, Math.max(next, now + 0.02), v.freq(last, 1), 0.10 + v.rand() * 0.05, 5 + v.rand() * 3, v.rand() * 1.4 - 0.7);
        const mean = 11 - 9.5 * v.sim.v("a.activity");
        next += Math.max(0.7, -Math.log(1 - v.rand() * 0.98) * mean * 0.6 + mean * 0.4);
      }
    },
    stop() {},
  };
};

const bowls: VoiceFactory = (v) => {
  let next = v.ctx.currentTime + 1;
  return {
    update(now) {
      if (next < now - 0.5) next = now; // after a pause, do not play the backlog at once
      while (next < now + 0.3) {
        const when = Math.max(next, now + 0.02);
        const f = v.freq(Math.floor(v.rand() * 3) * 2, 0);
        const pan = v.rand() * 1.2 - 0.6;
        [1, 2.76, 5.4, 8.9].forEach((ratio, i) => {
          for (const beat of [0, 0.7 + v.rand()]) {
            const o = v.ctx.createOscillator(); o.frequency.value = f * ratio + beat;
            const g = v.ctx.createGain(); const peak = 0.07 / Math.pow(i + 1, 1.6);
            g.gain.setValueAtTime(0, when);
            g.gain.linearRampToValueAtTime(peak, when + 1.2);
            g.gain.setTargetAtTime(0, when + 1.2, (9 - i * 1.8) / 3);
            const p = v.ctx.createStereoPanner(); p.pan.value = pan;
            o.connect(g).connect(p).connect(v.out); o.start(when); o.stop(when + 22);
          }
        });
        next += 14 + v.rand() * 22 - 8 * v.sim.v("a.activity");
      }
    },
    stop() {},
  };
};

/** A plucked string: bright at the pluck, darkening as it rings. Phrases of a few notes. */
function pluck(v: VoiceCtx, when: number, f: number, gain: number, pan: number): void {
  const { ctx } = v;
  const o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 4;
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1;
  lp.frequency.setValueAtTime(f * 6, when); lp.frequency.exponentialRampToValueAtTime(f * 1.5, when + 1.2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when); env.gain.linearRampToValueAtTime(gain, when + 0.025);
  env.gain.setTargetAtTime(0, when + 0.025, 0.5);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(env).connect(p).connect(v.out);
  o1.start(when); o2.start(when); o1.stop(when + 3); o2.stop(when + 3);
}

const koto: VoiceFactory = (v) => {
  let next = v.ctx.currentTime + 2;
  return {
    update(now) {
      if (next < now - 0.5) next = now;
      while (next < now + 0.3) {
        const when = Math.max(next, now + 0.02);
        const n = SCALES[v.sim.store.str("a.scale")]?.steps.length ?? 5;
        const len = 3 + Math.floor(v.rand() * 3), start = Math.floor(v.rand() * n), dir = v.rand() < 0.5 ? 1 : -1;
        const pan = v.rand() * 1.2 - 0.6, gap = 0.28 + v.rand() * 0.2;
        for (let i = 0; i < len; i++) pluck(v, when + i * gap, v.freq(start + dir * i + n, 0), 0.11 + v.rand() * 0.04, pan);
        next += len * gap + 5 + v.rand() * 10 - 6 * v.sim.v("a.activity");
      }
    },
    stop() {},
  };
};

const ocean: VoiceFactory = (v) => {
  const src = loop(v, v.noise.brown);
  const lp = v.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
  const g = v.ctx.createGain(); g.gain.value = 0.5;
  const l1 = lfo(v, 0.085, 0.28, g.gain), l2 = lfo(v, 0.053, 0.16, g.gain);
  const l3 = lfo(v, 0.085, 350, lp.frequency);
  src.connect(lp).connect(g).connect(v.out);
  return { update() {}, stop() { src.stop(); l1.stop(); l2.stop(); l3.stop(); g.disconnect(); } };
};

const rain: VoiceFactory = (v) => {
  const src = loop(v, v.noise.white);
  const hp = v.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
  const lp = v.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;
  const g = v.ctx.createGain(); g.gain.value = 0.12;
  src.connect(hp).connect(lp).connect(g).connect(v.out);
  let next = v.ctx.currentTime + 0.5;
  return {
    update(now) {
      if (next < now - 0.5) next = now; // after a pause, do not play the backlog at once
      while (next < now + 0.3) {
        const when = Math.max(next, now + 0.02);
        const o = v.ctx.createOscillator(); const f = 900 + v.rand() * 1400;
        o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * 0.6, when + 0.12);
        const e = v.ctx.createGain();
        e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(0.03 + v.rand() * 0.03, when + 0.008);
        e.gain.setTargetAtTime(0, when + 0.008, 0.04);
        const p = v.ctx.createStereoPanner(); p.pan.value = v.rand() * 1.8 - 0.9;
        o.connect(e).connect(p).connect(v.out); o.start(when); o.stop(when + 0.5);
        next += 0.08 + v.rand() * (1.6 - 1.3 * v.sim.v("a.activity"));
      }
    },
    stop() { src.stop(); g.disconnect(); },
  };
};

const wind: VoiceFactory = (v) => {
  const src = loop(v, v.noise.pink);
  const bp = v.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.6;
  const g = v.ctx.createGain(); g.gain.value = 0.55;
  const ls = [lfo(v, 0.07, 220, bp.frequency), lfo(v, 0.113, 130, bp.frequency), lfo(v, 0.047, 0.3, g.gain)];
  src.connect(bp).connect(g).connect(v.out);
  return { update() {}, stop() { src.stop(); ls.forEach((l) => l.stop()); g.disconnect(); } };
};

const stream: VoiceFactory = (v) => {
  const src = loop(v, v.noise.white);
  const g = v.ctx.createGain(); g.gain.value = 0.3;
  const ls: OscillatorNode[] = [];
  for (let i = 0; i < 5; i++) {
    const bp = v.ctx.createBiquadFilter(); bp.type = "bandpass";
    const f = 500 + i * 420 + v.rand() * 200; bp.frequency.value = f; bp.Q.value = 9;
    ls.push(lfo(v, 2 + v.rand() * 5, f * 0.25, bp.frequency));
    const bg = v.ctx.createGain(); bg.gain.value = 0.5;
    ls.push(lfo(v, 0.6 + v.rand() * 1.5, 0.4, bg.gain));
    src.connect(bp).connect(bg).connect(g);
  }
  g.connect(v.out);
  return { update() {}, stop() { src.stop(); ls.forEach((l) => l.stop()); g.disconnect(); } };
};

const noise: VoiceFactory = (v) => {
  const src = loop(v, v.noise.brown);
  const g = v.ctx.createGain(); g.gain.value = 0.45;
  src.connect(g).connect(v.out);
  return { update() {}, stop() { src.stop(); g.disconnect(); } };
};

const pulse: VoiceFactory = (v) => {
  let next = v.ctx.currentTime + 0.5;
  const thump = (when: number, gain: number) => {
    const o = v.ctx.createOscillator();
    o.frequency.setValueAtTime(70, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.2);
    const e = v.ctx.createGain();
    e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(gain, when + 0.03);
    e.gain.setTargetAtTime(0, when + 0.03, 0.09);
    o.connect(e).connect(v.out); o.start(when); o.stop(when + 0.8);
  };
  return {
    update(now) {
      if (next < now - 0.5) next = now; // after a pause, do not play the backlog at once
      while (next < now + 0.3) {
        const when = Math.max(next, now + 0.02);
        const beat = 60 / v.sim.v("a.pulseRate");
        thump(when, 0.5); thump(when + beat * 0.3, 0.3);
        next += beat;
      }
    },
    stop() {},
  };
};

const breath: VoiceFactory = (v) => {
  const src = loop(v, v.noise.pink);
  const bp = v.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.9;
  const g = v.ctx.createGain(); g.gain.value = 0;
  src.connect(bp).connect(g).connect(v.out);
  return {
    update(now) {
      const b = v.sim.breath;
      g.gain.setTargetAtTime(0.08 + 0.5 * b, now, 0.15);
      bp.frequency.setTargetAtTime(500 + 600 * b, now, 0.15);
    },
    stop() { src.stop(); g.disconnect(); },
  };
};

const FACTORIES: Record<string, VoiceFactory> = { drone, chimes, bowls, koto, ocean, rain, wind, stream, noise, pulse, breath };

/** Master chain: voices -> dry + reverb -> soften -> volume -> limiter -> soft clip -> out.
 *  The limiter and clip stages sit after everything, so no voice, input or bug
 *  upstream can produce a sudden loud sound. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private voices = new Map<string, { voice: Voice; gain: GainNode }>();
  private vctx!: VoiceCtx;
  private dry!: GainNode;
  private wet!: GainNode;
  private soften!: BiquadFilterNode;
  private master!: GainNode;
  private fade!: GainNode;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  analyser: AnalyserNode | null = null;
  private rng: Rand = mulberry32(1);

  constructor(private sim: Sim) {}

  async start(): Promise<void> {
    if (this.ctx) { await this.ctx.resume(); return; }
    const ctx = new AudioContext({ latencyHint: "playback" });
    this.ctx = ctx;
    this.rng = mulberry32(subSeed(this.sim.seed, "audio"));
    const rand: Rand = () => this.rng();
    const bus = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    const conv = ctx.createConvolver(); conv.buffer = this.impulse(ctx, rand);
    this.soften = ctx.createBiquadFilter(); this.soften.type = "lowpass"; this.soften.Q.value = 0.5;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.fade = ctx.createGain(); this.fade.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 14; comp.attack.value = 0.003; comp.release.value = 0.4;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i < 1025; i++) curve[i] = Math.tanh(((i / 512) - 1) * 1.5) / Math.tanh(1.5) * 0.85;
    clip.curve = curve; clip.oversample = "2x";
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048;
    bus.connect(this.dry).connect(this.soften);
    bus.connect(conv).connect(this.wet).connect(this.soften);
    this.soften.connect(this.master).connect(this.fade).connect(comp).connect(clip);
    clip.connect(ctx.destination); clip.connect(this.analyser);
    // slow start: sound rises over several seconds, never arrives at once
    this.fade.gain.setValueAtTime(0, ctx.currentTime);
    this.fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 5);

    const sim = this.sim;
    this.vctx = {
      ctx, out: bus, rand, noise: noiseBuffers(ctx, rand), sim,
      freq(degree, octave) {
        const steps = (SCALES[sim.store.str("a.scale")] ?? SCALES.pentaMajor).steps;
        const n = steps.length;
        const oct = Math.floor(degree / n) + octave;
        const semis = steps[((degree % n) + n) % n] + Math.round(sim.store.num("a.root"));
        return 130.81 * Math.pow(2, (semis + 12 * oct) / 12);
      },
    };
    window.setInterval(() => this.update(), 50);
    await ctx.resume();
  }

  private impulse(ctx: AudioContext, rand: Rand): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 4.5);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // the tail darkens as it decays, as in a real room
        const a = 0.25 + 0.7 * (1 - t);
        lp += a * ((rand() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, 2.2) * Math.min(1, i / (ctx.sampleRate * 0.02));
      }
    }
    return buf;
  }

  private update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime, sim = this.sim;
    const vol = sim.store.bool("a.mute") ? 0 : sim.v("a.volume");
    this.master.gain.setTargetAtTime(vol * vol * 1.4, now, 0.2);
    this.soften.frequency.setTargetAtTime(16000 * Math.pow(0.11, sim.v("a.soften")), now, 0.3);
    const rv = sim.v("a.reverb");
    this.wet.gain.setTargetAtTime(rv * 0.9, now, 0.5);
    this.dry.gain.setTargetAtTime(1 - rv * 0.35, now, 0.5);
    for (const info of VOICES) {
      const level = sim.v(`a.voice.${info.id}`);
      let entry = this.voices.get(info.id);
      if (!entry && level > 0.005) {
        const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(this.vctx.out);
        entry = { gain, voice: FACTORIES[info.id]({ ...this.vctx, out: gain }) };
        this.voices.set(info.id, entry);
      }
      if (!entry) continue;
      entry.gain.gain.setTargetAtTime(level * level, now, 0.4);
      if (level > 0.002) entry.voice.update(now);
      else if (level < 0.0005) { entry.voice.stop(); entry.gain.disconnect(); this.voices.delete(info.id); }
    }
  }

  /** a touch plays one soft note: left to right walks up the scale, so the same place always sounds the same */
  touch(x: number, y: number): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const n = (SCALES[this.sim.store.str("a.scale")] ?? SCALES.pentaMajor).steps.length;
    const degree = Math.floor(Math.min(0.999, Math.max(0, x)) * n * 2);
    bell(this.vctx, this.ctx.currentTime + 0.02, this.vctx.freq(degree, y > 0.5 ? 1 : 0), 0.16, 6, x * 1.4 - 0.7);
  }

  /** fast fade for the stop control, and back */
  setStopped(stopped: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setTargetAtTime(stopped ? 0 : 1, now, stopped ? 0.03 : 1.2);
  }

  /** restart the generative voices from a seed, so a replay plays the same notes */
  reseed(seed: number): void {
    this.rng = mulberry32(subSeed(seed, "audio"));
    for (const [id, e] of this.voices) {
      const g = e.gain;
      g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.3);
      e.voice.stop();
      window.setTimeout(() => g.disconnect(), 2500);
      this.voices.delete(id);
    }
  }

  /** audio track for video capture */
  stream(): MediaStream | null {
    if (!this.ctx) return null;
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.analyser!.connect(this.streamDest);
    }
    return this.streamDest.stream;
  }

  /** current output peak, 0..1 (for the level meter and tests) */
  peak(): number {
    if (!this.analyser) return 0;
    const d = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(d);
    let m = 0;
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    return m;
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }
}
