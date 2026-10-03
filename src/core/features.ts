/** Build-time feature switches. They come from the deployment's environment at
 *  build time, so a plain checkout and the public site have them off. */
export const on = (v: unknown): boolean => v === "1" || v === "true" || v === true;

export const FEATURES = {
  /** the Input tab: EEG bridge, demo signals, reactivity modes. Off unless VITE_FEATURE_INPUT=1 at build time. */
  input: on(import.meta.env.VITE_FEATURE_INPUT),
};
