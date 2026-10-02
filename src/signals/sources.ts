import { Baseline, type SignalBus, type SignalDesc } from "./bus";

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
  { name: "eeg.calm", label: "Calm index", source: "", tau: 12, bio: true },
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

interface Frame {
  type: string;
  ch?: {
    calm?: { value: number };
    bands?: { names: string[]; rel: number[] };
    quality?: { verdict: string };
    vitals?: { hr: number | null };
    gyro?: { x: number; y: number; z: number };
  };
  bridge?: { state?: string };
  stalled?: boolean;
  status?: string;
  message?: string;
}

/** EEG band through the EEG bridge's WebSocket.
 *  Only derived, slow measures are used; the raw EEG is never requested.
 *  Each measure is normalised against the wearer's own running baseline. */
export class EegBridgeSource implements SignalSource {
  readonly id = "eeg";
  readonly label = "EEG band (EEG bridge)";
  status: SourceStatus = "off";
  detail = "";
  url = "";
  private ws: WebSocket | null = null;
  private hb = 0;
  private retry = 1500;
  private wanted = false;
  private quality = 0;
  private base: Record<string, Baseline> = {};
  private lastGyro: [number, number, number] | null = null;
  private motion = 0;

  constructor(private bus: SignalBus, private now: () => number) {}

  connect(): void {
    this.wanted = true;
    for (const d of BODY_SIGNALS) this.bus.declare({ ...d, source: this.id });
    for (const d of BODY_SIGNALS) this.base[d.name] = new Baseline();
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    window.clearInterval(this.hb);
    this.ws?.close(); this.ws = null;
    this.bus.removeSource(this.id);
    this.status = "off"; this.detail = "";
  }

  private open(): void {
    if (!this.wanted) return;
    this.status = "connecting"; this.detail = "Connecting";
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
      this.status = "waiting"; this.detail = "Connected, waiting for the headset";
      ws.send(JSON.stringify({ type: "subscribe", channels: ["calm", "bands", "quality", "vitals", "gyro"] }));
      if (this.url.includes("/replay/")) ws.send(JSON.stringify({ type: "play" }));
      beat();
      this.hb = window.setInterval(beat, 5000);
    };
    ws.onmessage = (ev) => {
      let m: Frame;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "frame" && m.ch) this.onFrame(m.ch);
      else if (m.type === "state" && this.status !== "live") {
        const st = m.bridge?.state;
        if (st) this.detail = `Connected. Headset link: ${st}`;
      } else if (m.type === "error") { this.status = "error"; this.detail = m.message ?? "Error"; }
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

  private onFrame(ch: NonNullable<Frame["ch"]>): void {
    const t = this.now();
    if (ch.quality) {
      const v = ch.quality.verdict;
      this.quality = v === "good" ? 1 : v === "adjust" ? 0.35 : 0;
      this.status = "live";
      this.detail = v === "good" ? "Good signal" : v === "adjust" ? "Weak contact: the scene leans less on the band" : "No skin contact: the scene carries on by itself";
    }
    const push = (name: string, x: number, q: number) => this.bus.push(name, this.base[name].norm(x), q, t);
    // poor contact produces meaningless values: they are neither used nor allowed to shift the baseline
    if (this.quality > 0) {
      if (ch.calm && Number.isFinite(ch.calm.value)) push("eeg.calm", ch.calm.value, this.quality);
      if (ch.bands && ch.bands.rel?.length >= 6) {
        const r = ch.bands.rel;
        push("eeg.theta", r[1], this.quality);
        push("eeg.alpha", r[2] + r[3], this.quality);
        push("eeg.beta", r[4] + r[5], this.quality);
      }
    }
    const hr = ch.vitals?.hr;
    if (typeof hr === "number" && hr > 30 && hr < 200) push("body.heart", hr, 1);
    if (ch.gyro) {
      const g: [number, number, number] = [ch.gyro.x, ch.gyro.y, ch.gyro.z];
      if (this.lastGyro && (g[0] || g[1] || g[2])) {
        const d = Math.hypot(g[0] - this.lastGyro[0], g[1] - this.lastGyro[1], g[2] - this.lastGyro[2]);
        this.motion += (Math.min(d, 60) - this.motion) * 0.3;
        push("body.motion", this.motion, 1);
      }
      this.lastGyro = g;
    }
  }
}

/** same-origin proxy path; a deployment maps this to the EEG bridge */
export function defaultBridgeUrl(): string {
  const u = new URL("bridge/eeg/ws/live", document.baseURI);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}
