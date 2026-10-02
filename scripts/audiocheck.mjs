// Loudness check: every voice at full level, volume at maximum, activity at maximum.
// The output peak must stay under the ceiling of the master chain (0.85 of full scale),
// and the sound must not be silent.
// usage: node scripts/audiocheck.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:4173/";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto(base + "?test");
await page.waitForFunction(() => window.sensory && window.sensory.engine);
const res = await page.evaluate(async () => {
  const s = window.sensory;
  for (const d of s.store.defs.values()) if (d.key.startsWith("a.voice.")) s.store.set(d.key, 1);
  s.store.set("a.volume", 1); s.store.set("a.activity", 1); s.store.set("a.soften", 0); s.store.set("a.tone", 1);
  await s.audio.start();
  const t0 = performance.now(); let peak = 0, early = 0; const voicesAt = [];
  while (performance.now() - t0 < 20000) {
    for (let i = 0; i < 6; i++) s.sim.step();
    if (Math.random() < 0.2) s.audio.touch(Math.random(), Math.random());
    const p = s.audio.peak(); peak = Math.max(peak, p);
    if (performance.now() - t0 < 500) early = Math.max(early, p);
    await new Promise((r) => setTimeout(r, 100));
  }
  return { peak, early, state: s.audio.ctx.state };
});
console.log(`context ${res.state}; peak in first 0.5 s ${res.early.toFixed(3)}; peak over 20 s at maximum settings ${res.peak.toFixed(3)}`);
const ok = res.state === "running" && res.peak > 0.02 && res.peak <= 0.86 && res.early < 0.2;
console.log(ok ? "PASS" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
