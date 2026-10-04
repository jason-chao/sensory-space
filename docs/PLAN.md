# Sensory Space: plan and status

Last updated: 2026-10-02. Research, reasoning and sources are in [RESEARCH.md](RESEARCH.md).

## Requirements

| # | Requirement | Status |
|---|---|---|
| R1 | Browser-based generative visuals and live-generated sound for relaxation and fascination, designed especially with autistic people in mind | Built |
| R2 | Works alone, or reacts in real time to external devices | Built |
| R3 | Full screen on a projector with good speakers, or windowed on an ordinary computer | Built |
| R4 | A variety of switchable visuals and colours | 20 scenes, 10 palettes, change over time |
| R5 | A variety of sounds, generated live, free of copyright concerns | 11 synthesised layers, 5 scales |
| R6 | First input: an EEG band through a bridge; input architecture kept open | Built: open protocol based on Lab Streaming Layer, in-browser band analysis, signal bus, mapping modes |
| R7 | Optional recording for later playback, off by default | Built as session files; video later |
| R8 | A sensory space for everyone to relax and feel good | Ongoing: needs user feedback |

## Decisions made by the owner

| Topic | Decision |
|---|---|
| Audience | Mainly adults. Public installations and home first; other settings possible |
| Operator | The person themself or a facilitator |
| EEG route | Through a bridge speaking the EEG bridge protocol (docs/EEG-BRIDGE-PROTOCOL.md) |
| Hosting | Internal deployment first. Public static hosting later. No deployment details in the repository |
| EEG role | A gentle, unscored influence first. More modes may follow |
| Recording | Session file first. Shareable video later |
| Sound sources | Synthesis, and public-domain material where useful |
| User feedback | After the first version ships |
| Licence | MIT |
| Scenes | As many as practical |

## Architecture

```
devices -> sources -> signal bus (0..1 around personal baseline, confidence, freshness)
                          |
                    mapping mode (bounded routes, influence ceiling)
                          |
settings (store) -> simulation (fixed step, seeded, smooth following, calm)
                     |                          |
              scenes (stateless shaders)   sound layers (synthesised)
                     |                          |
              brightness limiter           limiter and soft clip
                     |                          |
                  screen                     speakers
                       \____ session recorder ____/
```

## Done in version 0.1

- Engine with fixed-step simulation, seeded randomness and smooth parameter following
- Regional brightness limiter, red guard, automated flash check with a control case
- 15 scenes, 10 palettes, island-of-light mask, pattern variations
- 10 sound layers, shared reverb, master limiter, automated loudness check
- Calm, stop, mute, sound only, hold still
- Touch interaction with repeatable notes
- Signal bus, demo source, EEG source, two reactivity modes
- Session recording and replay
- Offline install, settings and presets saved on the device
- Container with same-origin bridge forwarding over http and https

## Done in version 0.2 (first user feedback)

- Control bar hides on demand; automatic hiding ignores mouse jitter
- Soft spectrum as the default palette
- Scenes and palettes change over time, with colour rotation and a start delay
- Five scenes inspired by immersive digital art: resonating lamps, flowers, water of light, brush strokes, light lattice
- Two Japanese scales and a plucked-string layer
- Scenes may keep a memory of their previous frame (trails)

## Done in version 0.3 (second user feedback: control organisation)

- Bar: captioned stepper groups with current values (Scene, Colours, Motion, Volume) and symbol-plus-word actions (Ease, Stop, Settings, Hide); symbols-only option
- "Calm" renamed "Ease" and described as a reversible reduction; two-way motion and volume controls
- Settings regrouped by concept into seven tabs with remembered sections
- Live scene thumbnails; named soundscapes; "Custom" shown after manual changes; reset to defaults
- Clearer scopes: hold still freezes everything, start delay counts from the session start
- Automatic changes off by default; colour rotation set in minutes per cycle like the other two

## Done in version 0.4 (open EEG protocol)

- EEG bridge protocol based on Lab Streaming Layer's stream model
- Generic EEG source: band powers and quality computed in the browser from raw EEG; optional band, quality, heart-rate and motion streams
- No device-specific names in the repository

## Done in version 0.4.1

- Soundscape stepper in the control bar, so sound gets the same treatment as picture

## Done in version 0.5 (public release)

- Full screen in the control bar in place of Stop; Stop stays on `X` and in the settings header
- Art framing: tagline, About section with the author, no disclaimer text
- README with engine-rendered stills and an animation

## Done in version 0.6

- Fractal garden softened after user comments; Rolling waves and Infinite dots added (22 scenes)
- Settings tabs in one equal row; protocol link and GitHub mark in Help; default palette first
- Public site at sensory-space.org on Cloudflare Pages

## Done in version 0.7

- Anonymous usage counting on the public site only, with a self-hosted cookieless counter; opt-out in About

## Done in version 0.8

- Press-and-drag wake answered by every scene in its own way; recorded and counted
- Control bar reflows into two rows on phones
- Fractal garden withdrawn pending rework

## Done in version 0.8.1

- Colour wash always textured and lit; the limiter also slows colour change; flash check measures colour

## Done in version 0.9

- The drag wake is a smooth ribbon: no cusps, scalloping or creases
- Nine scenes answer a tap in their own way, with matching sounds

## Done in version 0.9.1

- Opening: the scene runs in view, any tap begins, a hand hint and a daily row of eight scene thumbnails, one per kind
- Scenes, palettes and soundscapes ordered to alternate character

## Next

| Priority | Item |
|---|---|
| 0 | Update the existing EEG bridge to the new protocol, then test the band analysis on a real headset |
| 0 | Rework the withdrawn fractal garden, or replace it, and test it with the viewers who found it uneasy |
| 1 | Feedback sessions with autistic adults; adjust defaults, scenes and controls |
| 2 | Verification with an external flash analyser on exported video |
| 3 | Structured listening tests of the sound layers |
| 4 | Two-window mode: controls on one screen, picture on the projector |
| 5 | Video export of a session |
| 6 | More devices: heart-rate straps, MIDI controllers, switches, microphone, camera motion |
| 7 | More reactivity modes, defined as data |
| 8 | Larger interactive pieces: a loom of sustained threads; a slowly growing pond ecosystem; a saved personal gesture; koi leaving trails |
| 9 | Seeking within a replay |
| 10 | Optional public-domain nature recordings as extra sound layers |
