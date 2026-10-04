# Sensory Space: research, method and design decisions

This document records what was learned from the literature and from current practice, how that knowledge was gathered, which decisions it led to, and where each decision lives in the code. It is separate from the README on purpose: the README says how to run the project, this document says why it is built the way it is.

Last updated: 2026-10-02.

## Contents

1. Method and its limits
2. Findings
3. Decisions, and the findings behind each
4. Independent review and what changed because of it
5. What is not yet known or not yet done
6. Sources

---

## 1. Method and its limits

**Questions asked.** Seven questions were set before any design work:

1. What is the evidence for multi-sensory environments (Snoezelen rooms) with autistic people?
2. What is known about autistic sensory processing that bears on visual and sound design?
3. What are the safety limits for light, pattern, motion and sound?
4. Which visual and sonic qualities have evidence of being calming?
5. What can a consumer EEG band credibly measure, and how should biosignals be mapped to light and sound?
6. What do comparable products do, and what can be learned from them?
7. When does software like this become a medical device, and how is neural data regulated?

A second strand asked which browser technologies fit: rendering, audio, device connectivity, recording and replay, deployment, and automated testing.

**How it was gathered.** Structured web searches in October 2026, giving priority to systematic reviews, meta-analyses, published standards (W3C, ITU, WHO) and regulator guidance over single studies and vendor material. The existing EEG bridge project was read directly to establish what the first EEG band and its bridge actually deliver.

**Grading.** Each finding carries a grade:

- **Strong**: a published standard, or a finding replicated across studies.
- **Moderate**: some controlled studies, or one good one.
- **Weak**: small, uncontrolled, contested or vendor-linked.

**Limits, stated plainly.**

- Findings were drawn mostly from abstracts, summaries and guidance pages, not from full-text reading of every paper.
- Numeric thresholds quoted from broadcast standards (ITU-R BT.1702, Ofcom) were not checked against the primary documents. The WCAG thresholds were, and the implementation is built on those.
- No autistic people have yet been consulted. The project owner chose to ship a first version and gather feedback afterwards. Until that happens, every claim here about what autistic users want rests on published research, not on this project's own users.
- Sound quality has been checked by measurement (levels, limits) but not by structured listening tests.

---

## 2. Findings

### 2.1 Multi-sensory environments

| Finding | Grade | Source |
|---|---|---|
| A 2025 systematic review found multi-sensory environments may reduce some behaviours in autism but evidence for other outcomes is insufficient. | Weak | [1] |
| A wider review across developmental disabilities rated most studies as poor, found that better studies more often show no effect, and did not recommend the rooms as an intervention. | Weak | [2] |
| When autistic children had control of the equipment they paid more attention and showed fewer repetitive and sensory behaviours than when an adult controlled it (n=41, ages 4 to 12, one study). | Moderate | [3] |
| Autistic adults surveyed in 2025 valued control over the space, variety and natural elements. Several standard sensory-room features were not widely valued. | Weak to moderate | [4] |
| Snoezelen began as a leisure approach built on choice, not as therapy. | Background | |

**Reading.** There is no sound basis for therapeutic claims. The one design variable with real support is *who holds the controls*.

### 2.2 Autistic sensory processing

| Finding | Grade | Source |
|---|---|---|
| Sensory differences are very common in autism and vary widely. Over-sensitivity, under-sensitivity and sensory seeking can coexist in one person and change from day to day. | Strong | [5] |
| Autistic adults describe bright light, flicker, motion, pattern and particular colours as sources of fatigue and stress. | Moderate (qualitative) | [6] |
| Fascination with lights, spinning and repetitive motion is well described. Evidence for specific content (bubbles, water, particles) is mostly from practitioners. | Weak | [5] |
| One small study found colour preferences that differed from non-autistic children. It should not be generalised. | Weak | [7] |
| Reduced tolerance of sound (hyperacusis) affects roughly 27% (measured) to 41% (self-reported) of autistic people. | Moderate to strong | [8] |
| Technology made "for" autistic people has mostly pursued non-autistic goals such as correcting behaviour. Autistic-led critique asks for technology that serves the user's own interests. | Strong as critique | [9] |

**Reading.** One fixed "calming" design cannot suit everyone. The design must offer a range from very low to rich stimulation, start low, avoid surprise, and treat enjoyment, including repetitive enjoyment, as the goal.

### 2.3 Safety

**Light.**

| Finding | Grade | Source |
|---|---|---|
| Epilepsy is far more common in autism (median about 12%, against under 1% generally). | Strong | [10] |
| WCAG 2.3.1: no more than three flashes in any one second. A flash is a pair of opposing changes in relative luminance of 10% or more of maximum, where the darker state is below 0.80. A red flash involves saturated red, R/(R+G+B) of 0.8 or more. The exemption for small areas is 25% of a 10 degree visual field. | Strong | [11] |
| WCAG 2.3.2 (the stricter level) drops the size exemption: no more than three flashes per second at all. | Strong | [11] |
| Broadcast rules (ITU-R BT.1702, Ofcom) use similar limits. | Strong (figures not checked at source) | [12] |
| High-contrast stripes near 3 cycles per degree are the most provocative pattern for seizures, migraine and discomfort. | Strong | [13] |
| Meeting these limits lowers risk. It does not make any display safe for every person. | Strong | [11] |

