/** Small inline icons for the control bar: conventional symbols only, each paired with a text label. */
const svg = (d: string, extra = "") => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;

export const ICONS = {
  prev: svg('<path d="M15 6l-6 6 6 6"/>'),
  next: svg('<path d="M9 6l6 6-6 6"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  ease: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  hide: svg('<path d="M3 3l18 18M10.5 10.6A2 2 0 0 0 13.4 13.5M6.7 6.8C4.3 8.3 3 12 3 12s3 6 9 6c1.5 0 2.8-.3 3.9-.9M9.6 5.2C10.3 5.1 11.1 5 12 5c6 0 9 7 9 7s-.7 1.6-2.2 3.2"/>'),
  show: svg('<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  record: svg('<circle cx="12" cy="12" r="6"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
};
