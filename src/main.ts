import "./ui/style.css";
import { Store, type Value } from "./core/store";
import { defineParams, PROFILES, SOUNDSCAPES } from "./core/params";
import { LAYERS, SoundEngine, type TouchSound } from "sensory-sound";
import { Sim, STEP } from "./core/sim";
import { newSeed } from "./core/prng";
import { SignalBus } from "./signals/bus";
import { EegBridgeSource, DemoSource, defaultBridgeUrl, type SignalSource } from "./signals/sources";
import { VisualEngine } from "./visual/engine";
import { VISIBLE_SCENES } from "./visual/scenes";
import { PALETTES } from "./visual/palettes";
import { Recorder, Player, parseSession, downloadJson } from "./record/session";
import { buildUi, type Ui } from "./ui/panel";
import { FEATURES } from "./core/features";
import * as analytics from "./analytics";

/** the sound a tap makes, matched to what the scene does with it */
const TOUCH_SOUNDS: Record<string, TouchSound> = {
  threads: "pluck", bubbles: "pop", ink: "drop", waves: "drop", ripples: "drop", orb: "drop",
  flowers: "burst", dots: "split", lava: "thump",
};

const VERSION = "0.10.0";
const LS_STATE = "sensory.state", LS_PRESETS = "sensory.presets", LS_URL = "sensory.bridgeUrl";
/** never restored from storage: a session always starts un-calmed, un-muted, same seed rules */
const TRANSIENT = new Set(["ease", "a.mute", "freeze", "v.blank", "touch", "drag", "variation"]);

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } },
};

export class App {
  store = new Store();
  bus = new SignalBus();
  sim: Sim;
  engine!: VisualEngine;
  audio: SoundEngine;
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
  private dragging = false;
  private lastDrag = 0;
  private dragN = 0;
  private stopEl: HTMLElement | null = null;
  /** how a change was made, for the usage counts; set by the caller just before the store changes */
  via: "bar" | "panel" | "key" | "auto" | "replay" | "touch" | "" = "";
  private usage = { startedAt: 0, sceneSince: 0, paletteSince: 0, touches: 0, drags: 0, touchScene: "", scenes: new Set<string>(), frames: 0, frameMs: 0 };
  private debounce = analytics.debouncer(1500);
  private inputSince = 0; private inputGood = 0; private inputTicks = 0;
  /** while a soundscape or preset applies several settings at once, the individual changes are not counted */
  private quiet = false;

