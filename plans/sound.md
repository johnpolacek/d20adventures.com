# Sound

Goal: one sound system in `@d20/ui`, heard the same in the website and the desktop app. Opened 2026-11-19.

## Principles

- Subtle: soft, low and short. Never a chime or ding for a result (owner, 2026-11-14).
- The stage stays silent. `packages/stage` emits events. `@d20/ui` turns them into sound.
- One engine, one `AudioContext`, one setting. No host code in the sound module.
- Every sound is optional. A missing file or a locked context never blocks play.

## Owner decisions, 2026-11-19

- Sources: a mix. CC0 recordings first, made sounds to fill gaps.
- No music.
- No footsteps.

## Where it lives

- `@d20/ui/sound/engine`: one context, a master at 0.45, buses `ui`, `dice`, `fx`, `ambience`, `voice`. Wakes on the first press or key. Suspends when sound is off or the tab is hidden. `play` rotates takes, `whoosh` makes air from noise.
- `@d20/ui/sound/settings`: the `d20.sound` key, with listeners.
- `@d20/ui/sound/dice`: the dice sound, moved unchanged onto the engine.
- `@d20/ui/sound/fx`: stage effect events to cues.
- `@d20/ui/sound/ambience`: up to three beds per set, looped by overlapping passes with a crossfade, faded across set changes.
- `@d20/ui/sound/use-stage-sound`: `StagePlay` calls it once. Both hosts get it, since hosted web play renders `StagePlay`.
- `Stage.listen` reports `effect` (start, and land for missiles, with `struck`) and `prop`. Sets name their beds in `ambience`.
- Files: `public/stage/sounds/fx` (mono) and `ambience` (stereo), MP3, levelled by `scripts/sound-assets.ts`. Sources in `public/stage/sounds/SOURCES.md`. Raw packs in `~/Desktop/d20-sound-sources`.
- `/dev/sound` plays every cue and bed.

## Stages

1. Engine. Done 2026-11-19.
2. Stage events. Done 2026-11-19. No `hit`, `line` or `shot` events: effects cover hits, and nothing sounds lines or shots yet.
3. Combat cues. Done 2026-11-19. Blades, blows, arrow thunks, fire and spells are CC0 recordings. Swings that miss, flights, aura, mist, sparkles, lightning and frost are made noise.
4. Ambience. Done 2026-11-19. Nine beds: hearth, crowd, wind, night, birds, river, dawn, dungeon, drip. All 41 sets have beds. Levels halved 2026-11-20 at the owner’s ask. Silent under the home screen and its pages, which the owner asked for.
5. Voice. Partly done 2026-11-21. `sound/narrator.ts` reads the story aloud with Kokoro on the `voice` bus, in the desktop app only. Ambience does not duck under it yet.
6. UI cues, if wanted. At most a soft cue for "your turn" and a card opening.

## Checked

- Every file decodes in Chrome. Every cue and bed reaches the output, all under the dice. Beds loop with no gap, switch, and stop with sound off.
- Not yet heard by the owner. Not yet heard in the Tauri app's WebKit view, or on iOS.

## Follow-ups

- Listen on `/dev/sound` and tune levels. The crowd bed is a shouting crowd, filtered and kept low. It may not suit a quiet ballroom.
- Effects in a real fight were not played through end to end.
