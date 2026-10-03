import type { Sim } from "../core/sim";
import type { Store, Value } from "../core/store";
import type { SignalBus, SignalDesc } from "../signals/bus";

export const FORMAT = "sensory-space-session";
export const FORMAT_VERSION = 1;

/** [seconds from start, "set", key, value] or [seconds, "sig", name, value, quality] */
export type SessionEvent = [number, "set", string, Value] | [number, "sig", string, number, number];

/** A session file holds what is needed to regenerate a session, not its pixels:
 *  the seed, the starting settings, every later change, and (optionally) the
 *  normalised signals that influenced it. Raw device data is never stored. */
export interface SessionFile {
  format: typeof FORMAT;
  version: number;
  app: string;
  createdAt: string;
  seed: number;
  t0: number;
  phase0: number;
  duration: number;
  initial: Record<string, Value>;
  containsBodySignals: boolean;
  signals: SignalDesc[];
  events: SessionEvent[];
}

const SIG_MIN_INTERVAL = 0.25;

export class Recorder {
  active = false;
  private file: SessionFile | null = null;
  private lastSig = new Map<string, number>();
  includeSignals = true;

  constructor(private store: Store, private sim: Sim, private bus: SignalBus, private appVersion: string) {
    store.onChange((key, value, origin) => {
      if (!this.active || !this.file || origin === "replay") return;
      this.file.events.push([this.rel(), "set", key, value]);
    });
    bus.onPush((name, value, quality) => {
      if (!this.active || !this.file || !this.includeSignals) return;
      const t = this.rel();
      if (t - (this.lastSig.get(name) ?? -1) < SIG_MIN_INTERVAL) return;
      this.lastSig.set(name, t);
      this.file.events.push([t, "sig", name, Math.round(value * 1000) / 1000, Math.round(quality * 100) / 100]);
    });
  }

  private rel(): number {
    return Math.round((this.sim.t - this.file!.t0) * 1000) / 1000;
  }

  get elapsed(): number {
    return this.active && this.file ? this.sim.t - this.file.t0 : 0;
  }

  start(): void {
    const signals = this.includeSignals ? [...this.bus.signals.values()].map((s) => s.desc) : [];
    this.file = {
      format: FORMAT, version: FORMAT_VERSION, app: this.appVersion, createdAt: new Date().toISOString(),
      seed: this.sim.seed, t0: this.sim.t, phase0: this.sim.phase, duration: 0,
      initial: this.store.snapshot(), containsBodySignals: signals.some((s) => s.bio), signals, events: [],
    };
    this.lastSig.clear();
    this.active = true;
  }

  stop(): SessionFile | null {
    if (!this.active || !this.file) return null;
    this.active = false;
    this.file.duration = this.rel();
    // signals may have been connected after recording began
    if (this.includeSignals) {
      this.file.signals = [...this.bus.signals.values()].map((s) => s.desc);
      this.file.containsBodySignals = this.file.signals.some((s) => s.bio) && this.file.events.some((e) => e[1] === "sig");
    }
    const f = this.file; this.file = null;
    return f;
  }
}

export function parseSession(text: string): SessionFile {
  const f = JSON.parse(text) as SessionFile;
  if (f?.format !== FORMAT) throw new Error("This is not a Sensory Space session file");
  if (f.version > FORMAT_VERSION) throw new Error("This session was made with a newer version of Sensory Space");
  if (!Array.isArray(f.events) || typeof f.initial !== "object") throw new Error("The session file is damaged");
  return f;
}

export class Player {
  active = false;
  private file: SessionFile | null = null;
  private idx = 0;
  onEnd: (() => void) | null = null;

  constructor(private store: Store, private sim: Sim, private bus: SignalBus) {}

  get position(): number {
    return this.file ? Math.min(this.file.duration, this.sim.t - this.file.t0) : 0;
  }
  get duration(): number {
    return this.file?.duration ?? 0;
  }

  start(file: SessionFile): void {
    this.file = file; this.idx = 0; this.active = true;
    this.store.load(file.initial, "replay", (k) => k === "touch" || k === "drag");
    this.sim.reset(file.seed, file.t0, file.phase0);
    for (const d of file.signals) this.bus.declare({ ...d, source: "replay" });
    this.sim.driftEnabled = false;
    this.sim.preStep = (t) => this.apply(t);
  }

  private apply(t: number): void {
    const f = this.file;
    if (!f) return;
    const rel = t - f.t0;
    while (this.idx < f.events.length && f.events[this.idx][0] <= rel) {
      const e = f.events[this.idx++];
      if (e[1] === "set") this.store.set(e[2], e[3], "replay");
      else this.bus.push(e[2], e[3], e[4], t);
    }
    if (rel > f.duration) this.stop(true);
  }

  stop(ended = false): void {
    if (!this.active) return;
    this.active = false; this.file = null;
    this.sim.preStep = null;
    this.sim.driftEnabled = true;
    this.bus.removeSource("replay");
    if (ended) this.onEnd?.();
  }
}

export function downloadJson(obj: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