**Motion.** Large-field coherent motion (tunnels, zooms, rolling) produces illusory self-motion and sickness, and the effect grows with field of view. Rotation is the worst case. (Moderate) [14]

**Sound.**

| Finding | Grade | Source |
|---|---|---|
| The WHO-ITU safe listening standard budgets 80 dB for 40 hours a week for adults and 75 dB for children. These are exposure budgets, not comfort targets. | Strong | [15] |
| A browser controls digital level only. It cannot know or limit the sound pressure produced by an amplifier and speakers. | Fact | |
| Binaural beats: of 14 EEG studies in a 2023 review, 5 supported brainwave entrainment, 8 contradicted it and 1 was mixed. | Weak, contested | [16] |

### 2.4 What tends to calm

| Finding | Grade | Source |
|---|---|---|
| Slow paced breathing near six breaths a minute reliably raises heart-rate variability. The best rate differs between people (roughly 4.5 to 6.5). | Moderate to strong for physiology | [17] |
| Mid-complexity fractals (dimension about 1.3 to 1.5) are preferred and linked with relaxed EEG in small studies, mostly from one group. | Weak to moderate | [18] |
| "Red arouses, blue calms" has mixed, context-dependent evidence. Brightness and saturation are more dependable levers than hue. | Weak | [19] |
| Nature sounds improve mood and lower stress. Water sounds scored best for positive affect, birdsong for stress. | Moderate | [20] |
| White and pink noise show a small benefit for people with ADHD and a small cost for others. Brown noise is unstudied. | Weak | [21] |
| Music interventions reduce stress, with larger effects reported at slow tempi of about 60 to 80 beats a minute. | Moderate | [22] |
| Slow attacks, soft treble, consonant scales and gradual change are the working conventions of ambient music. They are untested in trials but low in risk. | Convention | |

### 2.5 Consumer EEG and biosignal mapping

| Finding | Grade | Source |
|---|---|---|
| Consumer dry-electrode bands capture gross spectral features but agree poorly with research equipment and vary between sessions. | Moderate | [23] |
| Forehead electrodes are dominated by blink and muscle artefacts. | Moderate | [24] |
| Slow trends in band power over tens of seconds are credible. Attention or calm "scores", frontal asymmetry and gamma are not dependable on this hardware. | Moderate | [23] [24] |
| Neurofeedback as a treatment in autism: claimed benefits, but controlled studies have serious flaws and evidence is rated insufficient. | Weak, contested | [25] |
| Consumer neurofeedback for mindfulness gives modest self-reported benefit with no demonstrated brain mechanism. Expectation may explain much of it. | Moderate | [26] |

**The hardware in hand.** The band is a single-channel forehead sensor. Through its bridge it supplies the device's own eight band powers once a second, a signal-quality verdict, and, depending on which headband is fitted, heart rate, beat intervals and head angle. The "calm" value published by the bridge is an illustrative ratio of slow to fast band power, not a validated measure. Heart and motion data are absent with one of the two headbands.

### 2.6 Comparable products

- **Interactive projection systems** used in care settings succeed through simple cause and effect, forgiving interaction and easy setup. Independent evidence in autism is thin.
- **Generative ambience products** show that slow, never-repeating sound and image hold attention without demanding it. Their evidence is mostly company-linked.
- **Score-based meditation feedback** (weather that turns stormy when the mind is "busy") creates performance pressure. This is the model to avoid.
- **Music visualisers** rely on strobing, full-field inversions, zoom tunnels and unpredictable cuts across thousands of community presets. They cannot be made safe by review and were excluded.

### 2.7 Regulation and privacy

| Finding | Grade | Source |
|---|---|---|
| Whether software is a medical device turns on its stated intended purpose and its claims (UK, EU and US alike). Relaxation and enjoyment are wellness purposes. Treating, reducing symptoms or training brain activity are medical ones. | Strong | [27] [28] |
| Wellness wording alone does not settle the question for an institutional sale. Advice would be needed. | Caveat | [27] |
| Neural data is personal data, and becomes special-category data when used to infer health. Regulators flag consent and discrimination risks. | Strong | [29] |

### 2.8 Technology

