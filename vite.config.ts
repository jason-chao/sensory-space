import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH: set when the site is served from a sub-path (for example a project page).
// EEG_BRIDGE_UPSTREAM: where the dev server forwards /bridge/eeg (kept in .env.local, never committed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const upstream = env.EEG_BRIDGE_UPSTREAM;
  return {
    base: env.BASE_PATH || "./",
    server: {
      proxy: upstream
        ? { "/bridge/eeg": { target: upstream, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/bridge\/eeg/, "") } }
        : undefined,
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        workbox: { navigateFallbackDenylist: [/^\/bridge\//] },
        manifest: {
          name: "Sensory Space", short_name: "Sensory Space", description: "A calm space of slow light and sound.",
          display: "fullscreen", background_color: "#05070d", theme_color: "#05070d",
          icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
        },
      }),
    ],
    test: { include: ["tests/**/*.test.ts"] },
  };
});
