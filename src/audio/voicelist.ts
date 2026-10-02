export interface VoiceInfo {
  id: string;
  label: string;
  blurb: string;
  def: number;
}

/** All sound is synthesised in the browser; no recordings are shipped. */
export const VOICES: VoiceInfo[] = [
  { id: "drone", label: "Warm drone", blurb: "A slow, sustained chord", def: 0.5 },
  { id: "chimes", label: "Chimes", blurb: "Sparse soft bells", def: 0.4 },
  { id: "bowls", label: "Singing bowls", blurb: "Long shimmering tones", def: 0 },
  { id: "ocean", label: "Ocean", blurb: "Waves arriving and leaving", def: 0.3 },
  { id: "rain", label: "Rain", blurb: "Steady rain with soft drops", def: 0 },
  { id: "wind", label: "Wind", blurb: "Air moving through trees", def: 0 },
  { id: "stream", label: "Stream", blurb: "Water over stones", def: 0 },
  { id: "noise", label: "Brown noise", blurb: "A deep, even hush", def: 0 },
  { id: "pulse", label: "Soft pulse", blurb: "A slow heartbeat-like beat", def: 0 },
  { id: "breath", label: "Breath", blurb: "Follows the breathing pace", def: 0 },
];

export const SCALES: Record<string, { label: string; steps: number[] }> = {
  pentaMajor: { label: "Bright (major pentatonic)", steps: [0, 2, 4, 7, 9] },
  pentaMinor: { label: "Dusk (minor pentatonic)", steps: [0, 3, 5, 7, 10] },
  lydian: { label: "Floating (lydian)", steps: [0, 2, 4, 6, 7, 9, 11] },
};
