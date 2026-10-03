import "./ui/style.css";
import { Store, type Value } from "./core/store";
import { defineParams, PROFILES, SOUNDSCAPES } from "./core/params";
import { VOICES } from "./audio/voicelist";
import { Sim, STEP } from "./core/sim";
import { newSeed } from "./core/prng";
import { SignalBus } from "./signals/bus";
import { EegBridgeSource, DemoSource, defaultBridgeUrl, type SignalSource } from "./signals/sources";
import { VisualEngine } from "./visual/engine";
import { SCENES } from "./visual/scenes";
import { PALETTES } from "./visual/palettes";
import { AudioEngine } from "./audio/engine";
import { Recorder, Player, parseSession, downloadJson } from "./record/session";
import { buildUi, type Ui } from "./ui/panel";

const VERSION = "0.5.0";
const LS_STATE = "sensory.state", LS_PRESETS = "sensory.presets", LS_URL = "sensory.bridgeUrl";
/** never restored from storage: a session always starts un-calmed, un-muted, same seed rules */
const TRANSIENT = new Set(["ease", "a.mute", "freeze", "v.blank", "touch", "variation"]);

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } },
};

export class App {
  store = new Store();
  bus = new SignalBus();
  sim: Sim;
  engine!: VisualEngine;
  audio: AudioEngine;
  recorder: Recorder;
  player: Player;
  sources: { eeg: EegBridgeSource; demo: DemoSource };
  panelEl: HTMLElement | null = null;
  readonly version = VERSION;
  ui!: Ui;
  private started = false;
  stopped = false;
  private touchN = 0;
  private lastTouch = 0;
  private stopEl: HTMLElement | null = null;

