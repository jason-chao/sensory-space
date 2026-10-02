import type { Store } from "./store";
import { mulberry32, subSeed, type Rand } from "./prng";
import { SignalBus } from "../signals/bus";
import { modulation } from "../signals/mapping";
import { getPalette, PALETTES } from "../visual/palettes";
import { SCENES } from "../visual/scenes";

export const STEP = 1 / 60;
const TRANSITION_S = 6;

/** Multipliers applied while "calm" is on. */
const CALM: Record<string, number> = {
  "v.brightness": 0.5, "v.speed": 0.4, "v.saturation": 0.7, "a.volume": 0.55, "a.activity": 0.4, "a.tone": 0.7,
};

/** The simulation: a fixed-step clock that turns targets (store) plus signals
 *  (bus) into smoothly moving effective values. Rendering and audio only read
 *  from here. Running the same inputs through it again gives the same output,
 *  which is what session replay relies on. */
export class Sim {
  t = 0;
  phase = 0;
  breathPhase = 0;
  breath = 0;
  calm = 0;
  seed = 1;
  readonly eff = new Map<string, number>();
  readonly pal = new Float32Array(12);
  sceneA = "aurora";
  sceneB: string | null = null;
  mix = 0;
  /** pattern seeds of the outgoing and incoming picture; a new variation is cross-faded like a scene change */
  visSeedA = 0;
  visSeedB = 0;
  private pendingVar = false;
  /** recent touches: x, y (0..1, origin bottom-left) and the time they happened */
  touches: { x: number; y: number; t: number }[] = [];
  private freezeAmt = 0;
  blank = 0;
  private pending: string | null = null;
  private mod = new Map<string, number>();
  private acc = 0;
  private lastSceneT = 0;
  private lastPaletteT = 0;
  private hueDrift = 0;
  private rand: Rand = mulberry32(1);
  /** called before each step with the step's start time; used by replay */
  preStep: ((t: number) => void) | null = null;
  onSceneSettled: (() => void) | null = null;
  driftEnabled = true;

