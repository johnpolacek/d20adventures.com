# feature/stage-turn-mock

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md)

Status: Revision 4 (movement from the narrative via a model, BG3-style turns, prototype presentation) implemented and validated as a dev mock (2026-09-29); not merged · first slice of Stageview phase 4 (the stage-first turn page)

## Goal

Prove the stage-first turn page ([decision 5](stageview.md#stage-first-play-decided-2026-09-29)) before wiring it to Convex. The mock uses scripted turns, with no Convex and no model, and runs March of Davos encounter 1 ("The Gates of Kordavos") at `/dev/turn`, which is dev only.

## Revision 2 (2026-09-29): the prototype's presentation

The owner reviewed the first version, which had a docked side panel and the app's indigo styling. They preferred the Kordavos prototype's presentation and asked for all four of its qualities:
- the full-screen cinematic HUD;
- the perspective bar;
- the living line;
- the warm painterly styling.

The docked layout (`stage-turn-layout.tsx`, `turn-panel.tsx`) was removed.

## What the mock plays

The mock opens on a title card ("Arrival at Kordavos", PLAY), then runs five scripted GM turns:
1. **The Gates of Kordavos.** The intro is narrated as the scene caption over the gate, the line, the party waiting three groups back, and the checkpoint.
   - The **queue loop** keeps the line alive: Garlan questions the groups ahead, travelers answer in bubbles and pay (a coin arcs to the table), and everyone shuffles forward.
   - Then "Next!" calls the party up. The beats wait on the loop's cues (`gate-line:called`, `gate-line:front`).
2. **Hold on Branka.** The GM card asks her business: party portraits, the prompt, a reply box, Suggest and Send.
3. **Cassia.** Garlan's reply, a plate and bubble for each line, then the question to Cassia.
4. **Yeva.** Sleight of Hand, DC 14, rolled on a warm d20, with the outcome branching.
5. **Milos, then "Let them through!"** The beats release the loop: the party walks through the arch and the line carries on behind them. The card closes with "Encounter complete · Next: The Harvest Festival".

Throughout:
- The perspective bar (and keys 1–7) switches between the set and staging shots at any time.
- The journal (top bar) holds every word of the story, the replies and the rolls, plus table chat.
- Clicking a character opens their card. H hides the interface, and settings holds render quality and motion.
- While the GM card is up, shots compose in the space above it (`Stage.setInsets`), so the character being asked stays in view.

## Revision 3 (2026-09-29): Baldur's Gate 3 turns and movement

The owner asked for three changes: clicking a character should take you to them, the headlines should use the site's display serif, and turns should be structured like BG3, with movement.

- **Headlines:** the caption title, title card, card names, journal headings and the roll skill use `font-display` (Cinzel Decorative).
- **Click to travel:** clicking a character on the stage (alpha-tested, so the transparent part of a card does not count) or a portrait flies the camera to them. A second click opens their card.
- **Turn order bar** at the top: the party in initiative order, Garlan as an NPC, the active character larger in gold, and a label for whose turn it is.
- **Movement on your turn:**
  - a dashed range ring on the ground;
  - hover to preview the path with its length (red past a solid footprint or out of reach);
  - click to walk there.
  
  The GM card shows a movement meter (speed 7.5 m for the dwarf and halfling, 9 m otherwise). The camera re-frames the actor where they stop, and the journal records "Moves 4.2 m". The reply button is now **End turn**.
- **Stage API:** `groundAt`, `reach` (straight-line walk against the set's footprints within a budget), `castAt`, and `projectPoint(...).behind`.
- Checked with real mouse events over CDP:
  - hover preview;
  - a 1.8 m move, which drained the meter to 5.7 m;
  - an over-budget or blocked preview;
  - focusing Garlan and Yeva from the turn bar;
  - Garlan's card on the second click.

## Revision 4 (2026-09-29): movement from the narrative

The owner suggested that AI translate narrative action into in-game movement, rather than relying on clicks.

- **`lib/stage/movement.ts`:** the intent schema and prompt. The model returns `stay`, a `place` (a labelled mark), a `character` (the engine stops 1.1 m short), or a `relative` step, plus a pace (walk, hurry, sneak), an optional facing, and a short summary for the log. It is given only the labelled places and nearby characters, each with its distance and bearing from the actor.
- **Set spec:** marks can carry a `label`. The Kordavos gate gained labelled places: the gap in the barrier, the sergeant's table, the brazier, the searched cart, the banner pole, the great arch, and back in the line.
- **`app/_actions/stage-movement.ts`:** a dev-only server action using `currentModel`. Ids the model was not offered collapse to `stay`.
- **In the mock:** End turn runs the model unless the player already clicked to move. The character then walks the clamped path at their pace and is re-framed, and the GM card notes it ("Yeva moves toward the gap in the barrier (4.1 m)"). The journal records the move.
- **`scripts/stage-movement-eval.ts` (`pnpm stage:eval-movement`):** eight actions from the gate scene. **8/8 destinations and paces correct**, about 0.6–1.8 s per call. Pace needed the field to be required, not defaulted, and the rule stated on the field.
- **In the browser:** Branka's speech-only reply kept her still. Yeva's "drifts toward the gap in the barrier" walked her 4.1 m to the gap before her roll.

## Revision 5 (2026-09-29): textured surfaces

At the owner's request, a little of the original site's texture comes back to the flat prototype UI. These are Tailwind `@utility` classes in `app/globals.css`, built from the site's existing pattern tiles:

- `stage-grain`: black paper tinted warm, on panels and plates. Panels also get a soft inner bevel.
- `stage-brass`: "buried" stone over a brass gradient with an embossed bevel. Used for the primary buttons (End turn, Play, active toggles). End turn and Play use Cinzel Decorative.
- `stage-leather`: the same stone grain, dark, on secondary buttons and icon buttons.
- `stage-parchment`: the party name tags.
- `stage-die`: the d20.
- `stage-rule`: the rough gold rule above the perspective bar.

Note: Tailwind v4 dropped a plain `@layer components { … }` block from the build, so these are `@utility` classes instead.

## Revision 6 (2026-09-29): narration panel, title, AI-only movement

- **Movement from the text only.** Click-to-move is gone: no ground targeting, range ring or movement bar (`movement-overlay.tsx` deleted). The model's move from the written action is clamped to the character's speed. Clicking a character still focuses them.
- **Title top-left.** The HUD's top-left now shows the adventure and chapter eyebrow and the encounter title in Cinzel Decorative. It replaces the old brand text and is kept clear of the centred turn order.
- **Narration panel** (`components/stage/narration.tsx`, bottom-left):
  - It shows one paragraph at a time and eases to each paragraph's height. The old text fades out, the panel resizes, then the new text fades in.
  - It carries a turn heading, dots for paragraph position, and Skip.
  - The speaker's plate docks above it; on phones the plate is dropped and the bubble carries the line.
- **Paced for reading.** `BeatPlayer` has a narration clock. Each `narrate` beat holds the scene for `narrationSeconds(paragraph)`: reading time at about 200 wpm now (`readingSeconds`), audio length once voiced. The next paragraph, spoken lines and the end of the beats wait for it; shots, walks and waits carry on underneath.
  - Turn 1 went from about 35 s to about 50 s, with paragraphs at 0, 17.5 and 31.3 s.

## Built (kept for the real page)

| Piece | Path |
|---|---|
| **Queue loop**: the prototype's `Director`, generalized. The set spec has `loops[]`: where the line runs, the station, the pass route and the recycling. The staging has `loops{}`: the official, the party's place, and the lines. Cues are `:next`, `:called` and `:front`, plus `release()`, `skipToFront()`, `paused` and coin effects. | `lib/stage/loops/queue.ts`, `lib/stage/spec/set.ts`, `lib/stage/spec/staging.ts` |
| Beats: `shot`, `move`, `face`, `line`, `narrate`, `wait`, `cue` (wait for a loop moment; skip jumps to it) and `loop` (release). Lines go through `Stage.say`. | `lib/stage/beats.ts` |
| Stage API: cast movement and facing, live-framed staging shots (group shots can turn with the subjects' facing), `setInsets`, events (`on("line" \| "cue")`), `cue` / `waitCue`, `skipLoops`, `projectPoint` | `lib/stage/stage.ts`, `lib/stage/spec/resolve.ts` |
| HUD in the prototype's language: brand, scene caption, location and party status, perspective bar, vignette, icon buttons; compact on short screens | `components/stage/hud.tsx` |
| GM card (hold, roll, thinking, done) with a warm d20; the journal; character cards | `components/stage/prompt-card.tsx`, `journal.tsx`, `character-card.tsx` |
| Parchment bubbles (crowd and named) and framed portrait plates, left for PCs and right for NPCs | `components/stage/stage-dialogue.tsx` |
| Landscape gate and the stage hook (unchanged) | `components/stage/rotate-gate.tsx`, `use-stage.ts` |
| Stage colour tokens (`stage-ink`, `stage-gold`, `stage-brass`, …) and the plate slide-in | `app/globals.css` |

## Validation (2026-09-29)

- TypeScript, lint (baseline) and `pnpm stage:check` pass. The checks cover 1,593 people and the queue loop.
- A CDP driver played the whole encounter at 1440×900, DPR 2, high tier:
  - the party went 3 → 2 → 1 → front on the loop;
  - held through four turns and a roll;
  - was released through the gate, after which the loop kept working the line.
- Phone landscape (852×393, DPR 3, touch): compact HUD; the caption hides under the GM card; Skip moves to the right edge.
- The rotate prompt and the paused stage on a phone in portrait were verified in revision 1 and are unchanged.

## Findings

- **The mobile tier looks soft on 3× phones.** It renders at DPR 1 and paint 480. It needs a real-phone measurement before raising the ratio.
- **Brazier flames are pale blobs without bloom**, inherited from the prototype.
- **Intro length.** The party-waiting intro takes about 35 s. Skip jumps the line straight to the party's call. A real game may want a shorter queue (the staging's `position`).
- **Hold framing.** On phones the hold framing is small because the GM card takes about half the height. Worth a phone-specific hold shot.

## Next

- Wire to real turns: parse a `Turn`'s narrative into the caption and journal, drive the GM card from the actors and roll requirements, use the real Generate and server actions, and put multiplayer waiting states on the card.
- Beats generation from each resolved turn, with an eval harness.
- Storyview TTS paragraphs drive `narrate`.
- Measure on a real phone.
- The fallback staging and generic sets (phase 5).

## Progress

- [x] Beats and Stage API
- [x] Revision 1: docked panel (replaced after owner review)
- [x] Revision 2: prototype HUD, perspective bar, warm styling, queue loop (the Director as a set loop)
- [x] Scripted gates encounter at `/dev/turn`; desktop and phone checks
- [x] Revision 3: BG3 turn order, movement, click-to-focus, display-serif headlines
- [x] Revision 4: narrative → movement via a model, with an eval
- [ ] Owner review of revision 4
