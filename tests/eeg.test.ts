import { describe, expect, it } from "vitest";
import { BandAnalyser, bandsFromLabels, fft } from "../src/signals/eeg";

function feed(an: BandAnalyser, fs: number, seconds: number, gen: (t: number) => number[]) {
  for (let i = 0; i < fs * seconds; i++) an.push(gen(i / fs));
}

describe("EEG band analysis", () => {
  it("FFT finds a pure tone in the right bin", () => {
    const n = 256, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 16 * i) / n);
    fft(re, im);
    const mag = Array.from(re, (r, k) => Math.hypot(r, im[k]));
    expect(mag.indexOf(Math.max(...mag.slice(0, n / 2)))).toBe(16);
  });
  it("a 10 Hz rhythm shows as alpha on every channel", () => {
    const an = new BandAnalyser(2, 256, true);
    feed(an, 256, 3, (t) => [20 * Math.sin(2 * Math.PI * 10 * t), 20 * Math.sin(2 * Math.PI * 10 * t + 1)]);
    const r = an.analyse()!;
    expect(r.quality).toBe(1);
    expect(r.rel.alpha).toBeGreaterThan(0.8);
    expect(Object.values(r.rel).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
  it("rejects a flat channel and a channel with a huge artefact, keeping the good one", () => {
    const an = new BandAnalyser(3, 256, true);
    feed(an, 256, 3, (t) => [20 * Math.sin(2 * Math.PI * 6 * t), 0, 400 * Math.sin(2 * Math.PI * 1 * t)]);
    const r = an.analyse()!;
    expect(r.channelsUsed).toBe(1);
    expect(r.quality).toBeCloseTo(1 / 3, 5);
    expect(r.rel.theta).toBeGreaterThan(0.8);
  });
  it("works at a low sample rate and decimates a very high one", () => {
    const low = new BandAnalyser(1, 64, true);
    feed(low, 64, 3, (t) => [10 * Math.sin(2 * Math.PI * 20 * t)]);
    expect(low.analyse()!.rel.beta).toBeGreaterThan(0.7);
    const high = new BandAnalyser(1, 4000, true);
    expect(high.fs).toBeLessThanOrEqual(1000);
    feed(high, 4000, 3, (t) => [10 * Math.sin(2 * Math.PI * 10 * t)]);
    expect(high.analyse()!.rel.alpha).toBeGreaterThan(0.7);
  });
  it("is not ready before the window is full", () => {
    const an = new BandAnalyser(1, 256, true);
    feed(an, 256, 1, (t) => [Math.sin(t)]);
    expect(an.ready).toBe(false);
    expect(an.analyse()).toBeNull();
  });
  it("merges labelled band channels by name", () => {
    const rel = bandsFromLabels(["delta", "theta", "low_alpha", "high_alpha", "low_beta", "high_beta", "low_gamma", "mid_gamma"], [1, 1, 1, 1, 1, 1, 1, 1]);
    expect(rel.alpha).toBeCloseTo(0.25, 5);
    expect(rel.delta).toBeCloseTo(0.125, 5);
  });
});