  constructor(private test: boolean) {
    defineParams(this.store);
    this.sim = new Sim(this.store, this.bus);
    const now = () => this.sim.t;
    this.sources = { eeg: new EegBridgeSource(this.bus, now), demo: new DemoSource(this.bus, now) };
    this.sources.eeg.url = ls.get(LS_URL, "") || defaultBridgeUrl();
    if (!test) this.store.load(ls.get<Record<string, Value>>(LS_STATE, {}), "system", (k) => TRANSIENT.has(k));
    if (!test && !localStorage.getItem(LS_STATE) && matchMedia("(prefers-reduced-motion: reduce)").matches) this.store.set("v.speed", 0.25, "system");
    this.sim.reset(test ? 12345 : newSeed());
    this.audio = new AudioEngine(this.sim);
    this.recorder = new Recorder(this.store, this.sim, this.bus, VERSION);
    this.player = new Player(this.store, this.sim, this.bus);
    this.player.onEnd = () => this.ui.toast("Replay finished");
    this.store.onChange((key, value) => {
      if (key !== "touch") return;
      const [x, y] = String(value).split(",").map(Number);
      this.audio.touch(x, y);
    });
    let saveTimer = 0;
    this.store.onChange((_k, _v, origin) => {
      if (origin === "replay" || test) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => ls.set(LS_STATE, this.store.snapshot()), 800);
    });
  }

  mount(): void {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    const root = document.getElementById("ui")!;
    try {
      this.engine = new VisualEngine(canvas, this.sim);
    } catch (e) {
      root.textContent = `Sensory Space needs WebGL2, which this browser does not provide. (${(e as Error).message})`;
      root.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center";
      return;
    }
    this.sim.onSceneSettled = () => this.engine.promoteSlot();
    this.ui = buildUi(this, root);
    this.bindInput();
    if (this.test) return;
    this.ui.showStart((fullscreen) => {
      this.started = true;
      void this.audio.start();
      if (fullscreen) this.toggleFullscreen();
      void this.keepAwake();
    });
    let last = performance.now();
    const frame = (nowMs: number) => {
      const dt = Math.min(0.25, (nowMs - last) / 1000);
      last = nowMs;
      if (!this.stopped) {
        this.sim.advance(dt);
        this.sources.demo.tick();
        this.engine.render(dt);
        this.engine.reportFrame(dt * 1000, nowMs);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { last = performance.now(); void this.keepAwake(); if (this.started) this.audio.resume(); }
    });
    // a lost graphics context (driver reset, sleep) is rebuilt instead of leaving a dead screen
    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextrestored", () => { this.engine = new VisualEngine(canvas, this.sim); });
  }

  private async keepAwake(): Promise<void> {
    if (!this.started || !("wakeLock" in navigator)) return;
    try { await navigator.wakeLock.request("screen"); } catch { /* not available on insecure origins */ }
  }

  private bindInput(): void {
    let idleTimer = 0, travel = 0, lastX = -1, lastY = -1;
    const wakeUi = () => {
      document.body.classList.remove("idle");
      travel = 0;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (!this.panelEl?.classList.contains("open") && this.started) document.body.classList.add("idle");
      }, 4000);
    };
    for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, wakeUi, { passive: true });
    // a resting mouse can jitter by a pixel or two; only real movement brings the controls back
    window.addEventListener("mousemove", (e) => {
      if (lastX >= 0) travel += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      if (!document.body.classList.contains("idle")) { wakeUi(); return; }
      if (travel > 60) wakeUi();
    }, { passive: true });
    wakeUi();
    window.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" && (e.target as HTMLInputElement).type === "text") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (k === "e") this.toggleEase();
      else if (k === "arrowright") this.stepScene(1);
      else if (k === "arrowleft") this.stepScene(-1);
      else if (k === "arrowup") { e.preventDefault(); this.nudge("a.volume", 0.05); }
      else if (k === "arrowdown") { e.preventDefault(); this.nudge("a.volume", -0.05); }
      else if (k === "c") this.stepPalette(1);
      else if (k === "v") this.stepPalette(-1);
      else if (k === "]") this.stepSoundscape(1);
      else if (k === "[") this.stepSoundscape(-1);
      else if (k === "+" || k === "=") this.nudge("v.speed", 0.1);
      else if (k === "-" || k === "_") this.nudge("v.speed", -0.1);
      else if (k === "x" || k === "backspace") this.toggleStop();
      else if (k === "p") this.store.set("freeze", !this.store.bool("freeze"));
      else if (k === "b") this.store.set("v.blank", !this.store.bool("v.blank"));
      else if (k === "f") this.toggleFullscreen();
      else if (k === "m") this.store.set("a.mute", !this.store.bool("a.mute"));
      else if (k === "s") this.togglePanel();
      else if (k === "h") this.toggleBar();
      else if (k === "escape") this.panelEl?.classList.remove("open");
    });
    const stage = document.getElementById("stage")!;
    stage.addEventListener("pointerdown", (e) => {
      if (!this.started || this.stopped || this.player.active) return;
      if (this.panelEl?.classList.contains("open")) { this.panelEl.classList.remove("open"); return; }
      const now = performance.now();
      if (now - this.lastTouch < 180) return;
      this.lastTouch = now;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
      this.store.set("touch", `${x.toFixed(3)},${y.toFixed(3)},${this.touchN++}`);
    });
  }

  // --- actions -------------------------------------------------------------
  /** Ease: temporarily dimmer, slower and quieter, on top of the current settings, until pressed again */
  toggleEase(): void {
    const on = !this.store.bool("ease");
    this.store.set("ease", on);
    this.ui.toast(on ? "Ease on: dimmer, slower and quieter" : "Ease off");
  }
  nudge(key: string, delta: number): void {
    this.store.set(key, this.store.num(key) + delta);
    const def = this.store.defs.get(key)!;
    this.ui.toast(`${def.label}: ${Math.round(((this.store.num(key) - def.min) / (def.max - def.min)) * 100)}`);
  }
  stepPalette(d: number): void {
    const i = PALETTES.findIndex((p) => p.id === this.store.str("palette"));
    const next = PALETTES[(i + d + PALETTES.length) % PALETTES.length];
    this.store.set("palette", next.id);
    this.ui.toast(next.label);
  }
  /** Stop: black and silent at once. Overrides every setting, mapping and transition. */
  toggleStop(): void {
    if (!this.started) return;
    this.stopped = !this.stopped;
    this.audio.setStopped(this.stopped);
    if (this.stopped) {
      this.stopEl = document.createElement("div");
      this.stopEl.className = "stopped";
      const b = document.createElement("button");
      b.textContent = "Resume"; b.onclick = () => this.toggleStop();
      this.stopEl.append(b);
      document.body.append(this.stopEl);
      b.focus();
    } else {
      this.stopEl?.remove(); this.stopEl = null;
      this.engine.resetLimiter();   // the picture returns as a slow fade from black
    }
  }
  togglePanel(): void { this.panelEl?.classList.toggle("open"); }
  /** hide the control bar until asked for again; keys keep working */
  toggleBar(): void {
    const hidden = document.body.classList.toggle("bar-hidden");
    if (hidden) this.ui.toast("Controls hidden. Press H or the corner mark to show them");
  }
  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => this.ui.toast("Full screen is not available here"));
  }
  stepScene(d: number): void {
    const i = SCENES.findIndex((s) => s.id === this.store.str("scene"));
    const next = SCENES[(i + d + SCENES.length) % SCENES.length];
    this.store.set("scene", next.id);
    this.ui.toast(next.label);
  }
  newVariation(): void {
    if (this.player.active) { this.ui.toast("Not available during a replay"); return; }
    this.store.set("variation", newSeed() % 1000000);
  }

  setBridgeUrl(url: string): void {
    this.sources.eeg.url = url || defaultBridgeUrl();
    ls.set(LS_URL, url);
  }
  toggleSource(id: "eeg" | "demo"): void {
    if (this.player.active) { this.ui.toast("Stop the replay first"); return; }
    const src: SignalSource = this.sources[id];
    const other: SignalSource = this.sources[id === "demo" ? "eeg" : "demo"];
    if (src.status === "off") { if (other.status !== "off") other.disconnect(); src.connect(); }
    else src.disconnect();
  }

  toggleRecording(): void {
    if (this.recorder.active) {
      const f = this.recorder.stop();
      if (f) {
        const stamp = f.createdAt.replace(/[-:]/g, "").slice(0, 13);
        downloadJson(f, `sensory-session-${stamp}.json`);
        this.ui.toast(f.containsBodySignals ? "Session saved. It includes body-signal data: share it with care." : "Session saved to this device");
      }
    } else {
      this.recorder.start();
      this.ui.toast("Recording started");
    }
  }
  playSession(text: string): void {
    try {
      const f = parseSession(text);
      if (this.recorder.active) this.recorder.stop();
      this.sources.eeg.disconnect(); this.sources.demo.disconnect();
      this.player.start(f);
      this.audio.reseed(f.seed);
      this.ui.refresh();
      this.ui.toast("Replaying session");
    } catch (e) {
      this.ui.toast((e as Error).message);
    }
  }
  stopReplay(): void { this.player.stop(); this.ui.toast("Replay stopped"); }

  /** which soundscape the layer levels currently match, if any */
  currentSoundscape(): string | null {
    for (const sc of SOUNDSCAPES) {
      const ok = VOICES.every((v) => Math.abs(this.store.num(`a.voice.${v.id}`) - (sc.layers[v.id] ?? 0)) < 0.005);
      if (ok && this.store.str("a.scale") === sc.scale) return sc.id;
    }
    return null;
  }
  applySoundscape(id: string): void {
    const sc = SOUNDSCAPES.find((s) => s.id === id);
    if (!sc) return;
    for (const v of VOICES) this.store.set(`a.voice.${v.id}`, sc.layers[v.id] ?? 0);
    this.store.set("a.scale", sc.scale);
  }
  /** step through the named soundscapes; a hand-made mix is left for the first named one */
  stepSoundscape(d: number): void {
    const cur = this.currentSoundscape();
    const i = SOUNDSCAPES.findIndex((s) => s.id === cur);
    const next = cur === null ? SOUNDSCAPES[d > 0 ? 0 : SOUNDSCAPES.length - 1] : SOUNDSCAPES[(i + d + SOUNDSCAPES.length) % SOUNDSCAPES.length];
    this.applySoundscape(next.id);
    this.ui.toast(cur === null ? `${next.label} (the hand-made mix was replaced)` : `${next.label}: ${next.blurb}`);
  }
  currentProfile(): string | null {
    for (const p of PROFILES) if (Object.entries(p.set).every(([k, v]) => Math.abs(this.store.num(k) - v) < 0.005)) return p.id;
    return null;
  }
  resetDefaults(): void {
    for (const d of this.store.defs.values()) this.store.set(d.key, d.def);
    this.store.set("scene", "aurora"); this.store.set("palette", "spectrum"); this.store.set("a.scale", "pentaMinor"); this.store.set("r.mode", "gentle");
    this.ui.toast("Everything is back to the defaults");
  }

  presets(): Record<string, Record<string, Value>> { return ls.get(LS_PRESETS, {}); }
  savePreset(name: string): void { ls.set(LS_PRESETS, { ...this.presets(), [name]: this.store.snapshot() }); }
  loadPreset(name: string): void { const p = this.presets()[name]; if (p) this.store.load(p, "user", (k) => TRANSIENT.has(k)); }
  deletePreset(name: string): void { const p = this.presets(); delete p[name]; ls.set(LS_PRESETS, p); }

  // --- test hook -----------------------------------------------------------
  /** advance exactly n simulation steps, render one frame, return regional luminance */
  stepFrame(n = 1): number[] {
    for (let i = 0; i < n; i++) this.sim.step();
    this.engine.render(n * STEP);
    return this.engine.readLuma();
  }
}

const test = new URLSearchParams(location.search).has("test");
const app = new App(test);
app.mount();
if (test) (window as unknown as { sensory: App }).sensory = app;