| Area | Finding |
|---|---|
| Rendering | WebGL2 runs in every current browser. WebGPU still lacks default support in some browser and platform combinations, so it would need a WebGL2 fallback anyway. |
| Audio | The Web Audio API can synthesise everything needed (drones, bells, filtered noise, reverb from a generated impulse). Pure synthesis removes all sample-licensing questions. |
| Browser to bridge | A page loaded over https may not open a plain `ws://` connection in some browsers, and others now ask for a local-network permission. Serving the page and the bridge from one origin avoids both. |
| Secure context | Wake lock, offline install and device APIs need https (or localhost). |
| Recording | Recording inputs and regenerating the output gives files of kilobytes. Recording video gives roughly 40 to 60 MB a minute and competes with rendering for processor time. |
| Testing | Photosensitivity can be checked automatically by measuring luminance changes in rendered frames. |

---

## 3. Decisions, and the findings behind each

Each decision lists its reason and where it is implemented.

### D1. Art framing, no therapeutic claims
**Because** evidence for therapeutic effect is weak (2.1) and medical claims change the regulatory status (2.7).
**In practice**: the project presents itself as an art project of light and sound, made with care for autistic adults. It makes no claim to treat or improve anything. An earlier version carried an explicit "not a medical device" statement; on 2026-10-03 the owner chose the art framing instead, and the statement was removed. The regulatory analysis in 2.7 still applies: it is the absence of medical claims that keeps the work outside device rules, not the disclaimer.

### D2. The person holds the controls
**Because** user control is the best-supported design factor (2.1) and sensory needs differ and vary (2.2).
**In practice**: every visual and sound quality is adjustable, with large controls and keyboard shortcuts (`src/ui/panel.ts`, `src/main.ts`). Each sound layer has its own level. Settings persist on the device, and named presets can be saved.

### D3. Start low, never surprise
**Because** sudden change, brightness and loudness are the commonest reported stressors (2.2), and hyperacusis is common (2.2).
**In practice**:
- Every parameter follows changes through a time constant, so nothing jumps (`tau` in `src/core/params.ts`, applied in `src/core/sim.ts`).
- Scene changes and new pattern variations cross-fade over six seconds.
- Sound fades in over five seconds; every note has a soft attack (`src/audio/engine.ts`).
- Three intensity profiles, with Gentle offered first.
- Automatic scene change is off unless the user sets an interval.

### D4. Three levels of "less": calm, stop, and partial modes
**Because** a person who is becoming overloaded needs a fast, certain way out (2.2), and a slow dim is not the same as an immediate stop (review, section 4).
**In practice**:
- **Calm** (`Space`): dims, slows and quietens within a couple of seconds, and stays on until released.
- **Stop** (`X`): black and silent at once. It overrides every setting, mapping and transition. Resuming fades back in from black.
- **Sound only** (`B`), **mute** (`M`) and **hold still** (`P`) serve people who want one sense at a time or no motion.

### D5. A brightness limiter that every scene must pass through
**Because** epilepsy is common in autism, a projector fills the visual field, and the flash thresholds are well defined (2.3).
**In practice** (`src/visual/engine.ts`):
- The picture is divided into a 16 by 9 grid. For each region, the limiter compares the luminance on screen with the luminance the scene now wants, and lets the picture move toward it by no more than 0.35 of full luminance per second. A region that wants to change faster dissolves instead of cutting.
- At that rate one flash, as WCAG defines it, takes at least 0.57 seconds, so at most about 1.75 can occur in a second, against a limit of three. The size exemption in WCAG 2.3.1 is not relied on: the stricter rule (2.3.2) is the target because the projected image is large.
- Saturated red is capped below the red-flash criterion.
- The limiter is the last stage before the screen. A scene, an input device or a programming error upstream cannot bypass it.
- **Verification**: `npm run flashcheck` drives the real renderer through worst cases (controls slammed between extremes, scenes switched every 100 ms, patterns replaced abruptly, every control randomised) and counts flashes per region. A control case with the limiter disabled must be detected as failing, which proves the check can fail.
- **Honest limit**: the limiter governs regions, not single pixels, so fine detail may still twinkle. It reduces risk; it cannot guarantee safety for every person, room and projector. The start screen says so.

### D6. Scenes designed against pattern and motion risks
**Because** high-contrast stripes and full-field motion are known hazards (2.3).
**In practice** (`src/visual/scenes.ts`): no gratings, checkerboards or strobing. No tunnels, zooms or rotation of the whole field: the kaleidoscope unfolds without spinning, the night sky drifts sideways very slowly. Motion is local, on a stable background. An "island of light" control shrinks the picture to a soft circle for people who find a full wall too much.

### D7. Scene and sound content drawn from what has some support
**Because** of the findings in 2.2 and 2.4.

