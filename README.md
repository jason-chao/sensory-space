# Sensory Space

Slow light and sound to relax with, generated live in the browser. It is designed with autistic people especially in mind, and for anyone who wants a calm space. It works with a projector and good speakers, or in a window on an ordinary computer.

Sensory Space is for relaxation and enjoyment. It is not a medical device and not a treatment.

## What it does

- **20 scenes**: aurora, lava lamp, fireflies, pool light, ink in water, breathing orb, night sky, fractal garden, rain on a pond, bubbles, lanterns, kaleidoscope, silk threads, sea glass, colour wash, resonating lamps, flowers, water of light, brush strokes, light lattice.
- **10 colour palettes**, with brightness, speed, detail, colour strength and an "island of light" mask.
- **Change over time**: optional. Set how many minutes between scenes, between palettes, and per full rotation of the colours, plus a delay before changes begin. Off by default; when on, every change is a slow cross-fade.
- **8 named soundscapes** such as Shore at dusk, Night garden and Temple bells, each described by what plays.
- **11 sound layers**, all synthesised: drone, chimes, singing bowls, plucked strings, ocean, rain, wind, stream, brown noise, soft pulse, breath. Five scales, including two Japanese pentatonic scales.
- **Touch**: touching or clicking the picture makes a bloom of light and a note. The same place gives the same note. Some scenes answer in their own way: lamps pass light to their neighbours, flowers scatter, water parts.
- **Reactive input**: optional. The first supported device is an EEG band through a EEG bridge. Signals gently tint the space; nothing is scored.
- **Session recording**: optional and off by default. A small file that the app can replay later.
- **Works offline** once loaded, and can be installed as an app.

## Controls

The control bar has four stepper groups, each with a caption and its current value (Scene, Colours, Motion, Volume), and four actions with a symbol and a word (Ease, Stop, Settings, Hide). Settings are grouped by concept: Picture, Sound, Changes, Input, Setups, Recording, Help.

| Key | Action |
|---|---|
| `←` `→` | Previous or next scene |
| `C` `V` | Next or previous colours |
| `+` `−` | Motion faster or slower |
| `↑` `↓` | Volume up or down |
| `E` | Ease: dimmer, slower and quieter until pressed again |
| `X` | Stop at once: black and silent. Press again to resume |
| `M` | Mute |
| `P` | Hold still |
| `B` | Picture off |
| `F` or double-click | Full screen |
| `S` | Settings |
| `H` | Hide or show the control bar |

The controls and the pointer hide after a few seconds without input, and come back on a click, a key or a real mouse movement. `H` or the Hide button hides the bar until the small mark in the corner, or `H`, brings it back.

## Safety built in

- Brightness changes are rate-limited region by region as the last step before the screen, so no scene, setting or input can produce rapid flashing. This lowers risk; it cannot remove it for every person and room.
- Sound passes through a limiter and starts quietly. Set the room volume on the speakers first.
- Nothing changes suddenly: every control is followed smoothly.

The reasoning and the evidence are in [docs/RESEARCH.md](docs/RESEARCH.md).

## Run it

Requires Node 20 or later.

```bash
npm install
npm run dev        # development server
npm run build      # production build in dist/
npm run preview    # serve the production build on port 4173
```

### Checks

```bash
npm test                      # unit tests
npm run preview &             # the next two need the preview server
npm run flashcheck            # photosensitivity check on the real renderer
node scripts/audiocheck.mjs   # loudness ceiling check
node scripts/shots.mjs shots  # a screenshot of every scene
```

The browser checks use Playwright (`npx playwright install chromium` once).

## Connecting an EEG band

The app expects a EEG bridge to be reachable under `/bridge/eeg` on the same origin as the page. Serving both from one origin means a page loaded over https reaches the bridge over wss with no browser exception.

- **Development**: copy `.env.example` to `.env.local`, set `EEG_BRIDGE_UPSTREAM`, and run `npm run dev`. The dev server forwards the path.
- **Deployment**: see below. The bundled server forwards the path.
- **Elsewhere**: enter the WebSocket address under Settings, Reactive, Bridge address.

To try the reactive features without hardware, choose "Try demo signals".

Sensory Space does not send or store signal data unless you record a session with signals included. The bridge is a separate system and may keep its own records.

## Deploy with Docker

```bash
cp .env.example .env    # set the upstream, ports and https address
docker compose up -d --build
```

The container serves plain http on `HTTP_PORT` and https on `HTTPS_PORT` with a self-signed certificate. Browsers will ask you to accept the certificate once. Use the https address when you want the screen to stay awake, offline install, or device access, since browsers allow those only on secure pages.

To remove the certificate warning, and to allow offline install from this server, trust its root certificate on each viewing computer. Export it with:

```bash
docker exec sensory-space cat /data/caddy/pki/authorities/local/root.crt > sensory-space-root.crt
```

Keep real addresses in `.env`, which is not committed.

For static hosting without a bridge (GitHub Pages, Cloudflare Pages), publish `dist/`. Set `BASE_PATH` at build time if the site lives under a sub-path.

## Adding things

- **A scene**: add an entry to `src/visual/scenes.ts`. A scene is one GLSL function of position and time. It needs no safety code of its own.
- **A sound layer**: add a factory in `src/audio/engine.ts` and an entry in `src/audio/voicelist.ts`.
- **An input device**: implement `SignalSource` in `src/signals/sources.ts` and push normalised values to the bus.
- **A reactivity mode**: add a table of routes to `MODES` in `src/signals/mapping.ts`.

## Layout

```
src/core      simulation clock, parameters, seeded randomness
src/visual    renderer, safety limiter, scenes, palettes
src/audio     sound engine and layers
src/signals   signal bus, device sources, mapping modes
src/record    session recording and replay
src/ui        control panel
scripts       browser-based checks
docs          research and decisions, plan
```

## Licence

PolyForm Internal Use License 1.0.0. See [LICENSE.md](LICENSE.md).
