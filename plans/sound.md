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
- Crowding, in `engine.ts`: each bus caps the sounds playing at once (`VOICES`), a cue repeated within 35 ms is staggered, one that would wait past 120 ms is dropped, and a sound too quiet to hear never plays. After Brushwild (kevintngo/procedural-rpg, MIT).
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
4. Ambience. Done 2026-11-19. Thirteen beds: hearth, crowd, wind, night, birds, river, dawn, dungeon, drip, hull, rain, roof-rain, storm. All 41 sets have beds. Levels halved 2026-11-20 at the owner’s ask. Silent under the home screen and its pages, which the owner asked for.
5. Voice. Partly done 2026-11-21. `sound/narrator.ts` reads the story aloud with Kokoro on the `voice` bus, in the desktop app only. The stage keeps time with it 2026-11-23: a paragraph's camera, entrances, walks, exits and effects wait for its first words, and a cue tied to a later sentence, or a spoken line, waits for that sentence. Ambience ducks under it 2026-11-23: `duck()` in `engine.ts` dips the ambience bus to half (about 6 dB down), settling over 0.8 s from the first words, holds 1.5 s past the last, then eases back over 2.5 s. A paragraph that starts within the hold keeps the dip, so sentences and paragraphs ride through as one. The four numbers are `DUCK` in `engine.ts`, to tune by ear on `/dev/sound` (Duck row: hold, a 4 s line, two paragraphs a second apart).
6. UI cues, if wanted. At most a soft cue for "your turn" and a card opening.

## Checked

- Every file decodes in Chrome. Every cue and bed reaches the output, all under the dice. Beds loop with no gap, switch, and stop with sound off.
- In the Tauri app's WebKit view, 2026-11-23, measured, not heard, by playing into the Owlbear fight with `VITE_D20_TRACE=1` (`apps/desktop/src/dev-trace.ts`): the context runs at 48 kHz after the first click and is suspended before it. The bed starts with the scene, dice sound with the roll, the arrow cue with the hit, and the narrator with each paragraph. The ambience dips while the voice speaks and comes back after. Peaks at each bus, before the master: voice to −1 dB, fx to −6, dice to −13, ambience −35 to −63.
- The narrator skips the first paragraph of a game while its voice is still loading, as `use-narrator.ts` intends.
- Not yet heard by the owner, or on iOS.

## Follow-ups

- Listen on `/dev/sound` and tune levels, and the duck's depth, dip, hold and ramp. The crowd bed is a shouting crowd, filtered and kept low. It may not suit a quiet ballroom.
- In the app, listen to the Owlbear fight: whether the forest bed, at −35 to −63 dB before the master, is heard at all, the arrow against the dice, and the narrator over both.