| Content | Basis |
|---|---|
| Water, pond ripples, pool light, ocean, rain, stream, wind | Nature imagery and sound (moderate evidence); valued by autistic adults |
| Lights, bubbles, fireflies, lanterns, lava lamp | Described fascinations (practitioner evidence) |
| Fractal garden, ink, sea glass | Mid-complexity natural-looking structure (weak to moderate) |
| Breathing orb with adjustable pace, breath sound | Slow paced breathing (moderate to strong); optional, never imposed |
| Colour wash | A lowest-stimulation option for sensitive days |
| Slow drone, sparse bells, singing bowls in pentatonic and lydian scales | Slow, consonant music (moderate; conventions) |
| Brown noise, soft pulse | Offered without claims (weak evidence) |
| Ten palettes including a low-blue and a monochrome one | Colour evidence is weak, so choice is offered instead of a prescription |
| No binaural beats | Contested evidence, and pulsing sound is the audio counterpart of flicker |

### D8. Direct interaction: touch makes light and sound
**Because** comparable products succeed through simple cause and effect (2.6), and the review (section 4) argued that people should be able to shape the space, not only watch it.
**In practice**: touching or clicking the picture opens a soft bloom of light and plays one note. Position sets the pitch, so the same place always gives the same note. Predictability is deliberate.

### D9. Sound safety as far as software can take it
**Because** hyperacusis is common and a browser cannot measure loudness in the room (2.3).
**In practice** (`src/audio/engine.ts`): a compressor and a soft clipper sit after everything else, with a fixed ceiling at 0.85 of full scale. A "soften" control rolls off treble. Start-up gain is conservative. The start screen asks for the room volume to be set low first. `scripts/audiocheck.mjs` measures the output with every layer at maximum and fails if the ceiling is exceeded or if the first half second is not near silence.
**Honest limit**: this bounds the digital signal only. Loudness in the room depends on the amplifier.

### D10. All sound synthesised
**Because** synthesis removes every copyright question (2.8) and keeps the app small enough to work offline.
**In practice**: ten layers are generated live. Public-domain recordings are acceptable to the project owner and could be added later as optional layers; none are shipped.

### D11. Devices reduce to named signals on a bus
**Because** many more input devices are expected, and visuals and sound must not depend on any one of them.
**In practice** (`src/signals/`):
- A source implements a small contract and pushes values to a bus. Each signal is a number from 0 to 1 where 0.5 means "this person's usual level", with a confidence value and a timestamp.
- A mapping table routes signals to parameters. A reactivity mode is a named table with a ceiling on influence. Adding a mode or a device does not touch the engine.
- Order of authority: the user's setting is the centre; signals add a bounded offset; calm scales the result; stop overrides everything.

### D12. EEG as a gentle, unscored influence
**Because** the hardware supports slow trends only (2.5), score-based feedback creates pressure (2.6), neurofeedback claims are unsupported (2.5), and a feedback loop that intensifies with agitation could escalate it.
**In practice** (`src/signals/sources.ts`, `src/signals/mapping.ts`):
- Only derived band shares, the bridge's quality verdict, heart rate and head movement are requested. Raw EEG is never requested.
- Each measure is normalised against the wearer's own running baseline, then smoothed over 6 to 15 seconds.
- With weak contact, the influence shrinks. With no contact, readings are ignored and the scene carries on. A signal that stops arriving relaxes to neutral.
- Signals may move colour, detail, tone, reverberation and the pulse rate, within a bounded share of each range. They cannot move brightness or volume.
- Movement slows the scene slightly instead of exciting it.
- There is no score, target or failure state.
- A second mode, "Mirror", makes the link more visible for experimenting, under the same bounds. Further modes can be added as data.
- The interface labels the calm value as an index and makes no claim about what it means.

### D19. One open stream model for every device
**Because** the first bridge was built around one device's own derived values, which other devices do not provide (section 4d), and because an open standard already exists for live physiological streams.
**In practice**: the app accepts one protocol, documented in `EEG-BRIDGE-PROTOCOL.md`, which carries the stream model of Lab Streaming Layer (name, type, channel count, sample rate, channel labels, units, timestamps) over a WebSocket. The baseline every device can meet is one raw EEG stream. Band powers and signal quality are computed in the browser (`src/signals/eeg.ts`), so every device is treated alike. Devices that publish their own band powers, heart rate or motion can add those as further streams.

### D13. The app runs fully without any device
**Because** many autistic people will not tolerate a headband (2.2), and public installations cannot assume hardware.
**In practice**: everything works standalone. A demo source provides wandering signals so the reactive features can be tried without hardware.

### D14. Recording as a small session file, off by default
**Because** the output is generated, so it can be regenerated from its inputs (2.8), and because body signals are sensitive (2.7).
**In practice** (`src/record/session.ts`):
- Recording starts only when the user asks. An indicator shows while it runs.
- The file holds the seed, the starting settings, every later change with its time, and, if the user leaves the box ticked, the normalised signals that influenced the session. Raw device data is never stored.
- The file is saved to the user's device and nowhere else. A file containing body signals says so.
- Replay regenerates the session inside the app. Visuals are stateless functions of time, seed and settings, so they regenerate exactly. Sound replays the same seeded sequence of notes but is not sample-identical.
- Files carry a format version. Unknown settings in old files are ignored.
- Video export is deferred. The design allows it: a session file can be re-rendered frame by frame.

