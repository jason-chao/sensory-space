import { el } from "./dom";
import type { App } from "../main";
import { SCENES, getScene } from "../visual/scenes";
import { PALETTES, paletteCss } from "../visual/palettes";
import { VOICES, SCALES } from "../audio/voicelist";
import { MODES, getMode } from "../signals/mapping";
import { PROFILES } from "../core/params";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Builds the control surface. Every control writes to the store and redraws
 *  from the store, so replay and keyboard shortcuts keep the panel in step. */
export function buildUi(app: App, root: HTMLElement): { refresh(): void; toast(msg: string): void; showStart(onStart: (fullscreen: boolean) => void): void } {
  const { store } = app;
  const syncers: (() => void)[] = [];

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
      out.textContent = fmt ? fmt(v) : def.step && def.step >= 0.5 ? String(v) : `${Math.round(((v - def.min) / (def.max - def.min)) * 100)}`;
    };
    syncers.push(sync); sync();
    return el("div", { class: "slider" }, el("label", {}, def.label, out), input);
  };

  const choice = <T extends { id: string }>(key: string, items: T[], render: (item: T) => (Node | string)[], cls: string) => {
    const buttons = items.map((it) => {
      const b = el("button", { onclick: () => store.set(key, it.id) }, ...render(it));
      syncers.push(() => b.classList.toggle("on", store.str(key) === it.id));
      return b;
    });
    return el("div", { class: cls }, ...buttons);
  };

  const toggle = (key: string, onLabel: string, offLabel: string) => {
    const b = el("button", { onclick: () => store.set(key, !store.bool(key)) });
    syncers.push(() => { b.classList.toggle("on", store.bool(key)); b.textContent = store.bool(key) ? onLabel : offLabel; b.setAttribute("aria-pressed", String(store.bool(key))); });
    return b;
  };

  // --- pages ---------------------------------------------------------------
  const sceneParams = el("div");
  const syncSceneParams = () => {
    const s = getScene(store.str("scene"));
    if (sceneParams.dataset.scene === s.id) return;
    sceneParams.dataset.scene = s.id;
    sceneParams.replaceChildren();
    if (s.a) sceneParams.append(slider(`sc.${s.id}.a`));
    if (s.b) sceneParams.append(slider(`sc.${s.id}.b`));
    if (s.id === "orb") sceneParams.append(slider("breath.rate", (v) => v.toFixed(1)));
  };
  syncers.push(syncSceneParams);

  const pageScenes = el("div", { class: "page" },
    el("h2", {}, "Intensity"),
    el("div", { class: "rowb" }, ...PROFILES.map((p) =>
      el("button", { title: p.blurb, onclick: () => { for (const [k, v] of Object.entries(p.set)) store.set(k, v); } }, p.label))),
    el("h2", {}, "Scene"),
    choice("scene", SCENES, (s) => [s.label, el("small", {}, s.blurb)], "grid"),
    el("h2", {}, "This scene"), sceneParams,
    slider("drift.minutes", (v) => (v ? `${v} min` : "never")),
  );

  const pageLook = el("div", { class: "page" },
    el("h2", {}, "Colours"),
    choice("palette", PALETTES, (p) => [el("i", { style: `background:${paletteCss(p)}` }), el("span", {}, p.label)], "chips"),
    slider("v.hue"),
    slider("v.saturation"),
    el("h2", {}, "Light and motion"),
    slider("v.brightness"), slider("v.speed"), slider("v.density"), slider("v.mask"),
    el("div", { class: "rowb" }, toggle("freeze", "Hold still", "Moving"), toggle("v.blank", "Sound only", "Picture on")),
    el("h2", {}, "Variation"),
    el("div", { class: "rowb" }, el("button", { onclick: () => app.newVariation() }, "New variation of this scene")),
    el("p", { class: "hint" }, "Every pattern grows from a seed number. A new variation keeps your settings and changes the pattern."),
  );

  const muteBtn = el("button", { onclick: () => store.set("a.mute", !store.bool("a.mute")) }, "Mute");
  syncers.push(() => { muteBtn.classList.toggle("on", store.bool("a.mute")); muteBtn.textContent = store.bool("a.mute") ? "Muted" : "Mute"; });
  const scaleSel = el("select", { "aria-label": "Mood", onchange: () => store.set("a.scale", scaleSel.value) },
    ...Object.entries(SCALES).map(([id, s]) => el("option", { value: id }, s.label)));
  syncers.push(() => { scaleSel.value = store.str("a.scale"); });
  const pageSound = el("div", { class: "page" },
    el("h2", {}, "Overall"),
    slider("a.volume"), el("div", { class: "rowb" }, muteBtn),
    slider("a.soften"), slider("a.reverb"),
    el("h2", {}, "Layers"),
    ...VOICES.map((v) => slider(`a.voice.${v.id}`, (x) => (x < 0.01 ? "off" : String(Math.round(x * 100))))),
    el("h2", {}, "Music"),
    el("div", { class: "slider" }, el("label", {}, "Mood"), scaleSel),
    slider("a.root", (v) => NOTES[Math.round(v)]),
    slider("a.tone"), slider("a.activity"), slider("a.pulseRate", (v) => String(Math.round(v))),
    el("p", { class: "hint" }, "All sound is generated live in your browser. Set the room volume on your speakers first, then fine-tune here."),
  );

  // reactive
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
  const pageReact = el("div", { class: "page" },
    el("h2", {}, "Input"),
    el("div", { class: "rowb" }, bwBtn, demoBtn),
    status,
    el("details", {}, el("summary", { class: "hint" }, "Bridge address"), urlInput,
      el("p", { class: "hint" }, "Leave as it is when this page is served together with a bridge. Otherwise enter the WebSocket address of a EEG bridge.")),
    el("h2", {}, "Signals"), meters,
    el("h2", {}, "How signals shape the space"),
    modeSel, modeHint, slider("r.influence"),
    el("p", { class: "hint" }, "Signals are an influence, not a score. There is nothing to achieve. With a weak or missing signal the space simply carries on. Sensory Space does not send or store signal data, unless you record a session with signals included. The bridge that supplies the signals is a separate system and may keep its own records."),
  );

  // session
  const recBtn = el("button", { onclick: () => app.toggleRecording() });
  const incl = el("input", { type: "checkbox", checked: true, onchange: () => { app.recorder.includeSignals = incl.checked; } });
  const fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none", onchange: () => {
    const f = fileInput.files?.[0];
    if (f) void f.text().then((t) => app.playSession(t));
    fileInput.value = "";
  } });
  const playBtn = el("button", { onclick: () => (app.player.active ? app.stopReplay() : fileInput.click()) });
  const sessionStatus = el("div", { class: "status" });
  const presetSel = el("select", { "aria-label": "Saved presets" });
  const fillPresets = () => {
    presetSel.replaceChildren(el("option", { value: "" }, "Saved presets"), ...Object.keys(app.presets()).map((n) => el("option", { value: n }, n)));
  };
  fillPresets();
  const pageSession = el("div", { class: "page" },
    el("h2", {}, "Record"),
    el("p", { class: "hint" }, "Recording is off unless you start it. A recording is a small file of settings and changes, saved to this device when you stop. Sensory Space can replay it later, regenerating the same visuals and sound."),
    el("label", { class: "check" }, incl, "Include the input signals that shaped the session"),
    el("div", { class: "rowb" }, recBtn),
    el("h2", {}, "Replay"),
    el("div", { class: "rowb" }, playBtn, fileInput),
    sessionStatus,
    el("h2", {}, "Presets"),
    presetSel,
    el("div", { class: "rowb" },
      el("button", { onclick: () => { if (presetSel.value) app.loadPreset(presetSel.value); } }, "Load"),
      el("button", { onclick: () => { const n = prompt("Name for this preset"); if (n) { app.savePreset(n); fillPresets(); presetSel.value = n; } } }, "Save current"),
      el("button", { onclick: () => { if (presetSel.value) { app.deletePreset(presetSel.value); fillPresets(); } } }, "Delete")),
    el("h2", {}, "Keys"),
    el("p", { class: "hint" },
      el("kbd", {}, "Space"), " calm  ", el("kbd", {}, "←"), " ", el("kbd", {}, "→"), " scene  ", el("kbd", {}, "↑"), " ", el("kbd", {}, "↓"), " volume  ",
      el("kbd", {}, "F"), " full screen  ", el("kbd", {}, "M"), " mute  ", el("kbd", {}, "S"), " settings  ", el("kbd", {}, "X"), " stop at once  ", el("kbd", {}, "P"), " hold still  ", el("kbd", {}, "B"), " sound only"),
    el("p", { class: "hint" }, "Touch or click the picture to make a bloom of light and a note. The same place always gives the same note."),
    el("h2", {}, "About"),
    el("p", { class: "hint" }, "Sensory Space is for relaxation and enjoyment. It is not a medical device and not a treatment. Brightness changes are rate-limited by design, but if you are sensitive to light or pattern, start with the Gentle profile and a dim room light on."),
  );

  const pages = [pageScenes, pageLook, pageSound, pageReact, pageSession];
  const names = ["Scenes", "Colour", "Sound", "Reactive", "Session"];
  const tabBtns = names.map((n, i) => el("button", { onclick: () => show(i) }, n));
  const show = (i: number) => { pages.forEach((p, j) => p.classList.toggle("on", i === j)); tabBtns.forEach((b, j) => b.classList.toggle("on", i === j)); };
  show(0);
  const panel = el("aside", { class: "panel", "aria-label": "Settings" }, el("div", { class: "tabs" }, ...tabBtns), el("div", { class: "pages" }, ...pages));

  // --- bar -----------------------------------------------------------------
  const calmBtn = el("button", { title: "Calm: dim, slow and quiet (Space)", onclick: () => app.toggleCalm() }, "Calm");
  syncers.push(() => calmBtn.classList.toggle("on", store.bool("calm")));
  const recInd = el("span", { class: "rec" }, "● rec");
  const panelBtn = el("button", { title: "Settings (S)", onclick: () => app.togglePanel() }, "Settings");
  const bar = el("div", { class: "bar", role: "toolbar" },
    calmBtn,
    el("button", { title: "Previous scene", "aria-label": "Previous scene", onclick: () => app.stepScene(-1) }, "‹"),
    el("button", { title: "Next scene", "aria-label": "Next scene", onclick: () => app.stepScene(1) }, "›"),
    el("button", { title: "Full screen (F)", onclick: () => app.toggleFullscreen() }, "Full screen"),
    el("button", { title: "Stop: black and silent at once (X)", onclick: () => app.toggleStop() }, "Stop"),
    recInd, panelBtn);
  const toastEl = el("div", { class: "toast", role: "status" });
  root.append(bar, panel, toastEl);
  app.panelEl = panel;

  let toastTimer = 0;
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // live parts refreshed a few times a second
  const meterEls = new Map<string, { dot: HTMLElement; q: HTMLElement }>();
  const refreshLive = () => {
    bwBtn.textContent = bw.status === "off" ? "Connect EEG band" : "Disconnect EEG band";
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
  store.onChange(() => refresh());
  refresh();

  return {
    refresh,
    toast(msg: string) {
      toastEl.textContent = msg; toastEl.classList.add("show");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3500);
    },
    showStart(onStart) {
      const fs = el("input", { type: "checkbox" });
      const profBtns = PROFILES.map((p) => el("button", { onclick: () => { pick(p.id); } }, p.label));
      let chosen = "";
      const pick = (id: string) => {
        chosen = id;
        profBtns.forEach((b, i) => b.classList.toggle("on", PROFILES[i].id === id));
      };
      const start = el("div", { class: "start" }, el("div", { class: "card" },
        el("h1", {}, "Sensory Space"),
        el("p", {}, "Slow light and sound to relax with. Everything can be changed, and nothing changes suddenly."),
        el("div", { class: "note" },
          "Set the room volume low on your speakers first: sound starts quietly and rises over a few seconds. Light changes are slowed by design, which lowers risk but cannot remove it. If you are sensitive to light or pattern, choose Gentle. Press ",
          el("kbd", {}, "Space"), " for calm (dim, slow, quiet) or ", el("kbd", {}, "X"), " to stop at once (black and silent)."),
        el("div", { class: "row" }, ...profBtns),
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
