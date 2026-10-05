import type { Store } from "./store";
import { SCENES } from "../visual/scenes";
import { LAYERS, SOUNDSCAPES } from "sensory-sound";

/** the soundscapes, in the package's order; re-exported so the interface has one source */
export { SOUNDSCAPES };

/** Declares every adjustable value. tau is the time constant with which the
 *  engine follows a change: nothing a person or a signal does can jump. */
export function defineParams(store: Store): void {
  const d = store.define.bind(store);
  d({ key: "v.brightness", label: "Brightness", min: 0, max: 1, def: 0.6, tau: 1.2 });
  d({ key: "v.speed", label: "Motion speed", min: 0, max: 1, def: 0.5, tau: 1.5, reactive: true });
  d({ key: "v.density", label: "Detail", min: 0, max: 1, def: 0.5, tau: 2.5, reactive: true });
  d({ key: "v.saturation", label: "Colour strength", min: 0, max: 1, def: 0.75, tau: 1.5, reactive: true });
  d({ key: "v.mask", label: "Island of light (shrinks the picture to a soft circle)", min: 0, max: 1, def: 0, tau: 2 });
  d({ key: "v.hue", label: "Colour shift", min: -0.25, max: 0.25, def: 0, tau: 3, reactive: true });
  for (const s of SCENES) {
    if (s.a) d({ key: `sc.${s.id}.a`, label: s.a.label, min: 0, max: 1, def: s.a.def, tau: 1.5 });
    if (s.b) d({ key: `sc.${s.id}.b`, label: s.b.label, min: 0, max: 1, def: s.b.def, tau: 1.5 });
  }
  d({ key: "breath.rate", label: "Breaths per minute", min: 3, max: 10, def: 6, step: 0.5, tau: 4 });

  d({ key: "a.volume", label: "Volume", min: 0, max: 1, def: 0.4, tau: 0.6 });
  d({ key: "a.soften", label: "Soften (less treble)", min: 0, max: 1, def: 0.45, tau: 1 });
  d({ key: "a.reverb", label: "Space", min: 0, max: 1, def: 0.5, tau: 2, reactive: true });
  d({ key: "a.tone", label: "Tone brightness", min: 0, max: 1, def: 0.45, tau: 3, reactive: true });
  d({ key: "a.activity", label: "Activity", min: 0, max: 1, def: 0.4, tau: 3, reactive: true });
  d({ key: "a.pulseRate", label: "Pulse per minute", min: 40, max: 90, def: 58, step: 1, tau: 5, reactive: true });
  d({ key: "a.root", label: "Key", min: 0, max: 11, def: 2, step: 1, tau: 0.01 });
  // layer levels start as the first soundscape, so the panel does not open on "Custom"
  for (const l of LAYERS) d({ key: `a.voice.${l.id}`, label: l.label, min: 0, max: 1, def: SOUNDSCAPES[0].layers[l.id] ?? 0, tau: 1.2 });

  d({ key: "r.influence", label: "Influence", min: 0, max: 1, def: 0.35, tau: 2 });
  // change over time: off by default; when on, always through slow cross-fades
  d({ key: "drift.minutes", label: "New scene every (minutes, 0 = never)", min: 0, max: 60, def: 0, step: 1, tau: 0.01 });
  d({ key: "drift.colourMinutes", label: "New palette every (minutes, 0 = never)", min: 0, max: 60, def: 0, step: 1, tau: 0.01 });
  d({ key: "drift.hueMinutes", label: "Colours rotate once every (minutes, 0 = never)", min: 0, max: 60, def: 0, step: 1, tau: 0.01 });
  d({ key: "drift.delay", label: "Changes begin after (minutes from the start)", min: 0, max: 60, def: 0, step: 1, tau: 0.01 });

  store.init("variation", 0);
  store.init("scene", "aurora");
  store.init("palette", "spectrum");
  store.init("a.scale", "pentaMinor");   // the defaults match the "Shore at dusk" soundscape
  store.init("r.mode", "gentle");
  store.init("ease", false);
  store.init("ui.iconsOnly", false);
  store.init("freeze", false);
  store.init("v.blank", false);
  store.init("touch", "");
  store.init("drag", "");
  store.init("a.mute", false);
}

export interface Profile {
  id: string;
  label: string;
  blurb: string;
  set: Record<string, number>;
}

/** Intensity profiles. Even "Vivid" stays inside the safety layer. */
export const PROFILES: Profile[] = [
  {
    id: "gentle", label: "Gentle", blurb: "Dim, slow and sparse",
    set: { "v.brightness": 0.45, "v.speed": 0.3, "v.density": 0.35, "v.saturation": 0.6, "a.activity": 0.25, "a.tone": 0.35 },
  },
  {
    id: "balanced", label: "Balanced", blurb: "A middle setting",
    set: { "v.brightness": 0.6, "v.speed": 0.5, "v.density": 0.5, "v.saturation": 0.75, "a.activity": 0.4, "a.tone": 0.45 },
  },
  {
    id: "vivid", label: "Vivid", blurb: "Brighter, richer, more movement",
    set: { "v.brightness": 0.85, "v.speed": 0.7, "v.density": 0.75, "v.saturation": 0.95, "a.activity": 0.65, "a.tone": 0.6 },
  },
];
