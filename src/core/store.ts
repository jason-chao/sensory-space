/** Single source of truth for everything a person (or a replay) can change.
 *  Every change goes through set(), which is what makes sessions recordable. */
export type Value = number | string | boolean;
export type Origin = "user" | "replay" | "system";

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  step?: number;
  /** seconds for the smoothed value to follow a change; this is also a safety property */
  tau: number;
  /** may reactive input move this parameter */
  reactive?: boolean;
  hint?: string;
}

type Listener = (key: string, value: Value, origin: Origin) => void;

export class Store {
  private values = new Map<string, Value>();
  private listeners: Listener[] = [];
  readonly defs = new Map<string, ParamDef>();

  define(def: ParamDef): void {
    this.defs.set(def.key, def);
    if (!this.values.has(def.key)) this.values.set(def.key, def.def);
  }

  init(key: string, value: Value): void {
    if (!this.values.has(key)) this.values.set(key, value);
  }

  set(key: string, value: Value, origin: Origin = "user"): void {
    const def = this.defs.get(key);
    if (def) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      value = Math.min(def.max, Math.max(def.min, n));
    }
    if (this.values.get(key) === value) return;
    this.values.set(key, value);
    for (const l of this.listeners) l(key, value, origin);
  }

  get(key: string): Value | undefined {
    return this.values.get(key);
  }
  num(key: string): number {
    const v = this.values.get(key);
    return typeof v === "number" ? v : Number(v) || 0;
  }
  str(key: string): string {
    return String(this.values.get(key) ?? "");
  }
  bool(key: string): boolean {
    return this.values.get(key) === true;
  }

  onChange(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  snapshot(): Record<string, Value> {
    return Object.fromEntries(this.values);
  }

  /** Apply a snapshot. Unknown keys are ignored so that old files stay loadable. */
  load(snap: Record<string, Value>, origin: Origin = "system", skip: (k: string) => boolean = () => false): void {
    for (const [k, v] of Object.entries(snap)) {
      if (!this.values.has(k) || skip(k)) continue;
      if (typeof v !== typeof this.values.get(k)) continue;
      this.set(k, v, origin);
    }
  }
}
