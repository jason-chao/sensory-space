// Renders every scene headlessly and saves a screenshot of each: a quick visual check.
// usage: node scripts/shots.mjs [outDir] [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "shots";
const base = process.argv[3] || "http://localhost:4173/";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(base + "?test");
await page.waitForFunction(() => window.sensory && window.sensory.engine);
const ids = await page.evaluate(() => { const s = window.sensory; s.engine.autoScale = false; return [...s.store.defs.keys()].filter((k) => k.startsWith("sc.") && k.endsWith(".a")).map((k) => k.split(".")[1]); });
const failed = await page.evaluate((ids) => window.sensory.engine.compileAll(ids), ids);
console.log("scenes:", ids.length, "failed to compile:", failed);
for (const id of ids) {
  await page.evaluate((id) => { const s = window.sensory; s.store.set("scene", id); s.sim.reset(12345, 40, 40); for (let i = 0; i < 120; i++) s.stepFrame(3); }, id);
  await page.evaluate(() => window.sensory.stepFrame(1));
  await page.locator("#stage").screenshot({ path: `${out}/${id}.png` });
}
if (errors.length) console.log("errors:", errors.slice(0, 5));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