  constructor(private test: boolean) {
    defineParams(this.store);
    this.sim = new Sim(this.store, this.bus);
    const now = () => this.sim.t;
    this.sources = { eeg: new EegBridgeSource(this.bus, now), demo: new DemoSource(this.bus, now) };
    this.sources.eeg.url = ls.get(LS_URL, "") || defaultBridgeUrl();
    if (!test) this.store.load(ls.get<Record<string, Value>>(LS_STATE, {}), "system", (k) => TRANSIENT.has(k));
    if (!test && !localStorage.getItem(LS_STATE) && matchMedia("(prefers-reduced-motion: reduce)").matches) this.store.set("v.speed", 0.25, "system");
    this.sim.reset(test ? 12345 : newSeed());
    this.audio = new SoundEngine({ seed: this.sim.seed });
    window.setInterval(() => this.feedSound(), 50);
    this.recorder = new Recorder(this.store, this.sim, this.bus, VERSION);
    this.recorder.includeSignals = FEATURES.input;
    this.player = new Player(this.store, this.sim, this.bus);
    this.player.onEnd = () => this.ui.toast("Replay finished");
    this.store.onChange((key, value) => {
      if (key !== "touch") return;
      const [x, y] = String(value).split(",").map(Number);
      this.audio.touch(x, y, TOUCH_SOUNDS[this.store.str("scene")] ?? "bell");
    });
    if (!test && analytics.init()) this.bindUsage();
    let saveTimer = 0;
    this.store.onChange((_k, _v, origin) => {
      if (origin === "replay" || test) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => ls.set(LS_STATE, this.store.snapshot()), 800);
    });
  }

  /** anonymous usage counts; see src/analytics.ts for the locks and docs/RESEARCH.md for the policy */
  private bindUsage(): void {
    const t = analytics.track;
    const now = () => Math.round((performance.now() - this.usage.startedAt) / 1000);
    const via = (origin: string) => (origin === "replay" ? "replay" : origin === "system" ? "auto" : this.via || "panel");
    this.store.onChange((key, value, origin) => {
      if (!this.started || this.quiet) return;
      const v = via(origin);
      if (key === "scene") {
        const s = String(value); this.usage.scenes.add(s);
        t("scene", { scene: s, via: v, previous_seconds: Math.round((performance.now() - this.usage.sceneSince) / 1000) });
        this.usage.sceneSince = performance.now();
      } else if (key === "palette") {
        t("palette", { palette: String(value), via: v, previous_seconds: Math.round((performance.now() - this.usage.paletteSince) / 1000) });
        this.usage.paletteSince = performance.now();
      } else if (key === "touch") {
        this.usage.touches++; this.usage.touchScene = this.store.str("scene");
      } else if (key === "drag") {
        this.usage.drags++;
      } else if (key === "variation") {
        t("control", { name: "variation", via: v });
      } else if (key === "ease" || key === "freeze" || key === "v.blank" || key === "a.mute" || key === "ui.iconsOnly") {
        const names: Record<string, string> = { ease: "ease", freeze: "hold-still", "v.blank": "picture-off", "a.mute": "mute", "ui.iconsOnly": "icons-only" };
        t("control", { name: names[key], on: value === true, via: v });
      } else if (key.startsWith("a.voice.")) {
        this.debounce(key, () => t("layer", { layer: key.slice(8), level: Math.round(Number(value) * 100), via: v }));
      } else if (key.startsWith("drift.")) {
        this.debounce("changes", () => t("changes", { scene_minutes: this.store.num("drift.minutes"), palette_minutes: this.store.num("drift.colourMinutes"), rotation_minutes: this.store.num("drift.hueMinutes"), delay_minutes: this.store.num("drift.delay"), via: v }));
      } else if (key === "a.scale" || key === "r.mode") {
        t("adjust", { parameter: key, value: String(value), via: v });
      } else if (typeof value === "number" && this.store.defs.has(key) && !key.startsWith("sc.")) {
        const def = this.store.defs.get(key)!;
        this.debounce(key, () => t("adjust", { parameter: key, value: Math.round(((this.store.num(key) - def.min) / (def.max - def.min)) * 100), via: v }));
      }
      this.via = "";
    });
    // touches, aggregated once a minute
    window.setInterval(() => {
      if (this.usage.touches || this.usage.drags) { t("touch", { count: this.usage.touches, drag_seconds: Math.round(this.usage.drags / 12), scene: this.usage.touchScene || this.store.str("scene") }); this.usage.touches = 0; this.usage.drags = 0; }
    }, 60000);
    // dwell: a pulse every two minutes while the page is showing
    window.setInterval(() => {
      if (!this.started || document.visibilityState !== "visible") return;
      t("pulse", { minutes: Math.round(now() / 60), scene: this.store.str("scene"), soundscape: this.currentSoundscape() ?? "custom", fullscreen: !!document.fullscreenElement, stopped: this.stopped, eased: this.store.bool("ease") });
    }, 120000);
    // once, after a minute: whether the machine copes
    window.setTimeout(() => {
      if (this.started && this.usage.frames) t("perf", { frame_ms: Math.round((this.usage.frameMs / this.usage.frames) * 10) / 10, render_scale: Math.round(this.engine.scale * 100) / 100, screen_class: analytics.screenClass(screen.width * devicePixelRatio) });
    }, 60000);
    document.addEventListener("fullscreenchange", () => { if (this.started) t("control", { name: "full-screen", on: !!document.fullscreenElement }); });
    const leave = () => {
      if (!this.started) return;
      if (this.usage.touches) { t("touch", { count: this.usage.touches, scene: this.usage.touchScene }); this.usage.touches = 0; }
      t("leave", { minutes: Math.round(now() / 60), scenes_seen: this.usage.scenes.size, last_scene: this.store.str("scene"), soundscape: this.currentSoundscape() ?? "custom" });
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });
  }

  /** called when the person presses Begin */
  private usageBegin(fullscreen: boolean, profile: string): void {
    this.usage.startedAt = performance.now(); this.usage.sceneSince = this.usage.paletteSince = performance.now();
    this.usage.scenes.add(this.store.str("scene"));
    analytics.track("begin", {
      profile: profile || "unchanged", fullscreen, scene: this.store.str("scene"), palette: this.store.str("palette"), soundscape: this.currentSoundscape() ?? "custom",
      reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches, touch_capable: navigator.maxTouchPoints > 0,
      screen_w: screen.width, screen_h: screen.height, pixel_ratio: Math.round(devicePixelRatio * 100) / 100, screen_class: analytics.screenClass(screen.width * devicePixelRatio),
      language: navigator.language, returning: !!localStorage.getItem("sensory.state"),
    });
  }

  /** the sound engine follows the simulation's smoothed values */
  private feedSound(): void {
    const sim = this.sim, store = this.store;
    this.audio.set({
      volume: sim.v("a.volume"), soften: sim.v("a.soften"), reverb: sim.v("a.reverb"), tone: sim.v("a.tone"), activity: sim.v("a.activity"),
      pulseRate: sim.v("a.pulseRate"), breath: sim.breath, root: store.num("a.root"), scale: store.str("a.scale"), mute: store.bool("a.mute"),
    });
    for (const l of LAYERS) this.audio.setLayer(l.id, sim.v(`a.voice.${l.id}`));
  }

  mount(): void {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    const root = document.getElementById("ui")!;
    try {
      this.engine = new VisualEngine(canvas, this.sim);
    } catch (e) {
      root.textContent = `Sensory Space needs WebGL2, which this browser does not provide. (${(e as Error).message})`;
      analytics.track("perf", { webgl2: false });
      root.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center";
      return;
    }
    this.sim.onSceneSettled = () => this.engine.promoteSlot();
    this.ui = buildUi(this, root);
    this.bindInput();
    if (this.test) return;
    document.body.classList.add("pre");   // before the first tap: picture only, no bar
    this.ui.showStart((fullscreen, profile) => {
      this.started = true;
      document.body.classList.remove("pre");
      this.usageBegin(fullscreen, profile);
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
        if (this.sources.eeg.status === "live" || this.sources.demo.status === "live") { this.inputTicks++; if (this.sources.eeg.detail.startsWith("Good") || this.sources.demo.status === "live") this.inputGood++; }
        this.engine.render(dt);
        this.engine.reportFrame(dt * 1000, nowMs);
        this.usage.frames++; this.usage.frameMs += dt * 1000;
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

  private wake: WakeLockSentinel | null = null;
  /** "held", "unavailable" (no API or insecure page), "released" (stopped or hidden), "off" (not started) */
  wakeState: "off" | "held" | "unavailable" | "released" = "off";

  private async keepAwake(): Promise<void> {
    if (!this.started || this.stopped || document.visibilityState !== "visible") return;
    if (!("wakeLock" in navigator) || !window.isSecureContext) { this.wakeState = "unavailable"; return; }
    if (this.wake && !this.wake.released) return;
    try {
      this.wake = await navigator.wakeLock.request("screen");
      this.wakeState = "held";
      this.wake.addEventListener("release", () => { if (this.wakeState === "held") this.wakeState = "released"; });
    } catch { this.wakeState = "unavailable"; }
  }

  private async letSleep(): Promise<void> {
    if (this.wake && !this.wake.released) { try { await this.wake.release(); } catch { /* ignore */ } }
    this.wake = null;
    if (this.wakeState === "held") this.wakeState = "released";
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
      this.via = "key";
      if (k === "e") this.toggleEase("key");
      else if (k === "arrowright") this.stepScene(1, "key");
      else if (k === "arrowleft") this.stepScene(-1, "key");
      else if (k === "arrowup") { e.preventDefault(); this.nudge("a.volume", 0.05, "key"); }
      else if (k === "arrowdown") { e.preventDefault(); this.nudge("a.volume", -0.05, "key"); }
      else if (k === "c") this.stepPalette(1, "key");
      else if (k === "v") this.stepPalette(-1, "key");
      else if (k === "]") this.stepSoundscape(1, "key");
      else if (k === "[") this.stepSoundscape(-1, "key");
      else if (k === "+" || k === "=") this.nudge("v.speed", 0.1, "key");
      else if (k === "-" || k === "_") this.nudge("v.speed", -0.1, "key");
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
      if (this.stopped || this.player.active) return;
      if (this.panelEl?.classList.contains("open")) { this.panelEl.classList.remove("open"); return; }
      const now = performance.now();
      if (now - this.lastTouch < 180) return;
      this.lastTouch = now;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
      this.store.set("touch", `${x.toFixed(3)},${y.toFixed(3)},${this.touchN++}`);
      this.dragging = true; this.lastDrag = 0;
      try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    // press and drag: the finger's path reaches the scenes as a wake (about 12 samples a second)
    stage.addEventListener("pointermove", (e) => {
      if (!this.dragging || this.stopped || this.player.active) return;
      const now = performance.now();
      if (now - this.lastDrag < 80) return;
      this.lastDrag = now;
      const r = stage.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      this.store.set("drag", `${x.toFixed(3)},${y.toFixed(3)},${this.dragN++}`);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(ev, () => { this.dragging = false; });
  }

  // --- actions -------------------------------------------------------------
  /** Ease: temporarily dimmer, slower and quieter, on top of the current settings, until pressed again */
  toggleEase(via: "bar" | "key" = "bar"): void {
    this.via = via;
    const on = !this.store.bool("ease");
    this.store.set("ease", on);
    this.ui.toast(on ? "Ease on: dimmer, slower and quieter" : "Ease off");
  }
  nudge(key: string, delta: number, via: "bar" | "key" = "bar"): void {
    this.via = via;
    this.store.set(key, this.store.num(key) + delta);
    const def = this.store.defs.get(key)!;
    this.ui.toast(`${def.label}: ${Math.round(((this.store.num(key) - def.min) / (def.max - def.min)) * 100)}`);
  }
  stepPalette(d: number, via: "bar" | "key" = "bar"): void {
    this.via = via;
    const i = PALETTES.findIndex((p) => p.id === this.store.str("palette"));
    const next = PALETTES[(i + d + PALETTES.length) % PALETTES.length];
    this.store.set("palette", next.id);
    this.ui.toast(next.label);
  }
  /** Stop: black and silent at once. Overrides every setting, mapping and transition. */
  toggleStop(): void {
    if (!this.started) return;
    this.stopped = !this.stopped;
    analytics.track("control", { name: "stop", on: this.stopped });
    this.audio.setStopped(this.stopped);
    // a black screen may sleep; it wakes again on resume
    if (this.stopped) void this.letSleep(); else void this.keepAwake();
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
    analytics.track("control", { name: "hide-bar", on: hidden });
    if (hidden) this.ui.toast("Controls hidden. Press H or the corner mark to show them");
  }
  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => this.ui.toast("Full screen is not available here"));
  }
  stepScene(d: number, via: "bar" | "key" = "bar"): void {
    this.via = via;
    const i = VISIBLE_SCENES.findIndex((s) => s.id === this.store.str("scene"));
    const next = VISIBLE_SCENES[(i + d + VISIBLE_SCENES.length) % VISIBLE_SCENES.length];
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
    if (!FEATURES.input) return;
    if (this.player.active) { this.ui.toast("Stop the replay first"); return; }
    const src: SignalSource = this.sources[id];
    const other: SignalSource = this.sources[id === "demo" ? "eeg" : "demo"];
    if (src.status === "off") {
      if (other.status !== "off") other.disconnect();
      src.connect();
      this.inputSince = performance.now(); this.inputGood = 0; this.inputTicks = 0;
      analytics.track("input", { action: "connect", source: id, mode: this.store.str("r.mode"), influence: Math.round(this.store.num("r.influence") * 100) });
    } else {
      src.disconnect();
      analytics.track("input", { action: "disconnect", source: id, mode: this.store.str("r.mode"), influence: Math.round(this.store.num("r.influence") * 100),
        minutes: Math.round((performance.now() - this.inputSince) / 60000), good_share: this.inputTicks ? Math.round((this.inputGood / this.inputTicks) * 100) : 0 });
    }
  }

  toggleRecording(): void {
    if (this.recorder.active) {
      const f = this.recorder.stop();
      if (f) {
        analytics.track("session", { action: "saved", minutes: Math.round(f.duration / 60), with_signals: f.containsBodySignals });
        const stamp = f.createdAt.replace(/[-:]/g, "").slice(0, 13);
        downloadJson(f, `sensory-session-${stamp}.json`);
        this.ui.toast(f.containsBodySignals ? "Session saved. It includes body-signal data: share it with care." : "Session saved to this device");
      }
    } else {
      this.recorder.start();
      analytics.track("session", { action: "record" });
      this.ui.toast("Recording started");
    }
  }
  playSession(text: string): void {
    try {
      const f = parseSession(text);
      if (this.recorder.active) this.recorder.stop();
      this.sources.eeg.disconnect(); this.sources.demo.disconnect();
      this.player.start(f);
      analytics.track("session", { action: "replay", minutes: Math.round(f.duration / 60) });
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
      const ok = LAYERS.every((l) => Math.abs(this.store.num(`a.voice.${l.id}`) - (sc.layers[l.id] ?? 0)) < 0.005);
      if (ok && this.store.str("a.scale") === sc.scale) return sc.id;
    }
    return null;
  }
  applySoundscape(id: string): void {
    const sc = SOUNDSCAPES.find((s) => s.id === id);
    if (!sc) return;
    if (this.via !== "bar" && this.via !== "key") analytics.track("soundscape", { soundscape: id, via: "panel", from_custom: this.currentSoundscape() === null });
    this.quiet = true;
    for (const l of LAYERS) this.store.set(`a.voice.${l.id}`, sc.layers[l.id] ?? 0);
    this.store.set("a.scale", sc.scale);
    this.quiet = false;
  }
  /** step through the named soundscapes; a hand-made mix is left for the first named one */
  stepSoundscape(d: number, via: "bar" | "key" = "bar"): void {
    const cur = this.currentSoundscape();
    const i = SOUNDSCAPES.findIndex((s) => s.id === cur);
    const next = cur === null ? SOUNDSCAPES[d > 0 ? 0 : SOUNDSCAPES.length - 1] : SOUNDSCAPES[(i + d + SOUNDSCAPES.length) % SOUNDSCAPES.length];
    this.applySoundscape(next.id);
    analytics.track("soundscape", { soundscape: next.id, via, from_custom: cur === null });
    this.ui.toast(cur === null ? `${next.label} (the hand-made mix was replaced)` : `${next.label}: ${next.blurb}`);
  }
  currentProfile(): string | null {
    for (const p of PROFILES) if (Object.entries(p.set).every(([k, v]) => Math.abs(this.store.num(k) - v) < 0.005)) return p.id;
    return null;
  }
  resetDefaults(): void {
    analytics.track("control", { name: "reset-defaults" });
    for (const d of this.store.defs.values()) this.store.set(d.key, d.def);
    this.store.set("scene", "aurora"); this.store.set("palette", "spectrum"); this.store.set("a.scale", "pentaMinor"); this.store.set("r.mode", "gentle");
    this.ui.toast("Everything is back to the defaults");
  }

  presets(): Record<string, Record<string, Value>> { return ls.get(LS_PRESETS, {}); }
  savePreset(name: string): void { ls.set(LS_PRESETS, { ...this.presets(), [name]: this.store.snapshot() }); analytics.track("session", { action: "setup-saved" }); }
  loadPreset(name: string): void { const p = this.presets()[name]; if (p) { this.via = "panel"; this.store.load(p, "user", (k) => TRANSIENT.has(k)); analytics.track("session", { action: "setup-loaded" }); } }
  deletePreset(name: string): void { const p = this.presets(); delete p[name]; ls.set(LS_PRESETS, p); }

  usageTab(name: string): void { analytics.track("settings", { tab: name }); }
  usagePreset(id: string): void { analytics.track("preset", { preset: id, via: "panel" }); }
  /** apply several settings as one counted action */
  applyQuietly(fn: () => void): void { this.quiet = true; try { fn(); } finally { this.quiet = false; } }
  analyticsOn(): boolean { return analytics.isEnabled(); }
  analyticsOptedOut(): boolean { return analytics.optedOut(); }
  setAnalyticsOptOut(v: boolean): void { analytics.setOptOut(v); }

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