### D15. Fixed-step simulation with seeded randomness
**Because** replay, testing and the safety check all need the same inputs to give the same output.
**In practice**: `src/core/sim.ts` advances in steps of 1/60 second. All random choices come from a seed (`src/core/prng.ts`).

### D16. One origin for the app and the bridge
**Because** of the mixed-content and local-network rules (2.8) and the need for a secure context.
**In practice**: the server that hosts the app forwards a narrow, read-only set of bridge paths (`Caddyfile`). A page loaded over https reaches the bridge over wss with no browser exception. Site addresses come from the environment, so no deployment detail is stored in the repository.

### D17. Privacy wording matched to reality
**Because** signals pass through the bridge before they reach the browser, and the bridge may keep its own records (review, section 4).
**In practice**: the app states that it neither sends nor stores signal data unless a session is recorded with signals included, and that the bridge is a separate system with its own records.

### D18. Technology choices
- **WebGL2 fragment shaders, no rendering library**: universal support, small download, one shader codebase (2.8).
- **Dynamic resolution**: the internal render size falls when frames are slow, so modest hardware driving a large projector stays smooth.
- **Web Audio without a library**: full control of scheduling and levels.
- **No UI framework**: the control panel is small.
- **Installable and usable offline**: the whole app is a few dozen kilobytes.

---

## 4. Independent review and what changed because of it

The plan was reviewed independently by a second AI model (Astra 6) before building. Its main points and the response:

| Review point | Response |
|---|---|
| "Calm" is not an emergency stop. Provide separate stop, mute and freeze. | Adopted (D4). |
| Scenery offers variety of looks more than variety of experience. Give people something to shape, with repeatable results. | Partly adopted: touch interaction with repeatable notes (D8). Larger ideas (a loom of sustained threads, a slowly growing ecosystem, a saved personal gesture) are recorded as future work. |
| Offer a projection mask so the image can be an island of light, not a full field. | Adopted (D6). |
| The safety pass was underspecified: opposing patches can flash while the average stays constant; test extremes, not samples. | Adopted: the limiter works per region, and the automated check drives extremes and includes a control case (D5). The remaining limit below region size is stated. |
| Meeting WCAG reduces risk but does not establish safety. | Adopted in wording (D5, start screen). |
| A digital limiter cannot enforce loudness in the room. | Adopted in wording and start-up guidance (D9). |
| Plain http on a local network lacks a secure context. Prefer https and wss through one proxy. | Adopted (D16). |
| Privacy wording contradicted the data path. | Adopted (D17). |
| The calm value is an illustrative ratio; heart and motion data depend on the headband. | Adopted: no claims attached, absent signals stay neutral (D12). |
| Signals need lifecycle rules: freshness, validity, reconnection, malformed input, precedence. | Adopted (D11, D12): confidence, staleness decay, baseline handling, rejection of invalid values, stated order of authority. |
| Seeds do not guarantee identical output across versions and graphics hardware. | Addressed by making scenes stateless, which removes accumulated drift, and by versioning the file. Sound is described as equivalent, not identical (D14). |
| Move co-design with autistic people and safety validation to the start. | Not adopted for this version, by the owner's decision to ship first and gather feedback after. Recorded as the main open item (section 5). |
| Build one scene and one interaction before a catalogue. | Not adopted: the owner asked for as many scenes as possible. |

---

## 4b. First round of user feedback (2026-10-02) and the response

Four points came back from autistic users of the first version.

| Feedback | Response | Note against the research |
|---|---|---|
| Hide the control bar when it is not needed, on demand, with a mouse or a touchscreen. Users also did not see the automatic hiding work. | A Hide button and the `H` key hide the bar until a faint corner mark or `H` brings it back. Automatic hiding now ignores the small jitter of a resting mouse and returns on a click, a key or a real movement. | Control over the interface itself is part of control over the space (D2). |
| Make the soft spectrum palette the default. | Done for new installations. Saved choices on existing devices are left alone. | Palette evidence is weak (2.4), so a preference stated by users outweighs it. |
| Let scenes and colours keep changing after some time. | A "Change over time" group: a new scene every N minutes, a new palette every N minutes, a slow continuous colour rotation, and an optional delay before changes begin. Every change is a slow cross-fade. First switched on by default, then set to off by default on 2026-10-03 after users found the rotation value unclear; all three are now set in minutes. | The research favoured predictability (2.2); off by default with a chosen pace available matches it. |
| Some users like the immersive digital-art exhibitions of a well-known Japanese collective. Can their visual and audio styles be transposed? | Five new scenes borrow ideas, not works: lamps that pass light and colour to their neighbours when touched; flowers that bud, open and scatter, with petals blown by a touch; water drawn as flowing lines of light that part around a touch; brush strokes drawn slowly in space; waves of colour through a deep lattice of points. Sound gains two Japanese pentatonic scales and a plucked-string layer. | Ideas and techniques are free to use; specific works, names and recordings are not, and none are reproduced. The exhibitions themselves can be dense and fast; these scenes stay slow and pass through the same limiter (D5). Two of the new scenes answer touch directly, which strengthens D8. |

