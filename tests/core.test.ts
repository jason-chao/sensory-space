import { describe, expect, it } from "vitest";
import { mulberry32, subSeed } from "../src/core/prng";
import { Store } from "../src/core/store";
import { defineParams } from "../src/core/params";
import { Sim } from "../src/core/sim";
import { Baseline, SignalBus } from "../src/signals/bus";
import { MODES, modulation } from "../src/signals/mapping";
import { Recorder, Player, parseSession, FORMAT } from "../src/record/session";
import { SCENES } from "../src/visual/scenes";
import { PALETTES } from "../src/visual/palettes";

function world() {
  const store = new Store(); defineParams(store);
  const bus = new SignalBus();
  const sim = new Sim(store, bus);
  sim.reset(777);
  return { store, bus, sim };
}
const SIG = { name: "eeg.calm", label: "c", source: "t", tau: 2, bio: true };

describe("seeded randomness", () => {
  it("repeats for the same seed and differs between labels", () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(subSeed(5, "audio")).not.toBe(subSeed(5, "sim"));
  });
});

describe("store", () => {
  it("clamps numeric parameters to their declared range", () => {
    const { store } = world();
    store.set("v.brightness", 7); expect(store.num("v.brightness")).toBe(1);
    store.set("v.brightness", -3); expect(store.num("v.brightness")).toBe(0);
    store.set("v.brightness", NaN); expect(store.num("v.brightness")).toBe(0);
  });
  it("ignores unknown or wrongly typed keys when loading", () => {
    const { store } = world();
    store.load({ nonsense: 1, scene: 5 as unknown as string, palette: "moon" });
    expect(store.get("nonsense")).toBeUndefined();
    expect(store.str("scene")).toBe("aurora");
    expect(store.str("palette")).toBe("moon");
  });
});

describe("signals", () => {
  it("baseline output stays in 0..1 and is centred on the running mean", () => {
    const b = new Baseline(); let last = 0.5;
    for (let i = 0; i < 300; i++) last = b.norm(50 + 10 * Math.sin(i / 7));
    expect(last).toBeGreaterThan(0); expect(last).toBeLessThan(1);
    const big = b.norm(1e6); expect(big).toBeLessThanOrEqual(1);
  });
  it("a stale or untrusted signal relaxes to neutral", () => {
    const bus = new SignalBus(); bus.declare(SIG);
    bus.push("eeg.calm", 1, 1, 0);
    for (let t = 0; t < 10; t += 0.1) bus.tick(0.1, t < 3 ? t : 100 + t);
    expect(Math.abs(bus.deflection("eeg.calm"))).toBeLessThan(0.05);
    bus.push("eeg.calm", 1, 0, 200);
    for (let i = 0; i < 100; i++) bus.tick(0.1, 200 + i * 0.01);
    expect(Math.abs(bus.deflection("eeg.calm"))).toBeLessThan(0.05);
  });
  it("rejects values that are not numbers", () => {
    const bus = new SignalBus(); bus.declare(SIG);
    bus.push("eeg.calm", NaN, 1, 0);
    expect(bus.signals.get("eeg.calm")!.raw).toBe(0.5);
  });
});

describe("mapping", () => {
  it("is bounded: an extreme signal moves a parameter by a limited share of its range", () => {
    for (const mode of MODES) {
      const { store, bus } = world();
      store.set("r.mode", mode.id); store.set("r.influence", 1);
      for (const r of mode.routes) bus.declare({ ...SIG, name: r.signal });
      for (const s of bus.signals.values()) { s.smooth = 1; }
      const out = new Map<string, number>(); modulation(store, bus, out);
      for (const [key, off] of out) {
        const def = store.defs.get(key)!;
        expect(Math.abs(off)).toBeLessThanOrEqual((def.max - def.min) * 0.5 * mode.maxInfluence * 1.5 + 1e-9);
      }
    }
  });
  it("only touches parameters declared reactive (never brightness or volume)", () => {
    for (const mode of MODES) for (const r of mode.routes) {
      const { store } = world();
      expect(store.defs.get(r.target)?.reactive, `${mode.id}:${r.target}`).toBe(true);
      expect(["v.brightness", "a.volume"]).not.toContain(r.target);
    }
  });
});

