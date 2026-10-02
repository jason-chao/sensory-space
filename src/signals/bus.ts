/** Signal bus: every input device is reduced to named signals in the range 0..1,
 *  where 0.5 means "this person's usual level". Visuals and sound read only from
 *  here, never from a device. */
export interface SignalDesc {
  name: string;
  label: string;
  source: string;
  /** seconds of smoothing applied before the signal may influence anything */
  tau: number;
  /** true when the signal is derived from a person's body */
  bio: boolean;
}

export interface SignalState {
  desc: SignalDesc;
  raw: number;
  smooth: number;
  /** 0..1 confidence; fades to 0 when the signal goes stale */
  quality: number;
  qualityIn: number;
  lastT: number;
}

export type PushListener = (name: string, value: number, quality: number) => void;

const STALE_S = 6;

export class SignalBus {
  readonly signals = new Map<string, SignalState>();
  private listeners: PushListener[] = [];

  declare(desc: SignalDesc): void {
    if (!this.signals.has(desc.name)) {
      this.signals.set(desc.name, { desc, raw: 0.5, smooth: 0.5, quality: 0, qualityIn: 0, lastT: -1e9 });
    }
  }

  removeSource(source: string): void {
    for (const [k, s] of this.signals) if (s.desc.source === source) this.signals.delete(k);
  }

  /** t is simulation time in seconds */
  push(name: string, value: number, quality: number, t: number): void {
    const s = this.signals.get(name);
    if (!s || !Number.isFinite(value)) return;
    s.raw = Math.min(1, Math.max(0, value));
    s.qualityIn = Math.min(1, Math.max(0, quality));
    s.lastT = t;
    for (const l of this.listeners) l(name, s.raw, s.qualityIn);
  }

  onPush(l: PushListener): void {
    this.listeners.push(l);
  }

  /** advance smoothing by dt seconds at simulation time t */
  tick(dt: number, t: number): void {
    for (const s of this.signals.values()) {
      const fresh = t - s.lastT < STALE_S;
      const qTarget = fresh ? s.qualityIn : 0;
      s.quality += (qTarget - s.quality) * (1 - Math.exp(-dt / 3));
      // with no confidence the signal relaxes to neutral instead of freezing at an extreme
      const target = 0.5 + (s.raw - 0.5) * (fresh ? s.qualityIn : 0);
      s.smooth += (target - s.smooth) * (1 - Math.exp(-dt / Math.max(0.5, s.desc.tau)));
    }
  }

  /** deflection from neutral in -1..1, already weighted by confidence */
  deflection(name: string): number {
    const s = this.signals.get(name);
    return s ? (s.smooth - 0.5) * 2 : 0;
  }

  reset(): void {
    for (const s of this.signals.values()) {
      s.raw = 0.5; s.smooth = 0.5; s.quality = 0; s.qualityIn = 0; s.lastT = -1e9;
    }
  }
}

/** Running personal baseline: turns an arbitrary measurement into 0..1 around
 *  the person's own recent average, so mappings never depend on absolute values. */
export class Baseline {
  private mean = 0;
  private varr = 0;
  private n = 0;
  constructor(private halfLifeSamples = 90, private warmup = 12) {}

  norm(x: number): number {
    this.n++;
    const a = Math.max(1 / this.n, 1 - Math.pow(0.5, 1 / this.halfLifeSamples));
    const d = x - this.mean;
    this.mean += a * d;
    this.varr += a * (d * d - this.varr);
    const sd = Math.sqrt(this.varr);
    if (sd < 1e-9) return 0.5;
    const z = (x - this.mean) / sd;
    // confidence ramps in during warm-up so the first readings cannot swing the scene
    const w = Math.min(1, this.n / this.warmup);
    return 0.5 + 0.5 * Math.tanh(z / 2) * w;
  }

  reset(): void {
    this.mean = 0; this.varr = 0; this.n = 0;
  }
}
