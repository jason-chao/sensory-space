import type { Store } from "../core/store";
import type { SignalBus } from "./bus";

/** One route: a signal nudges a parameter. amount is the fraction of the
 *  parameter's full range moved at full deflection and full influence. */
export interface Route {
  signal: string;
  target: string;
  amount: number;
}

/** A reactivity mode is a named set of routes plus a ceiling on influence.
 *  New modes (stronger, experimental, training-style) are added here without
 *  touching the engine. */
export interface ReactMode {
  id: string;
  label: string;
  description: string;
  /** hard ceiling applied on top of the user's influence slider */
  maxInfluence: number;
  routes: Route[];
}

export const MODES: ReactMode[] = [
  {
    id: "gentle",
    label: "Gentle colouring",
    description: "Signals slowly tint the colour, detail and tone. Nothing is scored and nothing speeds up when you are tense.",
    maxInfluence: 0.5,
    routes: [
      { signal: "eeg.calm", target: "v.hue", amount: 0.5 },
      { signal: "eeg.calm", target: "a.tone", amount: -0.5 },
      { signal: "eeg.alpha", target: "v.density", amount: 0.6 },
      { signal: "eeg.theta", target: "a.reverb", amount: 0.4 },
      { signal: "body.heart", target: "a.pulseRate", amount: 0.8 },
      { signal: "body.motion", target: "v.speed", amount: -0.3 },
    ],
  },
  {
    id: "mirror",
    label: "Mirror (experimental)",
    description: "A more visible link between signals and the scene, still bounded and slow. For experimenting.",
    maxInfluence: 1,
    routes: [
      { signal: "eeg.calm", target: "v.hue", amount: 1.0 },
      { signal: "eeg.calm", target: "v.saturation", amount: 0.5 },
      { signal: "eeg.calm", target: "a.tone", amount: -0.8 },
      { signal: "eeg.alpha", target: "v.density", amount: 1.0 },
      { signal: "eeg.alpha", target: "a.activity", amount: 0.6 },
      { signal: "eeg.theta", target: "a.reverb", amount: 0.6 },
      { signal: "body.heart", target: "a.pulseRate", amount: 1.0 },
      { signal: "body.motion", target: "v.speed", amount: -0.4 },
    ],
  },
];

export function getMode(id: string): ReactMode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/** Offsets to add to parameter targets. Bounded by construction:
 *  |offset| <= influence * amount * range / 2, summed over routes. */
export function modulation(store: Store, bus: SignalBus, out: Map<string, number>): void {
  out.clear();
  const mode = getMode(store.str("r.mode"));
  const influence = Math.min(mode.maxInfluence, store.num("r.influence"));
  if (influence <= 0) return;
  for (const r of mode.routes) {
    const def = store.defs.get(r.target);
    if (!def || !def.reactive) continue;
    const d = bus.deflection(r.signal);
    if (d === 0) continue;
    const off = influence * r.amount * d * (def.max - def.min) * 0.5;
    out.set(r.target, (out.get(r.target) ?? 0) + off);
  }
}