describe("simulation", () => {
  it("is deterministic: same seed and same inputs give the same state", () => {
    const run = () => {
      const w = world();
      for (let i = 0; i < 600; i++) {
        if (i === 100) w.store.set("scene", "ink");
        if (i === 200) w.store.set("v.speed", 0.9);
        if (i === 300) w.store.set("ease", true);
        w.sim.step();
      }
      return [w.sim.phase, w.sim.v("v.speed"), w.sim.sceneA, w.sim.mix, [...w.sim.pal]];
    };
    expect(run()).toEqual(run());
  });
  it("never lets a parameter jump: change per step is bounded by its time constant", () => {
    const w = world();
    for (let i = 0; i < 60; i++) w.sim.step();
    const before = w.sim.v("v.brightness");
    w.store.set("v.brightness", 1); w.sim.step();
    expect(Math.abs(w.sim.v("v.brightness") - before)).toBeLessThan(0.02);
  });
  it("ease lowers brightness, speed and volume", () => {
    const w = world();
    for (let i = 0; i < 300; i++) w.sim.step();
    const b = w.sim.v("v.brightness"), v = w.sim.v("a.volume");
    w.store.set("ease", true);
    for (let i = 0; i < 900; i++) w.sim.step();
    expect(w.sim.v("v.brightness")).toBeLessThan(b * 0.6);
    expect(w.sim.v("a.volume")).toBeLessThan(v * 0.7);
  });
});

describe("session recording", () => {
  it("replays to the same state as the original session", () => {
    const a = world();
    a.bus.declare(SIG);
    const rec = new Recorder(a.store, a.sim, a.bus, "test");
    for (let i = 0; i < 120; i++) a.sim.step();
    rec.start();
    for (let i = 0; i < 900; i++) {
      if (i === 50) a.store.set("scene", "lava");
      if (i === 200) a.store.set("v.density", 0.9);
      if (i === 400) a.store.set("palette", "ember");
      if (i % 60 === 0) a.bus.push("eeg.calm", 0.5 + 0.4 * Math.sin(i / 100), 1, a.sim.t);
      a.sim.step();
    }
    const file = parseSession(JSON.stringify(rec.stop()));
    expect(file.format).toBe(FORMAT);
    expect(file.containsBodySignals).toBe(true);

    const b = world();
    const player = new Player(b.store, b.sim, b.bus);
    let ended = false; player.onEnd = () => { ended = true; };
    player.start(file);
    for (let i = 0; i < 900; i++) b.sim.step();
    expect(b.store.str("scene")).toBe("lava");
    expect(b.store.str("palette")).toBe("ember");
    expect(b.sim.phase).toBeCloseTo(a.sim.phase, 6);
    expect(b.sim.v("v.density")).toBeCloseTo(a.sim.v("v.density"), 6);
    expect(b.sim.v("v.hue")).toBeCloseTo(a.sim.v("v.hue"), 3);
    b.sim.step(); b.sim.step();
    expect(ended).toBe(true);
  });
  it("leaves signals out when asked", () => {
    const a = world(); a.bus.declare(SIG);
    const rec = new Recorder(a.store, a.sim, a.bus, "test");
    rec.includeSignals = false; rec.start();
    a.bus.push("eeg.calm", 0.9, 1, a.sim.t); a.sim.step();
    const f = rec.stop()!;
    expect(f.containsBodySignals).toBe(false);
    expect(f.events.some((e) => e[1] === "sig")).toBe(false);
  });
  it("rejects files that are not sessions", () => {
    expect(() => parseSession('{"format":"other"}')).toThrow();
  });
});

describe("catalogue", () => {
  it("has unique scene and palette ids", () => {
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });
});

describe("feature switches", () => {
  it("a switch is on only for an explicit 1 or true", async () => {
    const { on } = await import("../src/core/features");
    expect(on(undefined)).toBe(false); expect(on("")).toBe(false); expect(on("0")).toBe(false); expect(on("false")).toBe(false);
    expect(on("1")).toBe(true); expect(on("true")).toBe(true);
  });
});
