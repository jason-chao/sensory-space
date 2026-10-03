// Automated photosensitivity check.
// Drives the real rendering pipeline through worst-case behaviour (instant parameter
// jumps, rapid scene switching, a new seed every few frames, extreme signals) and
// measures regional relative luminance of the final image on a 16x9 grid.
// A flash is counted as in WCAG 2.3.1: a pair of opposing changes in relative
// luminance of 0.1 or more, where the darker state is below 0.8.
// The check fails if any region shows more than 3 flashes in any one-second window.
// usage: node scripts/flashcheck.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:4173/";
const FPS = 60, SECONDS = 12;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(base + "?test");
await page.waitForFunction(() => window.sensory && window.sensory.engine);

const cases = {
  "normal play, every scene": `(s, f, ids) => { if (f % 240 === 0) s.store.set("scene", ids[(f / 240) % ids.length]); }`,
  "brightness slammed 0/1 at 7.5 Hz": `(s, f) => { if (f % 4 === 0) s.store.set("v.brightness", (f / 4) % 2); }`,
  "scene switched every 100 ms": `(s, f, ids) => { if (f % 6 === 0) s.store.set("scene", ids[(f / 6) % ids.length]); }`,
  "new variation requested every 3 frames": `(s, f) => { if (f % 3 === 0) s.store.set("variation", f); }`,
  "pattern replaced abruptly at 6 Hz, limiter alone": `(s, f) => { if (f % 10 === 0) s.sim.visSeedA = (f * 7.919) % 100; }`,
  "touch at a random place every frame": `(s, f) => { s.store.set("touch", ((f * 0.37) % 1).toFixed(3) + "," + ((f * 0.61) % 1).toFixed(3) + "," + f); }`,
  "calm, sound-only and hold-still toggled every 5 frames": `(s, f) => { if (f % 5 === 0) { s.store.set("calm", (f / 5) % 2 === 0); s.store.set("v.blank", (f / 5) % 3 === 0); s.store.set("freeze", (f / 5) % 2 === 1); } }`,
  "fast drag back and forth every frame": `(s, f) => { s.store.set("scene", "lava"); s.store.set("drag", (0.5 + 0.45 * Math.sin(f * 0.8)).toFixed(3) + "," + (0.5 + 0.4 * Math.cos(f * 0.6)).toFixed(3) + "," + f); }`,
  "all controls randomised every 2 frames": `(s, f) => { if (f % 2 === 0) for (const d of s.store.defs.values()) if (d.key.startsWith("v.") || d.key.startsWith("sc.")) s.store.set(d.key, d.min + (d.max - d.min) * ((Math.sin(f * 12.9898 + d.key.length * 78.233) * 43758.5453) % 1 + 1) % 1); }`,
  "palette switched every 2 frames, vivid": `(s, f) => { s.store.set("v.brightness", 1); s.store.set("v.saturation", 1); const p = ["sunset", "moon", "ember", "pastel", "deepsea"]; if (f % 2 === 0) s.store.set("palette", p[(f / 2) % p.length]); }`,
};

cases["CONTROL: limiter bypassed, brightness slammed (must be detected)"] = `(s, f) => { s.engine.bypassLimiter = true; if (f % 4 === 0) s.store.defs.get("v.brightness").tau = 0.001, s.store.set("v.brightness", (f / 4) % 2); }`;

let failed = false;
for (const [name, fn] of Object.entries(cases)) {
  const frames = await page.evaluate(({ fn, n }) => {
    const s = window.sensory; s.engine.autoScale = false; s.engine.bypassLimiter = false;
    const ids = [...s.store.defs.keys()].filter((k) => k.startsWith("sc.") && k.endsWith(".a")).map((k) => k.split(".")[1]);
    for (const d of s.store.defs.values()) s.store.set(d.key, d.def);
    s.store.set("v.brightness", 1); s.store.set("scene", "ink"); s.store.set("palette", "pastel");
    s.sim.reset(4242, 30, 30);
    for (let i = 0; i < 300; i++) s.stepFrame(1);   // settle
    const drive = eval(fn); const out = [];
    for (let f = 0; f < n; f++) { drive(s, f, ids); out.push(s.stepFrame(1)); }
    return out;
  }, { fn, n: FPS * SECONDS });

  // count flashes per region
  let worst = 0, maxStep = 0;
  const cells = frames[0].length;
  for (let c = 0; c < cells; c++) {
    const transitions = []; // frame index of each completed change of 0.1 or more
    let lo = frames[0][c], hi = lo, dir = 0;
    for (let f = 1; f < frames.length; f++) {
      const v = frames[f][c];
      maxStep = Math.max(maxStep, Math.abs(v - frames[f - 1][c]));
      if (dir >= 0) { hi = Math.max(hi, v); if (hi - v >= 0.1 && v < 0.8) { transitions.push([f, -1]); dir = -1; lo = v; continue; } }
      if (dir <= 0) { lo = Math.min(lo, v); if (v - lo >= 0.1 && lo < 0.8) { transitions.push([f, 1]); dir = 1; hi = v; } }
    }
    // a flash = two opposing transitions; count flashes in any sliding one-second window
    for (let i = 0; i < transitions.length; i++) {
      let k = 0;
      for (let j = i; j < transitions.length && transitions[j][0] - transitions[i][0] < FPS; j++) k++;
      worst = Math.max(worst, Math.floor(k / 2));
    }
  }
  const control = name.startsWith("CONTROL");
  const ok = control ? worst > 3 : worst <= 3;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: worst ${worst} flashes in 1 s; largest regional step per frame ${maxStep.toFixed(4)} (${(maxStep * FPS).toFixed(2)}/s)`);
}
await browser.close();
process.exit(failed ? 1 : 0);
