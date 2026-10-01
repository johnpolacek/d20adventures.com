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

## Revision 7 (2026-09-29): text stays; slower, with back, forward and replay

The owner decided the narration stays as text (no audio-only mode). Changes:

- **Slower.** Paragraphs now read at about 170 wpm (`readingSeconds`), down from about 200. A pace setting (slow ×1.35, normal, fast ×0.75) in Scene settings scales paragraphs and spoken lines alike, through the new `lineSeconds` hook.
- **Stepping.** The narration panel has ↻ (replay the turn), ‹ and › (previous or next paragraph; › on the last paragraph goes to the question) and Skip. ← and → do the same.
- **How `BeatPlayer` does it:**
  - It records a mark at the start of each paragraph: the shot, plus the positions and facings of the cast members the beats move or turn. `back()` and `replay()` restore a mark and play on from there. `next()` fast-forwards to the next paragraph.
  - A loop's crowd carries on and isn't rewound. Cues it has already given resolve at once, and `release()` is idempotent.
- **Replay from the question.** A "Replay turn" button next to the GM card plays the turn again and returns to the question. The reply being written is held by the page, so it survives the replay.
- **Checked in the browser** (turn 1):
  - Next and back each land in about 0.8–1 s, with the camera returning to the paragraph's shot (the gate, then the line).
  - › on the last paragraph goes straight to the question.
  - Replay from the question restarts at paragraph 1 and keeps the draft.
  - No console errors.

## Revision 8 (2026-09-30): staged intro, a full first turn, and a contest

Owner feedback: the opening dialogue in the line was great, but the camera was too far back to see it. The owner wants:
- camera moves in stages, each with its own dialogue and nicely framed;
- the intro to be part of the adventure plan;
- then a fully mocked turn: dialogue first, then a thief tries to pick a pocket, with a dice roll.

Answers to my questions:
- Scripted, with both outcomes.
- A contest: the thief's roll is shown, then the player's.
- The target is a merchant in line.
- For real adventures, intros are drafted by AI and edited by the author (decision 10 in [stageview](stageview.md)).

### Intro (three stages)

1. The gate, wide.
2. The line, framed from the east where it turns toward the counter, so faces show: a neighbour ahead, Oskar behind the party, and someone further back each speak.
3. Garlan at the counter in a close two-shot: one "Next!" and one exchange, then the line stalls.

### Turn 1: "A Purse in the Crowd" (Yeva)

- Yeva's turn comes in the stalled line, with Oskar Venn, a spice-trader, looming behind her in the hold two-shot.
- Her reply plays as a shot-reverse-shot with Oskar.
- A cutpurse slips in at Oskar's shoulder.
- **The contest card:** the GM's die rolls itself (Sleight of Hand 11 + 5 = 16), then Yeva rolls Perception (+3) to meet or beat it.
- **Success:** Yeva grabs the cutpurse's wrist, he flees, and Oskar promises her a Harvest supper.
- **Failure:** the purse is gone, and Oskar accuses the halfling.
- Either way the line resumes, the party is called to the front, and the existing Garlan turns follow (Branka first).

### Engine

- **Queue loop:**
  - `stalled` finishes the exchange at the counter, then waits.
  - The staging can place other named characters in the line (`loops.<id>.cast`). They pass into the city rather than being recycled.
  - Named characters standing still are left to the beats, and walk back to their place when the line moves.
  - `speaker({ group | fromParty })` lets a beat give a line to someone in the queue.
- **Beats:**
  - `line` with `group` or `fromParty` speaks from the queue.
  - `move` with `stop` halts short of a target.
  - `loop` with `stall` or `resume` controls the line; loop controls run once per sequence, so stepping back doesn't move the line again.
  - `play(beats, { append: true })` continues after a mid-turn roll, keeping the earlier paragraphs to step back to.
- **Roll card:** a contest shows both sides and how it came out. `?roll=N` fixes the player's natural roll.

### Art

Oskar and the cutpurse were generated with the prototype's standee prompts and keying:
- `gemini-3.1-flash-image` at 2K, 9:16, on a green screen;
- conditioned on the world style reference plus a finished hero standee, for finish only;
- backs generated from each front;
- portraits cropped from the fronts.

### Checked in the browser (1440×900 at DPR 2)

- Both outcomes play end to end (forced rolls 20 and 1), with no console errors.
- The intro takes about 65 s and the first turn about 100 s at normal pace.

### Known gaps

- Oskar's standee still shows his purse after it is stolen.
- The cutpurse's spot and the east-side shots are fixed points tuned to this line's layout. Generated intros will need framing that solves for faces and occluders.

## Revision 9 (2026-09-30): no tiny bubbles; hold wide, then move in

Owner feedback: the bubbles were tiny in the wide opening. Pause, then zoom in to see the line and the bubbles.

- **Bubbles show only when the speaker reads as a person on screen.**
  - The stage now reports how many pixels a metre spans at a point (`ppm`).
  - A bubble appears only when its speaker is at least about 70 px tall, and scales between 0.85 and 1.
  - The old rule shrank bubbles with distance down to 60% (about 8 px text) and showed them out to 120 m.
  - Wide shots stay quiet rather than showing unreadable text.
- **The intro holds, then moves in.**
  - The gate is held wide and silent for about 9 s, then the camera eases in to the line over 7 s and on to the party over 4.5 s.
  - Shot beats take a `duration` for these slower moves.
- **A stalled line is quiet.** A stalled loop now also holds an exchange that hasn't begun yet, restarting its timer when resumed. The first exchange had been starting under the title screen and playing over the wide gate shot.
  - The counter stage waits for the camera to land, then resumes for one full exchange (question, answer, fee, coin) and one "Next!", using the `gate-line:next` cue, then stalls.
  - After the pickpocket, the same thing happens at the counter before the party is called.