**A technical change for the new scenes.** The water scene keeps a memory of its previous frame to draw trails. Such scenes replay approximately rather than exactly (D14); the owner accepted this.

## 4c. Second round of user feedback (2026-10-02): organisation of the controls

Autistic users with a strong sense of logic found the controls inconsistently organised. The redesign was also reviewed independently (Astra 6), whose main correction was adopted: the temporary "reduce everything" switch, the intensity presets and Stop are three different operations and must not be merged.

| Feedback | Response |
|---|---|
| Text and symbols are mixed inconsistently. | One rule everywhere: stepper groups (Scene, Colours, Motion, Volume) are a caption plus conventional symbols and show their current value; actions (Ease, Stop, Settings, Hide) are a symbol plus a word; scenes are pictures, palettes are swatches, everything else is a plain label with its value. A symbols-only option exists. |
| Why a Calm button that only slows down? Where is a two-way speed control? | "Calm" became "Ease": a reversible switch that makes everything dimmer, slower and quieter on top of the current settings, described as such. Motion speed and volume have two-way controls in the bar and on keys. |
| Scenes can be switched from the bar, colours cannot. | Colours have the same previous and next controls. |
| "Change over time" sat under Scenes although it governs colour too. | It is its own tab, "Changes". "Hold still" now stops colour rotation and automatic changes as well; the start delay counts from the start of the session and also delays colour rotation, as its label says. |
| Scene buttons were text only. | Each scene has a live thumbnail rendered in the current palette. |
| Sound controls were too many and too technical. | Named soundscapes come first, each with a factual description of what plays. Layers and fine control sit below, collapsed. Intensity presets show "Custom" after a manual change. |

**Note on evidence.** Two informal feedback rounds from a few users are not a study. The rule "a caption plus symbols for steppers, a symbol plus a word for actions" is a consistent convention, not a finding about autistic adults in general; it should be tested with the same users.

## 4d. Third round of comments (2026-10-03): the EEG connection

Before making the repository public, the owner asked for the EEG source to be renamed and generalised: the first adapter understood only one bridge's message format, built around one device's own derived values.

| Comment | Response |
|---|---|
| Rename the source to "EEG bridge" and document the accepted format separately. | Done: `EEG-BRIDGE-PROTOCOL.md`. |
| Other devices may not provide the attributes that one specific model provides; expect generic EEG data. | The protocol's minimum is a raw EEG stream. Band powers, artefact rejection and a quality estimate are computed in the browser (D19). Everything beyond raw EEG is optional. |
| Base it on an open, existing standard where possible. | The protocol carries Lab Streaming Layer's stream model unchanged, so any device with an LSL connector can be relayed. |

Compatibility with the first bridge's format was dropped by decision; that bridge will be updated to the protocol.

## 4e. Public release (2026-10-03)

For the public repository the owner asked for the control bar to carry Full screen instead of Stop (Stop remains on the `X` key and in the settings header), for the project to be presented as an art project with the author named, and for the README to show the work itself: stills and a short animation rendered by the engine. All images in the README come from the real renderer, in software rendering, with scenes and palettes chosen by hand; none are photographs of a room.

## 4f. Third round of user comments (2026-10-03): a scene that felt uneasy

Some autistic users found the fractal garden "spooky". On inspection it had three qualities the design otherwise avoids: a dark, speckled interior; fine, high-contrast edge detail that shimmered as the shape changed; and a form that never settled. Response: the fractal now keeps to a rounded, connected shape, uses few iterations so its edge is soft, and is lit and pale inside; it also moved towards the end of the list. Two calmer scenes in the spirit of immersive digital art were added: rolling waves drawn as flowing lines in the manner of Japanese woodblock seas, and fields of soft pulsing dots at many depths after the polka-dot infinity rooms of Yayoi Kusama. Both answer touch gently. Lesson recorded: fine high-contrast detail and dark voids read as unease even when nothing flashes; the brightness limiter does not address this, only design does.

**Follow-up, later the same day.** The softened version still read as uneasy to viewers. The scene is withdrawn from the picker, the stepper and automatic changes, with its code kept for a later rework. A saved setting or recording that names it still renders.

## 4g. Usage counting on the public site (2026-10-03)

