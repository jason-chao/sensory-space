/** Band powers from raw EEG, computed in the browser so that any device works
 *  the same way. See docs/EEG-BRIDGE-PROTOCOL.md section 5. */

export const BANDS: { name: string; lo: number; hi: number }[] = [
  { name: "delta", lo: 1, hi: 4 }, { name: "theta", lo: 4, hi: 8 }, { name: "alpha", lo: 8, hi: 13 },
  { name: "beta", lo: 13, hi: 30 }, { name: "gamma", lo: 30, hi: 45 },
];

/** in-place radix-2 FFT; re and im have a power-of-two length */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface BandResult {
  /** relative power per band (shares of the 1..45 Hz total), by band name */
  rel: Record<string, number>;
  /** share of channels whose window was accepted */
  quality: number;
  channelsUsed: number;
}

/** Keeps the last `windowS` seconds per channel and computes relative band powers. */
export class BandAnalyser {
  private buf: Float64Array[];
  private pos = 0;
  private filled = 0;
  private readonly n: number;
  /** samples per second after decimation */
  readonly fs: number;
  private decim = 1;
  private decimCount = 0;

  constructor(readonly channels: number, srate: number, readonly microvolts: boolean, windowS = 2) {
    this.decim = Math.max(1, Math.ceil(srate / 1000));
    this.fs = srate / this.decim;
    this.n = Math.max(32, Math.round(this.fs * windowS));
    this.buf = Array.from({ length: channels }, () => new Float64Array(this.n));
  }

  push(sample: ArrayLike<number>): void {
    if (this.decimCount++ % this.decim !== 0) return;
    for (let c = 0; c < this.channels; c++) this.buf[c][this.pos] = Number(sample[c]) || 0;
    this.pos = (this.pos + 1) % this.n;
    this.filled = Math.min(this.n, this.filled + 1);
  }

  get ready(): boolean {
    return this.filled >= this.n;
  }

  analyse(): BandResult | null {
    if (!this.ready) return null;
    let size = 1;
    while (size < this.n) size <<= 1;
    const re = new Float64Array(size), im = new Float64Array(size);
    const sums: Record<string, number> = {};
    for (const b of BANDS) sums[b.name] = 0;
    let used = 0;
    for (let c = 0; c < this.channels; c++) {
      // window in time order, mean removed
      let mean = 0;
      for (let i = 0; i < this.n; i++) mean += this.buf[c][(this.pos + i) % this.n];
      mean /= this.n;
      let min = Infinity, max = -Infinity, sq = 0;
      re.fill(0); im.fill(0);
      for (let i = 0; i < this.n; i++) {
        const v = this.buf[c][(this.pos + i) % this.n] - mean;
        min = Math.min(min, v); max = Math.max(max, v); sq += v * v;
        re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.n - 1)));   // Hann
      }
      const sd = Math.sqrt(sq / this.n);
      if (this.microvolts && (max - min > 300 || sd < 0.5)) continue;   // blink/movement, or no contact
      if (sd === 0) continue;
      fft(re, im);
      const df = this.fs / size;
      const bandPow: Record<string, number> = {};
      let total = 0;
      for (const b of BANDS) {
        let p = 0;
        const k0 = Math.ceil(b.lo / df), k1 = Math.min(Math.floor(b.hi / df), size / 2);
        for (let k = k0; k < k1; k++) p += re[k] * re[k] + im[k] * im[k];
        bandPow[b.name] = p; total += p;
      }
      if (total <= 0) continue;
      for (const b of BANDS) sums[b.name] += bandPow[b.name] / total;
      used++;
    }
    const rel: Record<string, number> = {};
    for (const b of BANDS) rel[b.name] = used ? sums[b.name] / used : 0;
    return { rel, quality: used / this.channels, channelsUsed: used };
  }
}

/** Relative band shares from a stream that publishes band powers itself. Labels
 *  are matched by name (low_alpha and high_alpha both count as alpha). */
export function bandsFromLabels(labels: string[], values: ArrayLike<number>): Record<string, number> {
  const abs: Record<string, number> = {};
  let total = 0;
  for (const b of BANDS) abs[b.name] = 0;
  labels.forEach((l, i) => {
    const name = BANDS.find((b) => l.toLowerCase().includes(b.name))?.name;
    const v = Number(values[i]);
    if (!name || !Number.isFinite(v) || v < 0) return;
    abs[name] += v; total += v;
  });
  const rel: Record<string, number> = {};
  for (const b of BANDS) rel[b.name] = total > 0 ? abs[b.name] / total : 0;
  return rel;
}