- **Skipping respects the moment the beats wait for.** `skipLoops(cue)` calls the next group for `<id>:next` and only jumps to the party's turn for `called`/`front`. A skipped intro still leaves the party second in line.
- **Checked:**
  - Real time: no lines during the gate shot; chatter in the line at 13–14 px with speakers 230–530 px tall; the counter exchange spaced 53–62 s with Garlan about 650 px tall.
  - The skip run and a full encounter run had no errors.

## Revision 10 (2026-09-30): the scene as written, in two rounds, stepped through

The owner restated the scene's purpose. The characters meet for the first time while they wait in line:
- Round 1: each of them can introduce themselves, or do anything else.
- Round 2: whoever is first talks to the sergeant.
- The rogue can pick a merchant's pocket during round 1.
- It should be a step-through with obvious navigation, not autoplay.

### Structure

**Intro (3 stages):** the gate, the line, and the counter, as in revisions 8 and 9. It ends with the line stalled and the four turning to one another. The facings wait for the new `gate-line:settled` cue, because the line's last shuffle would otherwise turn them back.

**Round 1, in line.** Every hold is marked `stay`, so the reply isn't turned into movement: the scene owns their places in line.
1. Branka ("Strangers in Line"). Oskar remarks on pockets.
2. Cassia ("Maps and Sigils"). Oskar introduces himself and waves his purse about.
3. Yeva: the pickpocket. A contest with Oskar's Perception (12 + 1) shown first, against her Sleight of Hand (+5) ("Light Fingers").
   - **Success:** she lifts the purse and finds a note sealed with green wax.
   - **Failure:** Oskar grabs her wrist and shouts "Thief!", and Garlan looks up.
4. Milos ("The Line Moves"). His reply depends on the outcome. The line then resumes and the party reaches the counter.

**Round 2, at the counter.** The Garlan turns as before, except Yeva's, which branches on the purse:
- **Purse taken:** she pays the party's twelve marks out of Oskar's purse. Garlan eyes the saffron embroidery, and Oskar pats his belt.
- **Caught:** Garlan questions her, in a Deception contest against his Insight (11 + 3).

**Script mechanics:**
- Holds can depend on a `Story` that rolls write to through `roll.key`.
- The NPC cutpurse and his art are gone.

### Step-through

`BeatPlayer.mode = "step"` (the default) makes every paragraph and every spoken line wait for `continue()`. Camera moves, walks and waits still play between them.
- Pressing Continue before a wait is reached hurries there and lets that one pass, so it always means "on to the next thing".
- Lines stay up until Continue.
- The panel shows a brass **Continue ▸** that glows while the story waits. Space, Enter, → or a click on the scene also continue.
- ← and ↻ (replay) work as before.
- **Auto** in Scene settings keeps the timed playback and its pace setting.

### Framing

The round-1 speakers are framed from fixed points read off the verified subject shots, at the stalled line's fixed places, so a turned head can't move the camera behind someone. Oskar is framed right of centre to stay clear of the narration column. Named characters in the queue no longer get the crowd's stock replies.

### Checked in the browser (1440×900, DPR 2)

- Success (`?roll=20`): 49 Continues, about 2 minutes.
- Failure (`?roll=1`): 51 Continues, including the Deception branch.
- Every turn in order, all nine journal entries, no console errors.

## Revision 11 (2026-10-01): polish, and a d20 lab

- The reply button says **Send**.
- The rule over the perspective bar runs edge to edge.
- The whose-turn label under the initiative bar is larger (19 px, and 13 px on phones, where it now shows too).
- **The d20** on the roll card is a hexagon outline: the die's face-on silhouette, with a textured fill and no facet lines, so the number reads. It tumbles in place while the number stays upright, flips through faces at a slowing pace, and lands with a pop.
- **Stylesheet gotcha:** plain rules placed after `.fade-in` (which nests `@starting-style`) in `app/globals.css` were silently dropped from the build. That also explains an earlier lost `@layer components` block. `.fade-in` now sits last, with a note.
- **`/dev/dice`** (dev only): five takes on the die and its roll, side by side, to pick one for the card.
  1. Hexagon
  2. Triangle face, the classic d20 icon
  3. A 3D icosahedron in three.js that tumbles and settles with a face toward you
  4. Slot reel
  5. Coin flip
- The owner asked to keep the turn page a scripted demo.
- **Follow-up, the same day.** The d20's outline is now a real one, `components/stage/d20.tsx`, shared by the roll card and the lab.
  - Face-on, a true icosahedron's silhouette is a plain regular hexagon, which reads as any die. Photos of real d20s show them slightly from above and to one side (reference: the Wikimedia Commons photo "Würfel, Ikosaeder (W20) -- 2021 -- 5635.jpg").
  - So the outline is the computed convex hull of a true icosahedron, tilted 20°, turned 22° and rolled 8°, seen through a 30° lens, with rounded corners like tumbled dice.
  - The lab keeps two takes: the outline and the 3D d20, now shaded with no edge lines and a soft fill light.
- **Demo reply box.** `PromptCard demo`: the reply box stays disabled under its placeholder, with "Demo only · Click Suggest for a reply" centred over it. Suggest fills it in and the note goes, but the text stays read-only, so what's sent always matches the script.
  - **The owner picked the 3D d20 for the roll card.**
    - `D20Solid` in `components/stage/d20.tsx` is a three.js icosahedron, shaded with a soft fill light and no edge lines. It rests face-on with a corner up and tumbles about a random axis, slowing, for each roll.
    - The number sits over its front face, stays upright and flips in place.
    - The contest card's two dice each get their own small WebGL canvas, alongside the stage's.

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
- [x] Revision 8: staged intro, first turn with a contest
- [ ] Owner review of revision 8
