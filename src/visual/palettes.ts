/** Cosine palettes: colour(t) = a + b * cos(2*pi*(c*t + d)).
 *  Smooth by construction, cheap in a shader and easy to cross-fade. */
export interface Palette {
  id: string;
  label: string;
  /** a, b, c, d as four rgb triples */
  v: number[];
}

export const PALETTES: Palette[] = [
  { id: "deepsea", label: "Deep sea", v: [0.15, 0.4, 0.55, 0.15, 0.3, 0.35, 1, 1, 1, 0.55, 0.4, 0.3] },
  { id: "aurora", label: "Aurora", v: [0.3, 0.55, 0.5, 0.3, 0.4, 0.4, 1, 1, 0.7, 0.6, 0.25, 0.45] },
  { id: "forest", label: "Forest", v: [0.3, 0.45, 0.25, 0.2, 0.3, 0.15, 1, 1, 1, 0.3, 0.2, 0.4] },
  { id: "sunset", label: "Sunset", v: [0.6, 0.42, 0.42, 0.33, 0.28, 0.3, 1, 1, 1, 0.0, 0.12, 0.3] },
  { id: "lavender", label: "Lavender", v: [0.5, 0.4, 0.65, 0.3, 0.25, 0.3, 1, 1, 1, 0.75, 0.6, 0.5] },
  { id: "pastel", label: "Pastel", v: [0.72, 0.7, 0.75, 0.2, 0.2, 0.2, 1, 1, 1, 0.0, 0.33, 0.67] },
  { id: "candy", label: "Candy", v: [0.68, 0.5, 0.65, 0.3, 0.3, 0.3, 1, 1, 1, 0.9, 0.4, 0.6] },
  { id: "spectrum", label: "Soft spectrum", v: [0.55, 0.55, 0.55, 0.4, 0.4, 0.4, 1, 1, 1, 0.0, 0.33, 0.67] },
  { id: "ember", label: "Ember (low blue)", v: [0.5, 0.28, 0.12, 0.4, 0.22, 0.1, 1, 1, 1, 0.0, 0.05, 0.1] },
  { id: "moon", label: "Moonlight", v: [0.5, 0.55, 0.62, 0.4, 0.42, 0.45, 1, 1, 1, 0, 0, 0] },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** CSS preview gradient for the palette chips */
export function paletteCss(p: Palette): string {
  const stops: string[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const c = [0, 1, 2].map((k) => {
      const x = p.v[k] + p.v[3 + k] * Math.cos(6.28318 * (p.v[6 + k] * t + p.v[9 + k]));
      return Math.round(255 * Math.min(1, Math.max(0, x)));
    });
    stops.push(`rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
