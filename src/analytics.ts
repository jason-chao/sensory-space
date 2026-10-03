/** Anonymous usage counts for the public site, through a self-hosted, cookieless
 *  counter that accepts the Umami tracker format. Three locks: the id and script
 *  address exist only in the public build; the script is attached only on the
 *  public host names; and the counter itself accepts only its allowed domain.
 *  Nothing from body signals, session files or typed names is ever sent. */

export const PUBLIC_HOSTS = ["sensory-space.org", "www.sensory-space.org"];
const OPT_OUT_KEY = "umami.disabled";

type Props = Record<string, string | number | boolean>;
interface Tracker { track: (name: string, props?: Props) => void }
declare global { interface Window { umami?: Tracker } }

/** pure decision, tested separately */
export function shouldEnable(env: { id?: string; src?: string }, hostname: string): boolean {
  return !!env.id && !!env.src && PUBLIC_HOSTS.includes(hostname.toLowerCase());
}

export function optedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
}
export function setOptOut(out: boolean): void {
  try { out ? localStorage.setItem(OPT_OUT_KEY, "1") : localStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ }
}

let enabled = false;
const queue: [string, Props | undefined][] = [];

/** attach the tracker if, and only if, every lock is open */
export function init(): boolean {
  const env = { id: import.meta.env.VITE_ANALYTICS_ID as string | undefined, src: import.meta.env.VITE_ANALYTICS_SRC as string | undefined };
  if (!shouldEnable(env, location.hostname)) return false;
  enabled = true;
  const s = document.createElement("script");
  s.defer = true;
  s.src = env.src!;
  s.dataset.websiteId = env.id!;
  s.dataset.domains = PUBLIC_HOSTS.join(",");
  s.dataset.doNotTrack = "true";
  s.addEventListener("load", flush);
  document.head.appendChild(s);
  return true;
}

export function isEnabled(): boolean {
  return enabled;
}

function flush(): void {
  if (!window.umami) return;
  for (const [n, p] of queue.splice(0)) window.umami.track(n, p);
}

/** record an event; silently nothing when analytics is off */
export function track(name: string, props?: Props): void {
  if (!enabled || optedOut()) return;
  if (window.umami) window.umami.track(name, props);
  else if (queue.length < 100) queue.push([name, props]);
}

/** call fn at most once per `ms` per key, with the latest value */
export function debouncer(ms: number): (key: string, fn: () => void) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (key, fn) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, ms));
  };
}

export function screenClass(w: number): string {
  return w >= 3000 ? "4k" : w >= 1900 ? "hd" : w >= 1200 ? "laptop" : w >= 700 ? "tablet" : "phone";
}