**Decision.** The public site keeps anonymous usage counts through a self-hosted, cookieless counter that accepts the Umami tracker format. Nothing is counted on copies people run themselves, on the internal installation or on preview addresses: the counter's id exists only in the public build, the script attaches only on the public host names, and the counter accepts only its allowed domain. Visitors with Do Not Track are left out, and About offers an opt-out stored on the device.

**What is counted.** Page views with country, browser, operating system, device type and screen class (the counter keeps no addresses or user agents). Events about the work: Begin with the chosen profile, screen size and pixel ratio; scene, palette and soundscape changes with how they were made and how long the previous one was kept; layer and setting adjustments, debounced; the comfort controls (ease, stop, mute, hold still, picture off, hidden bar, full screen); automatic-change settings; touches aggregated once a minute; a pulse every two minutes while visible, for dwell time; a leave event with total minutes and scenes seen; one performance reading; and, in installations that include the Input feature, connect and disconnect of a source with the share of time the signal was usable.

**What is never sent.** Signal values, session file contents, names people type, raw user agents. Exact screen size is sent because it tells a projection work which screens it is shown on; it is not combined with anything that could identify a person.

**Why.** The project's audience makes privacy part of its character (2.7, D17), so an advertising-company analytics product with a consent banner was ruled out. The counts answer the questions that matter to a space for lingering: which scenes and sounds people stay with, how long they stay, and whether the comfort controls are found.

## 4h. Direct influence (2026-10-03)

Users asked why a tap only made a note and a bloom while the elements carried on unmoved, and pointed to immersive digital art where touching something changes its course. Response: the engine now keeps the last few seconds of a press-and-drag as a wake, and every scene answers it in its own physical nature (lava follows a hand and splits; drifting elements part and return; colour stirs; threads bend; water flows along the path; lamps and the lattice light the path; the sea swells lift). The owner chose press-and-drag only, with no response to a hovering mouse, and a clearly visible strength. Displacements are capped at about a hand's width, so nothing is flung away, and the wake fades in about a second so the picture returns to rest. Drags are recorded in session files like taps and are counted in usage as seconds of dragging. The flash check gained a fast back-and-forth drag case, which passes. On phones the control bar now reflows into two rows that fit the width, after users saw it cropped.

## 4i. "Flashing colours" in the colour wash (2026-10-04)

Some users reported two colours flashing in the colour wash, and others mistook it for a projector's "no signal" screen. Measurement of the scene under its worst settings showed per-frame changes of under half a percent in brightness and colour, so the software was not flashing; a flat, dark field of colour is exactly what makes a projector's dynamic contrast or auto iris hunt, and what makes a single-chip DLP projector's colour wheel visible. Both complaints had one root: the scene was too close to a blank field.

Responses: the colour wash is now always textured (soft clouds at two scales, slow drifting pools of lighter colour, a floor of light), so it reads as a picture at every setting. The brightness limiter now also limits change of colour at constant brightness, measured per region as half the distance between mean colours, at the same rate as brightness; a test that alternates two saturated hues every four frames now changes colour at about a quarter of the former rate. The flash check reports colour steps and fails above twice the nominal rate (the regional method is approximate at region edges). Display guidance for projector settings remains to be written.

## 4j. Corners in the wake, and taps that do something (2026-10-04)

Users saw spikes, sharp edges and straight lines where a drag bent the silk threads and the sea swells. The cause was in the construction: the wake was a row of point sources, each with a direction flip at its centre (a cusp), spaced apart on a fast drag (scalloping), and combined with a maximum (creases). The wake is now the distance to the smooth ribbon between samples, with a soft core and a soft sum, so bends have no corners. Users also asked for taps that act on the thing tapped, naming flowers and dots. Nine scenes now answer a tap in their own nature (flowers burst and regrow; a dot splits into five and regathers; a bubble pops and regrows; fireflies scatter and return; a thread is plucked and settles; a stone drops into the sea; a drop of colour spreads in the ink; a ring spreads from the orb; a blob is pinched in two), and the tap sound matches the scene (pluck, pop, drop, burst, split, thump, bell). Every response fades back to rest within a few seconds, so the picture never accumulates a mess.

## 4k. The opening, and the order of things (2026-10-04)

Users found the opening uninviting: a dark, blurred card demanded a choice and a press of Begin before anything could be seen, although the only thing that truly needs a tap is sound (browsers will not start audio or full screen without one). Now the first scene runs in full view behind a compact card; any tap anywhere begins, and a tap on the picture is also the first bloom and note. The card carries a hand symbol with a gentle tap motion and "Tap or drag the picture. Sound begins when you do, quietly.", a row of eight thumbnails, one for each kind of response to touch, with the pick within each kind changing once a day per device (the order of kinds is fixed so the row keeps its shape), and a single Begin. Two extra links (full screen, gentle start) were tried and removed as confusing; both are one tap away afterwards. The scene list, the palettes and the soundscapes are now ordered so that stepping with the arrows changes character every time, with the defaults first.

## 5. What is not yet known or not yet done

