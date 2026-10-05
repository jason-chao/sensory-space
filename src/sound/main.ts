import "./style.css";
import { SoundEngine, SOUNDSCAPES, newSeed } from "sensory-sound";
import * as analytics from "../analytics";

/** The sound of Sensory Space on its own: eight soundscapes, volume, soften, a sleep timer.
 *  The sound goes through a media element so a phone keeps playing with the screen off and
 *  shows play and pause on the lock screen. */

const LS = "sensory.sound";
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } })() as { scape?: string; volume?: number; soften?: number };
const remember = () => { try { localStorage.setItem(LS, JSON.stringify({ scape, volume, soften })); } catch { /* ignore */ } };

let scape = SOUNDSCAPES.some((s) => s.id === saved.scape) ? saved.scape! : SOUNDSCAPES[0].id;
let volume = typeof saved.volume === "number" ? saved.volume : 0.5;
let soften = typeof saved.soften === "number" ? saved.soften : 0.45;
let playing = false;
let sleepAt = 0;
let startedAt = 0;

const engine = new SoundEngine({ seed: newSeed(), output: "stream", lookahead: 2 });
engine.applySoundscape(scape);
engine.set({ volume, soften });
const out = document.getElementById("out") as HTMLAudioElement;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) e.addEventListener(k.slice(2), v as EventListener); else if (k === "class") e.className = String(v); else e.setAttribute(k, String(v)); }
  e.append(...kids); return e;
};

const icon = (d: string) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = `<path d="${d}"/>`; return s; };
const PLAY = "M8 5v14l11-7z", PAUSE = "M6 5h4v14H6zM14 5h4v14h-14z".replace("h-14", "h-4");

async function play(): Promise<void> {
  if (playing) return;
  await engine.start();
  if (!out.srcObject) out.srcObject = engine.stream();
  try { await out.play(); } catch { /* the media element is a courtesy for lock screens; the context itself is running */ }
  engine.setStopped(false);
  playing = true; startedAt = Date.now();
  analytics.track("sound", { action: "play", soundscape: scape });
  session();
  render();
}

function pause(): void {
  if (!playing) return;
  engine.setStopped(true);
  playing = false;
  analytics.track("sound", { action: "pause", soundscape: scape, minutes: Math.round((Date.now() - startedAt) / 60000) });
  window.setTimeout(() => { if (!playing) { engine.suspend(); out.pause(); } }, 600);
  session();
  render();
}

function choose(id: string): void {
  scape = id; engine.applySoundscape(id); remember(); session();
  analytics.track("sound", { action: "soundscape", soundscape: id });
  render();
}

function step(d: number): void {
  const i = SOUNDSCAPES.findIndex((s) => s.id === scape);
  choose(SOUNDSCAPES[(i + d + SOUNDSCAPES.length) % SOUNDSCAPES.length].id);
}

/** lock-screen title and buttons */
function session(): void {
  if (!("mediaSession" in navigator)) return;
  const sc = SOUNDSCAPES.find((s) => s.id === scape)!;
  navigator.mediaSession.metadata = new MediaMetadata({ title: sc.label, artist: "Sensory Space", album: sc.blurb, artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  navigator.mediaSession.setActionHandler("play", () => void play());
  navigator.mediaSession.setActionHandler("pause", pause);
  navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
}

// --- the page
const playBtn = el("button", { class: "play", onclick: () => (playing ? pause() : void play()) });
const scapeBtns = SOUNDSCAPES.map((s) => el("button", { onclick: () => choose(s.id), "aria-pressed": "false" }, el("strong", {}, s.label), el("small", {}, s.blurb)));
const volIn = el("input", { type: "range", min: 0, max: 1, step: 0.01, value: volume, "aria-label": "Volume", oninput: () => { volume = Number(volIn.value); engine.set({ volume }); remember(); render(); } });
const softIn = el("input", { type: "range", min: 0, max: 1, step: 0.01, value: soften, "aria-label": "Soften", oninput: () => { soften = Number(softIn.value); engine.set({ soften }); remember(); render(); } });
const volOut = el("output"), softOut = el("output");
const meter = el("div", { class: "meter" }, el("i"));
const timerBtns = [0, 15, 30, 60].map((m) => el("button", { onclick: () => { sleepAt = m ? Date.now() + m * 60000 : 0; render(); } }, m ? `${m} min` : "Off"));
const timerNote = el("span", { class: "note" });

document.getElementById("app")!.append(
  el("h1", {}, "Sensory Space"),
  el("p", { class: "tag" }, "Just the sound."),
  playBtn,
  el("div", { class: "scapes" }, ...scapeBtns),
  el("div", { class: "slider" }, el("label", {}, "Volume", volOut), volIn),
  el("div", { class: "slider" }, el("label", {}, "Soften", softOut), softIn),
  meter,
  el("p", { class: "note" }, "Sleep timer"), el("div", { class: "timer" }, ...timerBtns), timerNote,
  el("p", { class: "note" }, "The sound is made live on your phone, so it keeps changing. On most phones it carries on with the screen off, with play and pause on the lock screen. Add this page to your home screen to keep it handy. ",
    el("a", { href: "/" }, "Light and sound together"), " · ", el("a", { href: "https://github.com/jason-chao/sensory-sound" }, "the sound engine")),
);

function render(): void {
  playBtn.replaceChildren(icon(playing ? PAUSE : PLAY), playing ? "Pause" : "Play");
  playBtn.classList.toggle("playing", playing);
  scapeBtns.forEach((b, i) => { const on = SOUNDSCAPES[i].id === scape; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  volIn.value = String(volume); volOut.textContent = String(Math.round(volume * 100));
  softIn.value = String(soften); softOut.textContent = String(Math.round(soften * 100));
  timerBtns.forEach((b, i) => b.classList.toggle("on", [0, 15, 30, 60][i] === 0 ? sleepAt === 0 : sleepAt > 0 && Math.abs(sleepAt - Date.now() - [0, 15, 30, 60][i] * 60000) < 60000));
  timerNote.textContent = sleepAt ? `Fades out in ${Math.max(1, Math.round((sleepAt - Date.now()) / 60000))} minutes.` : "";
}

window.setInterval(() => {
  (meter.firstChild as HTMLElement).style.width = `${Math.min(100, engine.peak() * 100)}%`;
  if (sleepAt && Date.now() >= sleepAt && playing) { sleepAt = 0; pause(); }
  if (sleepAt) timerNote.textContent = `Fades out in ${Math.max(1, Math.round((sleepAt - Date.now()) / 60000))} minutes.`;
}, 500);
window.addEventListener("pagehide", () => { if (playing) analytics.track("sound", { action: "leave", soundscape: scape, minutes: Math.round((Date.now() - startedAt) / 60000) }); });
analytics.init();
render();
