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
| R6 | First input: EEG band through the EEG bridge; input architecture kept open | Built: signal bus, source contract, mapping modes |
| R7 | Optional recording for later playback, off by default | Built as session files; video later |
| R8 | A sensory space for everyone to relax and feel good | Ongoing: needs user feedback |

## Decisions made by the owner

| Topic | Decision |
|---|---|
| Audience | Mainly adults. Public installations and home first; other settings possible |
| Operator | The person themself or a facilitator |
| EEG route | Through the EEG bridge's WebSocket |
| Hosting | Internal deployment first. Public static hosting later. No deployment details in the repository |
| EEG role | A gentle, unscored influence first. More modes may follow |
| Recording | Session file first. Shareable video later |
| Sound sources | Synthesis, and public-domain material where useful |
| User feedback | After the first version ships |
| Licence | PolyForm Internal Use, for now |
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

## Next

| Priority | Item |
|---|---|
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