1. **Only one informal round of user feedback has happened** (section 4b). Structured sessions should ask about enjoyment, sense of control and willingness to return, not about reduced behaviours.
2. **The limiter has not been run through a certified broadcast flash analyser**, only the project's own check.
3. **Sound has not had structured listening tests**, particularly with people who have sound sensitivity.
4. **Real projector conditions** (brightness, room darkness, viewing distance) are outside the software's control and untested.
5. **Regulatory position** for sale to institutions has not been reviewed by a specialist.
6. **Video export**, a two-window control mode for facilitators, more devices and more reactivity modes are designed for but not built.
8. **The EEG path is not live again until a bridge speaks the new protocol.** The band analysis is tested on synthetic signals only, not yet on a real headset.
7. **Session replay cannot yet jump to a chosen time.**

---

## 6. Sources

1. Systematic review of multi-sensory environments in autism (2025). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12255839/
2. Multi-sensory environments for people with developmental disabilities, systematic review. https://researchers.mq.edu.au/en/publications/the-use-of-multisensory-environments-with-individuals-with-develo/
3. Unwin, Powell and Jones (2022). The use of multi-sensory environments with autistic children: exploring the effect of having control of sensory changes. *Autism*. https://pmc.ncbi.nlm.nih.gov/articles/PMC9340127/
4. University of South Australia (2025). Sensory spaces and autistic adults. https://unisa.edu.au/media-centre/Releases/2025/one-size-fits-all-approach-does-not-work-for-autistic-adults
5. Sensory features in autism. https://pmc.ncbi.nlm.nih.gov/articles/PMC5362027
6. Parmar et al. (2021). Visual sensory experiences from the viewpoint of autistic adults. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8217662/
7. Grandgeorge and Masataka (2016). Atypical color preference in children with autism spectrum disorder. https://pmc.ncbi.nlm.nih.gov/articles/PMC5179595
8. Williams et al. Prevalence of decreased sound tolerance in autism: a meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC8349927
9. Spiel et al. (2019). Agency of autistic children in technology research. https://api.crossref.org/works/10.1145%2F3344919
10. Epilepsy in autism. https://pmc.ncbi.nlm.nih.gov/articles/PMC5739118/
11. W3C. Understanding WCAG success criteria 2.3.1 and 2.3.2 (three flashes). https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold
12. ITU-R BT.1702-3 (2023). Guidance for the reduction of photosensitive epileptic seizures caused by television. https://www.itu.int/rec/R-REC-BT.1702-3-202311-I
13. Pattern sensitivity and visual discomfort. https://pmc.ncbi.nlm.nih.gov/articles/PMC6867050
14. Optic flow, vection and visually induced motion sickness. https://oulurepo.oulu.fi/handle/10024/51863
15. WHO-ITU global standard for safe listening devices and systems. https://www.who.int/publications/i/item/9789241515276
16. Ingendoh et al. (2023). Binaural beats to entrain the brain? A systematic review. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10198548/
17. Slow-paced breathing and heart-rate variability. https://link.springer.com/article/10.1007/s10484-024-09637-2
18. Fractals and EEG response. https://pubmed.ncbi.nlm.nih.gov/19065853/
19. Colour and psychological functioning: a review. https://www.frontiersin.org/articles/10.3389/fpsyg.2015.00368/full
20. Buxton et al. (2021). A synthesis of health benefits of natural sounds. https://pmc.ncbi.nlm.nih.gov/articles/PMC8040792
21. White and pink noise and attention: a meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC11283987/
22. de Witte et al. Effects of music interventions on stress-related outcomes. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.572549/epub
23. Consumer and research EEG compared. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11679099/
24. Reliability of frontal alpha asymmetry. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8843903/
25. Neurofeedback in autism: critique of the evidence. https://www.thetransmitter.org/spectrum/weak-waves/
26. Consumer neurofeedback for mindfulness: meta-analysis (2025). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12046271/
27. MHRA. Software and AI as a medical device; crafting an intended purpose. https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device/software-and-artificial-intelligence-ai-as-a-medical-device
28. EU guidance MDCG 2019-11 on qualification of software. https://ec.europa.eu/docsroom/documents/37581/attachments/1/translations/en/renditions/native
29. UK Information Commissioner's Office. Neurotechnology report: regulatory issues. https://ico.org.uk/about-the-ico/research-reports-impact-and-evaluation/research-and-reports/technology-and-innovation/ico-tech-futures-neurotechnology/regulatory-issues/
30. Chrome: local network access. https://developer.chrome.com/blog/local-network-access
31. W3C. Secure contexts. https://www.w3.org/TR/secure-contexts/
32. W3C. Screen Wake Lock API. https://www.w3.org/TR/screen-wake-lock/
33. Electronic Arts IRIS, open-source photosensitivity analyser (candidate for further verification). https://github.com/electronicarts/IRIS
