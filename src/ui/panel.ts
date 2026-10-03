import { el } from "./dom";
import { ICONS } from "./icons";
import type { App } from "../main";
import { SCENES, getScene } from "../visual/scenes";
import { PALETTES, paletteCss, getPalette } from "../visual/palettes";
import { VOICES, SCALES } from "../audio/voicelist";
import { MODES, getMode } from "../signals/mapping";
import { PROFILES, SOUNDSCAPES } from "../core/params";
import { FEATURES } from "../core/features";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LS_SECTIONS = "sensory.sections";

export interface Ui {
  refresh(): void;
  toast(msg: string): void;
  showStart(onStart: (fullscreen: boolean) => void): void;
  /** called by the app when thumbnails may be stale */
  thumbsStale(): void;
}

/** The control surface. Rules: every control sits under the concept it belongs to;
 *  steppers are a caption plus conventional symbols; actions are a symbol plus a label;
 *  scenes are pictures, palettes are swatches, everything else is a plain label with its value. */
export function buildUi(app: App, root: HTMLElement): Ui {
  const { store } = app;
  const syncers: (() => void)[] = [];
  const pct = (key: string, v: number) => { const d = store.defs.get(key)!; return String(Math.round(((v - d.min) / (d.max - d.min)) * 100)); };

  const icon = (name: keyof typeof ICONS) => { const s = el("span", { class: "ic" }); s.innerHTML = ICONS[name]; return s; };
  /** action button: symbol + label */
  const action = (name: keyof typeof ICONS, label: string, attrs: Record<string, unknown>) =>
    el("button", { class: "act", "aria-label": label, ...attrs }, icon(name), el("span", { class: "lbl" }, label));
  /** symbol-only step button inside a captioned group */
  const step = (name: keyof typeof ICONS, label: string, onclick: () => void) => el("button", { class: "stp", "aria-label": label, title: label, onclick }, icon(name));

  const slider = (key: string, fmt?: (v: number) => string) => {
    const def = store.defs.get(key)!;
    const out = el("output");
    const input = el("input", {
      type: "range", min: def.min, max: def.max, step: def.step ?? (def.max - def.min) / 100, "aria-label": def.label,
      oninput: () => store.set(key, Number(input.value)),
    });
    const sync = () => {
      const v = store.num(key);
      input.value = String(v);
      out.textContent = fmt ? fmt(v) : def.step && def.step >= 0.5 ? String(v) : pct(key, v);
    };
    syncers.push(sync); sync();
    return el("div", { class: "slider" }, el("label", {}, def.label, out), input);
  };
  const toggle = (key: string, onLabel: string, offLabel: string) => {
    const b = el("button", { onclick: () => store.set(key, !store.bool(key)) });
    syncers.push(() => { b.classList.toggle("on", store.bool(key)); b.textContent = store.bool(key) ? onLabel : offLabel; b.setAttribute("aria-pressed", String(store.bool(key))); });
    return b;
  };
  const choice = <T extends { id: string }>(key: string, items: T[], render: (item: T) => (Node | string)[], cls: string) => {
    const buttons = items.map((it) => {
      const b = el("button", { onclick: () => store.set(key, it.id) }, ...render(it));
      syncers.push(() => { const on = store.str(key) === it.id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
      return b;
    });
    return el("div", { class: cls }, ...buttons);
  };
  /** a collapsible section whose open state is remembered */
  const openState: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem(LS_SECTIONS) || "{}"); } catch { return {}; } })();
  const section = (id: string, title: string, ...children: (Node | string | null | false)[]) => {
    const d = el("details", { open: openState[id] ?? true }, el("summary", {}, title), el("div", { class: "sec" }, ...children.filter((c): c is Node | string => !!c)));
    d.addEventListener("toggle", () => { openState[id] = d.open; try { localStorage.setItem(LS_SECTIONS, JSON.stringify(openState)); } catch { /* ignore */ } });
    return d;
  };

  // ---------------------------------------------------------------- Picture
  const thumbs = new Map<string, HTMLCanvasElement>();
  const sceneGrid = el("div", { class: "scenes" }, ...SCENES.map((s) => {
    const c = el("canvas", { width: 96, height: 54 });
    thumbs.set(s.id, c);
    const b = el("button", { class: "thumb", title: s.blurb, onclick: () => store.set("scene", s.id) }, c, el("span", {}, s.label));
    syncers.push(() => { const on = store.str("scene") === s.id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    return b;
  }));
  let thumbsDirty = true, thumbTimer = 0;
  const drawThumbs = () => {
    if (!thumbsDirty || !panel.classList.contains("open") || !pagePicture.classList.contains("on")) return;
    thumbsDirty = false;
    for (const [id, c] of thumbs) {
      const img = app.engine.renderThumb(id, c.width, c.height);
      if (img) c.getContext("2d")!.putImageData(img, 0, 0);
    }
  };
  const thumbsStale = () => { thumbsDirty = true; window.clearTimeout(thumbTimer); thumbTimer = window.setTimeout(drawThumbs, 600); };

  const sceneParams = el("div");
  syncers.push(() => {
    const s = getScene(store.str("scene"));
    if (sceneParams.dataset.scene === s.id) return;
    sceneParams.dataset.scene = s.id;
    sceneParams.replaceChildren(el("p", { class: "hint" }, s.blurb));
    if (s.a) sceneParams.append(slider(`sc.${s.id}.a`));
    if (s.b) sceneParams.append(slider(`sc.${s.id}.b`));
    if (s.id === "orb") sceneParams.append(slider("breath.rate", (v) => v.toFixed(1)));
  });
  const pagePicture = el("div", { class: "page" },
    section("scene", "Scene", sceneGrid, sceneParams,
      el("div", { class: "rowb" }, el("button", { onclick: () => app.newVariation() }, "New variation of this scene")),
      el("p", { class: "hint" }, "Every pattern grows from a seed number. A new variation keeps all settings and changes the pattern.")),
    section("colour", "Colour",
      choice("palette", PALETTES, (p) => [el("i", { style: `background:${paletteCss(p)}` }), el("span", {}, p.label)], "chips"),
      slider("v.hue"), slider("v.saturation")),
    section("light", "Light and motion",
      slider("v.brightness"), slider("v.speed"), slider("v.density"), slider("v.mask"),
      el("div", { class: "rowb" }, toggle("freeze", "Holding still (press to move)", "Hold still"), toggle("v.blank", "Picture off (press for picture)", "Picture off")),
      el("p", { class: "hint" }, "Hold still stops all movement, including colour rotation and automatic changes. Picture off keeps the sound.")),
  );

  // ---------------------------------------------------------------- Sound
  const scapeGrid = el("div", { class: "grid" }, ...SOUNDSCAPES.map((sc) => {
    const b = el("button", { onclick: () => app.applySoundscape(sc.id) }, sc.label, el("small", {}, sc.blurb));
    syncers.push(() => { const on = app.currentSoundscape() === sc.id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    return b;
  }));
  const scapeState = el("p", { class: "hint" });
  syncers.push(() => { scapeState.textContent = app.currentSoundscape() ? "" : "Custom mix (layers set by hand)"; });
  const scaleSel = el("select", { "aria-label": "Mood", onchange: () => store.set("a.scale", scaleSel.value) },
    ...Object.entries(SCALES).map(([id, s]) => el("option", { value: id }, s.label)));
  syncers.push(() => { scaleSel.value = store.str("a.scale"); });
  const pageSound = el("div", { class: "page" },
    section("scapes", "Soundscapes", scapeGrid, scapeState),
    section("volume", "Volume", slider("a.volume"), el("div", { class: "rowb" }, toggle("a.mute", "Muted (press for sound)", "Mute")), slider("a.soften"),
      el("p", { class: "hint" }, "All sound is generated live. Set the room volume on the speakers first; this volume is relative to that.")),
    section("layers", "Layers", ...VOICES.map((v) => slider(`a.voice.${v.id}`, (x) => (x < 0.01 ? "off" : pct(`a.voice.${v.id}`, x))))),
    section("fine", "Fine control",
      el("div", { class: "slider" }, el("label", {}, "Mood (scale)"), scaleSel),
      slider("a.root", (v) => NOTES[Math.round(v)]), slider("a.tone"), slider("a.activity"), slider("a.reverb"), slider("a.pulseRate", (v) => String(Math.round(v)))),
  );

  // ---------------------------------------------------------------- Changes
  const pageChanges = el("div", { class: "page" },
    section("changes", "Automatic changes",
      el("p", { class: "hint" }, "Changes happen slowly, through cross-fades. Set an interval to zero to switch that change off."),
      slider("drift.minutes", (v) => (v ? `${v} min` : "never")),
      slider("drift.colourMinutes", (v) => (v ? `${v} min` : "never")),
      slider("drift.hueMinutes", (v) => (v ? `${v} min` : "never")),
      slider("drift.delay", (v) => (v ? `${v} min` : "at once"))),
  );

  // ---------------------------------------------------------------- Input
  const bw = app.sources.eeg, demo = app.sources.demo;
  const urlInput = el("input", { type: "text", "aria-label": "Bridge address", spellcheck: "false", onchange: () => app.setBridgeUrl(urlInput.value.trim()) });
  urlInput.value = bw.url;
  const bwBtn = el("button", { onclick: () => app.toggleSource("eeg") });
  const demoBtn = el("button", { onclick: () => app.toggleSource("demo") });
  const status = el("div", { class: "status" });
  const meters = el("div");
  const modeSel = el("select", { "aria-label": "Reactive mode", onchange: () => store.set("r.mode", modeSel.value) },
    ...MODES.map((m) => el("option", { value: m.id }, m.label)));
  const modeHint = el("p", { class: "hint" });
  syncers.push(() => { modeSel.value = store.str("r.mode"); modeHint.textContent = getMode(store.str("r.mode")).description; });
  const touchSection = () => section("touch", "Touch", el("p", { class: "hint" }, "Touch or click the picture to make a bloom of light and a note. Left to right walks up the scale; the same place always gives the same note. Some scenes answer in their own way."));
  const pageInput = el("div", { class: "page" },
    touchSection(),
    section("devices", "Devices", el("div", { class: "rowb" }, bwBtn, demoBtn), status,
      el("details", {}, el("summary", { class: "hint" }, "Bridge address"), urlInput,
        el("p", { class: "hint" }, "Leave as it is when this page is served together with a bridge. Otherwise enter the WebSocket address of an EEG bridge that speaks the ", el("a", { href: "https://github.com/jason-chao/sensory_space/blob/main/docs/EEG-BRIDGE-PROTOCOL.md", target: "_blank", rel: "noopener" }, "Sensory Space bridge protocol"), "."))),
    section("signals", "Signals", meters),
    section("mode", "How signals shape the space", modeSel, modeHint, slider("r.influence"),
      el("p", { class: "hint" }, "Signals are an influence, not a score. There is nothing to achieve. With a weak or missing signal the space simply carries on. Sensory Space does not send or store signal data unless you record a session with signals included. The bridge that supplies the signals is a separate system and may keep its own records.")),
  );

  // ---------------------------------------------------------------- Setups
  const wakeNote = el("p", { class: "hint" });
  const syncWake = () => {
    const w = app.wakeState;
    wakeNote.textContent =
      w === "held" ? "Screen: kept awake while this page is showing." :
      w === "unavailable" ? (window.isSecureContext ? "Screen: this browser cannot keep the screen awake. Adjust the device's sleep setting instead." : "Screen: keeping it awake needs a secure (https) address. On this address the screen may sleep on the device's usual timer.") :
      w === "released" ? "Screen: free to sleep while stopped or hidden." : "Screen: the wake lock is requested when you press Begin.";
  };
  window.setInterval(syncWake, 1000); syncWake();
  const profGrid = el("div", { class: "rowb" }, ...PROFILES.map((p) => {
    const b = el("button", { title: p.blurb, onclick: () => { for (const [k, v] of Object.entries(p.set)) store.set(k, v); } }, p.label);
    syncers.push(() => { const on = app.currentProfile() === p.id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    return b;
  }));
  const profState = el("p", { class: "hint" });
  syncers.push(() => { profState.textContent = app.currentProfile() ? PROFILES.find((p) => p.id === app.currentProfile())!.blurb : "Custom (settings changed by hand)"; });
  const presetSel = el("select", { "aria-label": "Saved setups" });
  const fillPresets = () => presetSel.replaceChildren(el("option", { value: "" }, "Saved setups"), ...Object.keys(app.presets()).map((n) => el("option", { value: n }, n)));
  fillPresets();
  const pageSetups = el("div", { class: "page" },
    section("intensity", "Intensity", profGrid, profState,
      el("p", { class: "hint" }, "A preset sets brightness, motion speed, detail, colour strength, sound activity and tone. Volume is not changed.")),
    section("saved", "Saved setups", presetSel,
      el("div", { class: "rowb" },
        el("button", { onclick: () => { if (presetSel.value) app.loadPreset(presetSel.value); } }, "Load"),
        el("button", { onclick: () => { const n = prompt("Name for this setup"); if (n) { app.savePreset(n); fillPresets(); presetSel.value = n; } } }, "Save current"),
        el("button", { onclick: () => { if (presetSel.value) { app.deletePreset(presetSel.value); fillPresets(); } } }, "Delete")),
      el("div", { class: "rowb" }, el("button", { onclick: () => app.resetDefaults() }, "Reset everything to defaults"))),
    section("display", "Display", el("div", { class: "rowb" }, toggle("ui.iconsOnly", "Bar shows symbols only", "Bar shows symbols and words")), wakeNote),
  );

  // ---------------------------------------------------------------- Recording
  const recBtn = el("button", { onclick: () => app.toggleRecording() });
  const incl = el("input", { type: "checkbox", checked: true, onchange: () => { app.recorder.includeSignals = incl.checked; } });
  const fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none", onchange: () => {
    const f = fileInput.files?.[0];
    if (f) void f.text().then((t) => app.playSession(t));
    fileInput.value = "";
  } });
  const playBtn = el("button", { onclick: () => (app.player.active ? app.stopReplay() : fileInput.click()) });
  const sessionStatus = el("div", { class: "status" });
  const pageRecording = el("div", { class: "page" },
    section("record", "Record",
      el("p", { class: "hint" }, "Recording is off unless you start it. A recording is a small file of settings and changes, saved to this device when you stop. Sensory Space can replay it later, regenerating the same visuals and sound."),
      FEATURES.input ? el("label", { class: "check" }, incl, "Include the input signals that shaped the session") : null,
      el("div", { class: "rowb" }, recBtn)),
    section("replay", "Replay", el("div", { class: "rowb" }, playBtn, fileInput), sessionStatus),
  );

  // ---------------------------------------------------------------- Help
  const ghLink = () => {
    const a = el("a", { class: "ghlink", href: "https://github.com/jason-chao/sensory_space", target: "_blank", rel: "noopener", "aria-label": "Sensory Space on GitHub", title: "Source code on GitHub" });
    a.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
    a.append(el("span", {}, "Source on GitHub"));
    return a;
  };
  const key = (k: string, what: string) => el("tr", {}, el("td", {}, el("kbd", {}, k)), el("td", {}, what));
  const pageHelp = el("div", { class: "page" },
    FEATURES.input ? null : touchSection(),
    section("keys", "Keys", el("table", { class: "keys" },
      key("← →", "previous or next scene"), key("C V", "next or previous colours"), key("+ −", "motion faster or slower"),
      key("[ ]", "previous or next soundscape"), key("↑ ↓", "volume up or down"), key("E", "ease on or off"), key("X", "stop at once, or resume"), key("M", "mute"),
      key("P", "hold still"), key("B", "picture off"), key("F", "full screen"), key("S", "settings"), key("H", "hide or show the bar"))),
    section("about", "About",
      el("p", {}, el("strong", {}, "Sensory Space"), " ", el("span", { class: "hint" }, `version ${app.version}`)),
      el("p", { class: "hint" }, "Slow light, living sound, room to linger. A generative art project of light and sound for any screen, from a projected wall to a laptop. Everything is generated live in this browser."),
      el("p", { class: "hint" }, "By Jason Chao. Designed with care for autistic adults: nothing changes suddenly, and the pace, brightness and sound are yours to set. Brightness changes are rate-limited by design, which lowers risk but cannot remove it; if you are sensitive to light or pattern, start with Gentle."),
      el("p", { class: "hint" }, ghLink(), " · MIT licence")),
  );

  // ---------------------------------------------------------------- panel and tabs
  const all: [string, HTMLElement][] = [["Picture", pagePicture], ["Sound", pageSound], ["Changes", pageChanges], ["Input", pageInput], ["Setups", pageSetups], ["Record", pageRecording], ["Help", pageHelp]];
  const shown = all.filter(([n]) => n !== "Input" || FEATURES.input);
  const pages = shown.map(([, p]) => p);
  const names = shown.map(([n]) => n);
  const tabBtns = names.map((n, i) => el("button", { role: "tab", onclick: () => show(i) }, n));
  const show = (i: number) => {
    pages.forEach((p, j) => p.classList.toggle("on", i === j));
    tabBtns.forEach((b, j) => { b.classList.toggle("on", i === j); b.setAttribute("aria-selected", String(i === j)); });
    try { localStorage.setItem("sensory.tab", String(i)); } catch { /* ignore */ }
    if (i === 0) drawThumbs();
  };
  const panel = el("aside", { class: "panel", "aria-label": "Settings" },
    el("div", { class: "phead" }, el("strong", {}, "Settings"),
      action("stop", "Stop", { title: "Black and silent at once (X)", onclick: () => app.toggleStop() }),
      action("close", "Close", { onclick: () => app.togglePanel() })),
    el("div", { class: "tabs", role: "tablist", style: `--tabs:${tabBtns.length}` }, ...tabBtns), el("div", { class: "pages" }, ...pages));
  let savedTab = 0; try { savedTab = Number(localStorage.getItem("sensory.tab")) || 0; } catch { /* ignore */ }
  show(Math.min(savedTab, pages.length - 1));

  // ---------------------------------------------------------------- bar
  const group = (caption: string, prev: HTMLElement, value: HTMLElement, next: HTMLElement, cls = "") =>
    el("div", { class: `grp ${cls}`, role: "group", "aria-label": caption }, el("div", { class: "cap" }, caption), el("div", { class: "row" }, prev, value, next));
  const sceneName = el("span", { class: "val" }), palName = el("span", { class: "val" }), speedVal = el("span", { class: "val num" }), volVal = el("span", { class: "val num" }), scapeName = el("span", { class: "val" });
  syncers.push(() => {
    sceneName.textContent = getScene(store.str("scene")).label;
    palName.textContent = getPalette(store.str("palette")).label;
    speedVal.textContent = pct("v.speed", store.num("v.speed"));
    const sc = app.currentSoundscape();
    scapeName.textContent = sc ? SOUNDSCAPES.find((s) => s.id === sc)!.label : "Custom mix";
    scapeName.title = sc ? SOUNDSCAPES.find((s) => s.id === sc)!.blurb : "Layers set by hand";
    volVal.textContent = store.bool("a.mute") ? "muted" : pct("a.volume", store.num("a.volume"));
    document.body.classList.toggle("icons-only", store.bool("ui.iconsOnly"));
  });
  const easeBtn = action("ease", "Ease", { title: "Dimmer, slower and quieter until pressed again (E)", onclick: () => app.toggleEase() });
  syncers.push(() => { easeBtn.classList.toggle("on", store.bool("ease")); easeBtn.setAttribute("aria-pressed", String(store.bool("ease"))); });
  const fsBtn = action("fullscreen", "Full screen", { title: "Full screen (F). Esc leaves it", onclick: () => app.toggleFullscreen() });
  const syncFs = () => {
    const on = !!document.fullscreenElement;
    fsBtn.replaceChildren(icon(on ? "exitFullscreen" : "fullscreen"), el("span", { class: "lbl" }, on ? "Exit" : "Full screen"));
    fsBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
  };
  document.addEventListener("fullscreenchange", syncFs);
  const recInd = el("span", { class: "rec" }, "● rec");
  const bar = el("div", { class: "bar", role: "toolbar", "aria-label": "Controls" },
    group("Scene", step("prev", "Previous scene", () => app.stepScene(-1)), sceneName, step("next", "Next scene", () => app.stepScene(1))),
    group("Colours", step("prev", "Previous colours", () => app.stepPalette(-1)), palName, step("next", "Next colours", () => app.stepPalette(1))),
    group("Motion", step("minus", "Slower", () => app.nudge("v.speed", -0.1)), speedVal, step("plus", "Faster", () => app.nudge("v.speed", 0.1)), "narrow-hide"),
    group("Soundscape", step("prev", "Previous soundscape", () => app.stepSoundscape(-1)), scapeName, step("next", "Next soundscape", () => app.stepSoundscape(1))),
    group("Volume", step("minus", "Quieter", () => app.nudge("a.volume", -0.05)), volVal, step("plus", "Louder", () => app.nudge("a.volume", 0.05)), "narrow-hide"),
    el("div", { class: "acts" },
      easeBtn,
      fsBtn,
      action("settings", "Settings", { title: "Settings (S)", onclick: () => app.togglePanel() }),
      action("hide", "Hide", { title: "Hide these controls (H)", onclick: () => app.toggleBar() })),
    recInd);
  const handle = el("button", { class: "handle", title: "Show controls (H)", "aria-label": "Show controls", onclick: () => app.toggleBar() });
  handle.innerHTML = ICONS.show;
  const toastEl = el("div", { class: "toast", role: "status" });
  root.append(bar, handle, panel, toastEl);
  app.panelEl = panel;

  // ---------------------------------------------------------------- live refresh
  let toastTimer = 0;
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const meterEls = new Map<string, { dot: HTMLElement; q: HTMLElement }>();
  const refreshLive = () => {
    bwBtn.textContent = bw.status === "off" ? "Connect EEG bridge" : "Disconnect EEG bridge";
    bwBtn.classList.toggle("on", bw.status !== "off");
    demoBtn.textContent = demo.status === "off" ? "Try demo signals" : "Stop demo signals";
    demoBtn.classList.toggle("on", demo.status !== "off");
    status.textContent = bw.status !== "off" ? bw.detail : demo.status !== "off" ? demo.detail : "No input connected. The space runs by itself.";
    const sigs = [...app.bus.signals.values()];
    if (sigs.length !== meterEls.size || sigs.some((s) => !meterEls.has(s.desc.name))) {
      meters.replaceChildren(); meterEls.clear();
      for (const s of sigs) {
        const dot = el("div", { class: "dot" }), q = el("div", { class: "q", title: "Signal confidence" });
        meters.append(el("div", { class: "meter" }, el("span", {}, s.desc.label), el("div", { class: "track" }, dot), q));
        meterEls.set(s.desc.name, { dot, q });
      }
      if (!sigs.length) meters.append(el("p", { class: "hint" }, "No signals yet."));
    }
    for (const s of sigs) {
      const m = meterEls.get(s.desc.name)!;
      m.dot.style.left = `${s.smooth * 100}%`;
      m.q.style.background = s.quality > 0.6 ? "#6fd08c" : s.quality > 0.15 ? "#e6b566" : "#555";
    }
    recBtn.textContent = app.recorder.active ? `Stop and save (${fmtT(app.recorder.elapsed)})` : "Start recording";
    recBtn.classList.toggle("on", app.recorder.active);
    recBtn.disabled = app.player.active;
    recInd.classList.toggle("on", app.recorder.active);
    playBtn.textContent = app.player.active ? "Stop replay" : "Open a session file";
    playBtn.classList.toggle("on", app.player.active);
    sessionStatus.textContent = app.player.active ? `Replaying ${fmtT(app.player.position)} of ${fmtT(app.player.duration)}` : "No replay running.";
  };
  window.setInterval(refreshLive, 400);
  refreshLive();

  const refresh = () => { for (const s of syncers) s(); };
  store.onChange((k) => { refresh(); if (k === "palette" || k === "v.hue" || k === "variation") thumbsStale(); });
  window.setInterval(() => { if (store.num("drift.hueMinutes") > 0) thumbsStale(); }, 20000);
  refresh();
  new MutationObserver(() => { if (panel.classList.contains("open")) drawThumbs(); }).observe(panel, { attributes: true, attributeFilter: ["class"] });

  return {
    refresh, thumbsStale,
    toast(msg: string) {
      toastEl.textContent = msg; toastEl.classList.add("show");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3500);
    },
    showStart(onStart) {
      const fs = el("input", { type: "checkbox" });
      let chosen = "";
      const profBtns = PROFILES.map((p) => el("button", { onclick: () => pick(p.id) }, p.label, el("small", {}, p.blurb)));
      const pick = (id: string) => { chosen = id; profBtns.forEach((b, i) => b.classList.toggle("on", PROFILES[i].id === id)); };
      const start = el("div", { class: "start" }, el("div", { class: "card" },
        el("h1", {}, "Sensory Space"),
        el("p", {}, "Slow light, living sound, room to linger. Everything can be changed, and nothing changes suddenly."),
        el("div", { class: "note" },
          "Set the room volume low on your speakers first: sound starts quietly and rises over a few seconds. Light changes are slowed by design. If you are sensitive to light or pattern, choose Gentle. Press ",
          el("kbd", {}, "E"), " for ease (dimmer, slower, quieter) or ", el("kbd", {}, "X"), " to stop at once (black and silent)."),
        el("div", { class: "row grid3" }, ...profBtns),
        el("div", { class: "row" }, el("label", {}, fs, "Open in full screen")),
        el("div", { class: "row" }, el("button", { class: "primary", onclick: () => {
          if (chosen) { const p = PROFILES.find((x) => x.id === chosen)!; for (const [k, v] of Object.entries(p.set)) store.set(k, v); }
          start.classList.add("hide");
          window.setTimeout(() => start.remove(), 1500);
          onStart(fs.checked);
        } }, "Begin")),
      ));
      root.append(start);
    },
  };
}
