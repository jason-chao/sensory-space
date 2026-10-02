import { Baseline, type SignalBus, type SignalDesc } from "./bus";
import { BandAnalyser, bandsFromLabels } from "./eeg";

export type SourceStatus = "off" | "connecting" | "waiting" | "live" | "error";

/** Contract for any input device or bridge. A source declares its signals on
 *  the bus and pushes normalised values; it knows nothing about scenes or sound.
 *  New devices (heart-rate straps, MIDI, camera, other bridges) implement this. */
export interface SignalSource {
  readonly id: string;
  readonly label: string;
  status: SourceStatus;
  detail: string;
  connect(): void;
  disconnect(): void;
}

export const BODY_SIGNALS: SignalDesc[] = [
  { name: "eeg.calm", label: "Calm index (slow vs fast waves)", source: "", tau: 12, bio: true },
  { name: "eeg.alpha", label: "Alpha share", source: "", tau: 15, bio: true },
  { name: "eeg.theta", label: "Theta share", source: "", tau: 15, bio: true },
  { name: "eeg.beta", label: "Beta share", source: "", tau: 15, bio: true },
  { name: "body.heart", label: "Heart rate", source: "", tau: 10, bio: true },
  { name: "body.motion", label: "Head movement", source: "", tau: 6, bio: true },
];

/** Slow wandering signals for trying the reactive features without hardware. */
export class DemoSource implements SignalSource {
  readonly id = "demo";
  readonly label = "Demo signals (no device)";
  status: SourceStatus = "off";
  detail = "";
  private last = -1;
  constructor(private bus: SignalBus, private now: () => number) {}

  connect(): void {
    for (const d of BODY_SIGNALS) this.bus.declare({ ...d, source: this.id, bio: false });
    this.status = "live"; this.detail = "Simulated values";
  }
  disconnect(): void {
    this.bus.removeSource(this.id);
    this.status = "off"; this.detail = "";
  }
  /** call every frame; pushes once a second like a real device would */
  tick(): void {
    if (this.status !== "live") return;
    const t = this.now();
    if (t - this.last < 1) return;
    this.last = t;
    BODY_SIGNALS.forEach((d, i) => {
      const v = 0.5 + 0.3 * Math.sin(t * (0.021 + 0.007 * i) + i * 1.7) + 0.15 * Math.sin(t * (0.057 + 0.011 * i) + i);
      this.bus.push(d.name, v, 1, t);
    });
  }
}

interface StreamInfo {
  id: string;
  name?: string;
  type: string;
  channel_count: number;
  nominal_srate: number;
  channels?: { label?: string; unit?: string }[];
}
interface Hello { type: "hello"; protocol?: string; version?: number; streams?: StreamInfo[] }
interface Samples { type: "samples"; stream: string; t?: number[]; t0?: number; dt?: number; x: number[][] }
interface Status { type: "status"; state?: string; message?: string }
type BridgeMsg = Hello | Samples | Status | { type: "error"; message?: string };

/** Any EEG device through a bridge that speaks docs/EEG-BRIDGE-PROTOCOL.md.
 *  Raw EEG is turned into band powers and a quality estimate here, so devices
 *  that provide only raw samples work the same as those with their own metrics.
 *  Each measure is then normalised against the wearer's own running baseline. */
export class EegBridgeSource implements SignalSource {
  readonly id = "eeg";
  readonly label = "EEG bridge";
  status: SourceStatus = "off";
  detail = "";
  url = "";
  private ws: WebSocket | null = null;
  private hb = 0;
  private retry = 1500;
  private wanted = false;
  private streams = new Map<string, StreamInfo>();
  private analysers = new Map<string, BandAnalyser>();
  private lastAnalysis = 0;
  private hasBandsStream = false;
  private quality = 1;
  private base: Record<string, Baseline> = {};
  private lastMotion: number[] | null = null;
  private motion = 0;

  constructor(private bus: SignalBus, private now: () => number) {}

  connect(): void {
    this.wanted = true;
    for (const d of BODY_SIGNALS) { this.bus.declare({ ...d, source: this.id }); this.base[d.name] = new Baseline(); }
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    window.clearInterval(this.hb);
    this.ws?.close(); this.ws = null;
    this.bus.removeSource(this.id);
    this.streams.clear(); this.analysers.clear();
    this.status = "off"; this.detail = "";
  }