  constructor(readonly store: Store, readonly bus: SignalBus) {
    store.onChange((key, value) => {
      if (key === "scene") this.requestScene(String(value));
      if (key === "palette") this.lastPaletteT = this.t;
      if (key === "variation") this.requestVariation();
      if (key === "touch") {
        const [x, y] = String(value).split(",").map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) { this.touches.push({ x, y, t: this.t }); if (this.touches.length > 8) this.touches.shift(); }
      }
    });
  }

  reset(seed: number, t0 = 0, phase0 = 0): void {
    this.seed = seed >>> 0;
    this.rand = mulberry32(subSeed(this.seed, "sim"));
    this.t = t0; this.phase = phase0; this.acc = 0;
    this.breathPhase = 0; this.lastSceneT = t0; this.lastPaletteT = t0; this.hueDrift = 0;
    this.eff.clear();
    for (const def of this.store.defs.values()) this.eff.set(def.key, this.store.num(def.key));
    this.pal.set(getPalette(this.store.str("palette")).v);
    this.sceneA = this.store.str("scene"); this.sceneB = null; this.mix = 0; this.pending = null; this.pendingVar = false;
    this.visSeedA = this.visSeedB = this.visSeed();
    this.calm = this.store.bool("calm") ? 1 : 0;
    this.touches = []; this.freezeAmt = this.store.bool("freeze") ? 1 : 0; this.blank = this.store.bool("v.blank") ? 1 : 0;
    this.bus.reset();
  }

  /** shader-friendly seed offset derived from the session seed and the variation number */
  private visSeed(): number {
    const s = (this.seed ^ Math.imul(Math.round(this.store.num("variation")) + 1, 0x9e3779b1)) >>> 0;
    return (s % 9973) / 97;
  }

  private requestVariation(): void {
    if (this.sceneB === null) { this.sceneB = this.sceneA; this.visSeedB = this.visSeed(); this.mix = 0; }
    else this.pendingVar = true;
  }

  v(key: string): number {
    return this.eff.get(key) ?? 0;
  }

  private requestScene(id: string): void {
    if (!SCENES.some((s) => s.id === id)) return;
    if (this.sceneB === null) {
      if (id !== this.sceneA) { this.sceneB = id; this.visSeedB = this.visSeedA; this.mix = 0; }
    } else if (id !== this.sceneB) {
      this.pending = id;
    } else {
      this.pending = null;
    }
    this.lastSceneT = this.t;
  }

  /** advance by real elapsed seconds, in fixed steps */
  advance(realDt: number): number {
    this.acc += Math.min(realDt, 0.25);
    let n = 0;
    while (this.acc >= STEP) { this.step(); this.acc -= STEP; n++; }
    return n;
  }

  step(): void {
    const dt = STEP;
    this.preStep?.(this.t);
    this.bus.tick(dt, this.t);
    modulation(this.store, this.bus, this.mod);

    const calmTarget = this.store.bool("calm") ? 1 : 0;
    this.calm += (calmTarget - this.calm) * (1 - Math.exp(-dt / 1.5));

    for (const def of this.store.defs.values()) {
      let target = this.store.num(def.key) + (this.mod.get(def.key) ?? 0);
      const cm = CALM[def.key];
      if (cm !== undefined) target *= 1 - (1 - cm) * this.calm;
      target = Math.min(def.max, Math.max(def.min, target));
      const cur = this.eff.get(def.key) ?? target;
      this.eff.set(def.key, cur + (target - cur) * (1 - Math.exp(-dt / def.tau)));
    }

    const s = this.v("v.speed");
    this.freezeAmt += ((this.store.bool("freeze") ? 1 : 0) - this.freezeAmt) * (1 - Math.exp(-dt / 0.8));
    this.blank += ((this.store.bool("v.blank") ? 1 : 0) - this.blank) * (1 - Math.exp(-dt / 1.2));
    this.phase += dt * (0.04 + 0.75 * s * s) * 4 * (1 - this.freezeAmt);
    this.breathPhase = (this.breathPhase + (dt * this.v("breath.rate")) / 60) % 1;
    const bp = this.breathPhase;
    // inhale over 40% of the cycle, exhale over 60%
    this.breath = bp < 0.4 ? 0.5 - 0.5 * Math.cos((Math.PI * bp) / 0.4) : 0.5 + 0.5 * Math.cos((Math.PI * (bp - 0.4)) / 0.6);

    const pt = getPalette(this.store.str("palette")).v;
    const hr = this.v("drift.hue");
    this.hueDrift = (this.hueDrift + (dt * hr * hr * 0.5) / 60) % 1;   // at full setting one cycle takes two minutes
    const hue = this.v("v.hue") + this.hueDrift;
    const k = 1 - Math.exp(-dt / 2.5);
    for (let i = 0; i < 12; i++) {
      const target = i >= 9 ? pt[i] + hue : pt[i];
      this.pal[i] += (target - this.pal[i]) * k;
    }

    if (this.sceneB !== null) {
      this.mix += dt / TRANSITION_S;
      if (this.mix >= 1) {
        this.sceneA = this.sceneB; this.visSeedA = this.visSeedB; this.sceneB = null; this.mix = 0;
        this.onSceneSettled?.();
        const next = this.pending && this.pending !== this.sceneA ? this.pending : this.pendingVar ? this.sceneA : null;
        if (next) { this.sceneB = next; this.visSeedB = this.visSeed(); }
        this.pending = null; this.pendingVar = false;
      }
    }

    const delay = this.store.num("drift.delay") * 60;
    if (this.driftEnabled && this.t >= delay) {
      const driftMin = this.store.num("drift.minutes");
      if (driftMin > 0 && this.t - this.lastSceneT > driftMin * 60) {
        const others = SCENES.filter((x) => x.id !== this.store.str("scene"));
        this.store.set("scene", others[Math.floor(this.rand() * others.length)].id, "system");
      }
      const colMin = this.store.num("drift.colourMinutes");
      if (colMin > 0 && this.t - this.lastPaletteT > colMin * 60) {
        const others = PALETTES.filter((x) => x.id !== this.store.str("palette"));
        this.store.set("palette", others[Math.floor(this.rand() * others.length)].id, "system");
      }
    }
    this.t += dt;
  }
}
