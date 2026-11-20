# Sound

Goal: one sound system in `@d20/ui`, heard the same in the website and the desktop app. Opened 2026-11-19.

## Principles

- Subtle: soft, low and short. Never a chime or ding for a result (owner, 2026-11-14).
- The stage stays silent. `packages/stage` emits events. `@d20/ui` turns them into sound.
- One engine, one `AudioContext`, one setting. No host code in the sound module.
- Every sound is optional. A missing file or a locked context never blocks play.

## Today

- `packages/ui/src/stage/dice-sound.ts` is the only game sound. Three recorded d20 takes, plus Web Audio thuds for the verdict.
- It holds its own context, a master gain at 0.45, the `d20.sound` on/off key, and the first-press unlock.
- Callers: `roll-result.tsx`, `prompt-card.tsx`. The toggle lives in `apps/desktop/src/stage-play.tsx`.
- The website's hosted play renders the desktop's `StagePlay`, so both hosts already share the play view.
- Files live in `public/stage/sounds`. The site gets them from the bucket through `stage:sync` and the `/stage` rewrite. The app copies `public/stage` in `apps/desktop/scripts/build-runtime.ts`.
- Storyview narration (`use-storyview-player.ts`) plays TTS through an `<audio>` element, outside any shared engine.
- The app's CSP has no `media-src`. Fetch and decode under `connect-src 'self'` works. An `<audio>` element on a blob would not.

## Design

- `@d20/ui/sound/engine.ts`: the context, buses (`ui`, `dice`, `fx`, `ambience`, `voice`), master and per-bus levels, unlock, ducking.
- `@d20/ui/sound/cues.ts`: a typed table of named cues. Each is takes from files, a synth function, or both. Takes rotate so repeats differ.
- `@d20/ui/sound/settings.ts`: on/off and master volume in localStorage, read by both hosts. Keeps the `d20.sound` key.
- `@d20/ui/sound/use-stage-sound.ts`: subscribes to stage events and plays cues. `StagePlay` calls it once.
- Files: `public/stage/sounds/<group>/<cue>-<n>.mp3`, mono, 44.1 kHz, about 96 kbps. MP3 because the app's WebKit view does not play Ogg. A `SOURCES.md` per group records licences.
- Levels set once in a script (`scripts/sound-levels.ts`, ffmpeg loudnorm), so the code keeps simple gains.

## Stages

1. Engine. Move `dice-sound.ts` onto the engine with no audible change. Settings module, toggle in the shared HUD so hosted web play gets it. A `/dev/sound` page that plays every cue at its level.
2. Stage events. `Stage` gains an event emitter: `hit`, `effect` (kind, element, phase start or land), `step` (cast id, surface), `line`, `shot`. No sound code in `packages/stage`.
3. Combat cues. Hits and the nine effect kinds, with an element tint where it matters (fire, frost, lightning). About 15 cues, 2 or 3 takes each.
4. Ambience. Sets declare an `ambience` bed (tavern, street, forest night, cellar, hall). Beds loop, crossfade on encounter change, and duck under voiced narration.
5. Voice. Route Storyview TTS and stage narration through the `voice` bus, so ducking and the one volume apply.
6. UI cues, if wanted. At most a soft cue for "your turn" and a card opening.

Each stage ends with both typechecks and both builds passing, and is one commit.

## Open questions

- Source of sounds: CC0 libraries (Freesound, Sonniss GDC bundles), generated (ElevenLabs sound effects), or a mix.
- Music: none, sparse stingers, or looped beds per mood.
- Footsteps: worth the event volume, or too busy.
- Mobile web: iOS needs the unlock on a tap, which stage 1 keeps. Background tabs should mute.