  private open(): void {
    if (!this.wanted) return;
    this.status = "connecting"; this.detail = "Connecting to the bridge";
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.status = "error"; this.detail = "The address is not valid, or the browser blocked it";
      return;
    }
    this.ws = ws;
    const beat = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "hb", visible: document.visibilityState === "visible" }));
    };
    ws.onopen = () => {
      this.retry = 1500;
      this.status = "waiting"; this.detail = "Connected, waiting for the bridge to describe its streams";
      beat();
      this.hb = window.setInterval(beat, 5000);
    };
    ws.onmessage = (ev) => {
      let m: BridgeMsg;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "hello") this.onHello(m);
      else if (m.type === "samples") this.onSamples(m);
      else if (m.type === "status") { if (m.message) this.detail = m.message; if (m.state === "error") this.status = "error"; }
      else if (m.type === "error") { this.status = "error"; this.detail = m.message ?? "Bridge error"; }
    };
    ws.onclose = () => {
      window.clearInterval(this.hb);
      if (!this.wanted) return;
      this.status = "connecting"; this.detail = "Connection lost, retrying";
      window.setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 20000);
    };
    ws.onerror = () => ws.close();
  }

  private onHello(h: Hello): void {
    if (h.protocol && h.protocol !== "sensory-space-eeg") { this.status = "error"; this.detail = `Unknown protocol "${h.protocol}"`; return; }
    if (h.version && h.version > 1) { this.status = "error"; this.detail = `Protocol version ${h.version} is newer than this app understands`; return; }
    this.streams.clear(); this.analysers.clear();
    for (const s of h.streams ?? []) {
      if (!s?.id || !s.type || !(s.channel_count > 0)) continue;
      this.streams.set(s.id, s);
    }
    this.hasBandsStream = [...this.streams.values()].some((s) => s.type === "EEGBands");
    const types = [...this.streams.values()].map((s) => s.type);
    if (!types.includes("EEG") && !this.hasBandsStream) {
      this.status = "waiting"; this.detail = "The bridge offers no EEG stream";
    } else {
      this.detail = `Streams: ${types.join(", ")}`;
    }
    const wanted = [...this.streams.values()].filter((s) => ["EEG", "EEGBands", "Quality", "HeartRate", "Accelerometer", "Gyroscope"].includes(s.type)).map((s) => s.id);
    this.ws?.send(JSON.stringify({ type: "subscribe", streams: wanted }));
  }

  private onSamples(m: Samples): void {
    const info = this.streams.get(m.stream);
    if (!info || !Array.isArray(m.x) || !m.x.length) return;
    const t = this.now();
    const push = (name: string, x: number, q: number) => this.bus.push(name, this.base[name].norm(x), q, t);
    const last = m.x[m.x.length - 1];
    switch (info.type) {
      case "EEG": {
        if (this.hasBandsStream) return;
        let an = this.analysers.get(m.stream);
        if (!an) {
          const unit = (info.channels?.[0]?.unit ?? "").toLowerCase();
          an = new BandAnalyser(info.channel_count, info.nominal_srate || 256, unit.startsWith("microvolt") || unit === "uv" || unit === "µv");
          this.analysers.set(m.stream, an);
        }
        for (const s of m.x) an.push(s);
        if (an.ready && t - this.lastAnalysis >= 1) {
          this.lastAnalysis = t;
          const r = an.analyse();
          if (r) this.useBands(r.rel, r.quality);
        }
        break;
      }
      case "EEGBands": {
        const labels = (info.channels ?? []).map((c) => c.label ?? "");
        this.useBands(bandsFromLabels(labels, last), 1);
        break;
      }
      case "Quality": {
        let sum = 0, n = 0;
        for (const v of last) if (Number.isFinite(v)) { sum += Math.min(1, Math.max(0, v)); n++; }
        if (n) this.quality = sum / n;
        break;
      }
      case "HeartRate": {
        const hr = Number(last[0]);
        if (hr > 30 && hr < 200) push("body.heart", hr, 1);
        break;
      }
      case "Accelerometer":
      case "Gyroscope": {
        const v = Array.from(last, Number);
        if (this.lastMotion && v.some((x) => x)) {
          const d = Math.sqrt(v.reduce((acc, x, i) => acc + (x - this.lastMotion![i]) ** 2, 0));
          this.motion += (Math.min(d, 60) - this.motion) * 0.3;
          push("body.motion", this.motion, 1);
        }
        this.lastMotion = v;
        break;
      }
    }
  }

  /** derived EEG signals; `ownQuality` is the share of channels accepted this second */
  private useBands(rel: Record<string, number>, ownQuality: number): void {
    const q = ownQuality * this.quality;
    this.status = "live";
    this.detail = q > 0.6 ? "Good signal" : q > 0.15 ? "Weak signal: the scene leans less on the band" : "No usable signal: the scene carries on by itself";
    if (q <= 0) return;   // nothing meaningful: neither used nor allowed to shift the baseline
    const t = this.now();
    const push = (name: string, x: number) => this.bus.push(name, this.base[name].norm(x), q, t);
    const slow = rel.theta + rel.alpha, fast = rel.beta;
    push("eeg.theta", rel.theta); push("eeg.alpha", rel.alpha); push("eeg.beta", rel.beta);
    push("eeg.calm", slow + fast > 0 ? slow / (slow + fast) : 0.5);
  }
}

/** same-origin proxy path; a deployment maps this to the bridge */
export function defaultBridgeUrl(): string {
  const u = new URL("bridge/eeg/ws", document.baseURI);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}
