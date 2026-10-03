import type { Store } from "./store";
import { SCENES } from "../visual/scenes";
import { VOICES } from "../audio/voicelist";

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
  for (const v of VOICES) d({ key: `a.voice.${v.id}`, label: v.label, min: 0, max: 1, def: v.def, tau: 1.2 });

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
  store.init("a.mute", false);
}

export interface Profile {
  id: string;
  label: string;
  blurb: string;
  set: Record<string, number>;
}

/** Named soundscapes: a set of layer levels plus a scale. Everything else is left as it is. */
export interface Soundscape {
  id: string;
  label: string;
  /** factual description of what plays */
  blurb: string;
  scale: string;
  layers: Record<string, number>;
}

export const SOUNDSCAPES: Soundscape[] = [
  { id: "shore", label: "Shore at dusk", blurb: "ocean, warm drone, a few chimes", scale: "pentaMinor", layers: { ocean: 0.5, drone: 0.4, chimes: 0.2 } },
  { id: "garden", label: "Night garden", blurb: "wind, chimes, quiet drone, a bowl now and then", scale: "yo", layers: { wind: 0.35, chimes: 0.4, drone: 0.3, bowls: 0.15 } },
  { id: "rain", label: "Rainy window", blurb: "rain, warm drone", scale: "pentaMajor", layers: { rain: 0.5, drone: 0.35 } },
  { id: "temple", label: "Temple bells", blurb: "singing bowls, plucked strings, low drone", scale: "insen", layers: { bowls: 0.5, koto: 0.35, drone: 0.25 } },
  { id: "stream", label: "Mountain stream", blurb: "stream, light wind, chimes", scale: "lydian", layers: { stream: 0.5, wind: 0.2, chimes: 0.3 } },
  { id: "hush", label: "Deep hush", blurb: "brown noise, low drone, slow pulse", scale: "pentaMinor", layers: { noise: 0.45, drone: 0.3, pulse: 0.2 } },
  { id: "breathing", label: "Breathing", blurb: "breath sound at the breathing pace, soft drone, bowls", scale: "pentaMajor", layers: { breath: 0.5, drone: 0.35, bowls: 0.2 } },
  { id: "chimes", label: "Chimes alone", blurb: "sparse chimes, nothing else", scale: "pentaMajor", layers: { chimes: 0.5 } },
];

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
