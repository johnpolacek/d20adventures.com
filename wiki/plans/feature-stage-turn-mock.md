# feature/stage-turn-mock

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md)

Status: Implemented and validated as a dev mock (2026-09-29); not merged · first slice of Stageview phase 4 (the stage-first turn page)

## Goal

Prove the stage-first turn page ([decision 5](stageview.md#stage-first-play-decided-2026-09-29)) before wiring it to Convex. The mock uses scripted turns, with no Convex and no model, and runs March of Davos encounter 1 ("The Gates of Kordavos") at `/dev/turn`, which is dev only.

## What the mock plays

Five scripted GM turns show every part of the loop:
1. **The Gates of Kordavos.** The intro, staged across three paragraphs: the gate, the queue, then "Next!". The party walks up to the checkpoint, and Garlan states the fee.
2. **Hold on Branka.** The hold frames her, and the panel shows the GM prompt and the reply composer. Her reply is quoted back as her spoken line.
3. **Cassia.** The same exchange, in a two-shot.
4. **Yeva.** She tries to slip the fee. The GM asks for **Sleight of Hand, DC 14, +5**, the d20 rolls, and the scene branches on success or failure.
5. **Milos.** Garlan calls "Let them through!" and the party walks through the arch. The encounter ends with a card for "Next: The Harvest Festival".

The panel has Suggest (a canned stand-in for Generate), Skip for the beats, Replay, tapping a party portrait to look at that character, and Story and Chat tabs.

## Built (kept for the real page)

| Piece | Path |
|---|---|
| Beat vocabulary and player: `shot`, `move`, `face`, `line`, `narrate`, `wait`; zod-validated, since beats will be model output; `skip()` lands the scene where the beats would end | `lib/stage/beats.ts` |
| Stage API: `moveCast` (walks, resolves on arrival), `faceCast`, `placeCast`, `point`, `shotSettled`, `finishShot` / `finishMoves`, inline shots, live-framed staging shots, `setInsets` (camera view offset, so shots compose in the uncovered area while the scene runs under the panel) | `lib/stage/stage.ts`, `lib/stage/spec/resolve.ts` |
| Layout shell: full-bleed stage; panel docked right in landscape, bottom sheet on portrait tablets; collapse toggle | `components/stage/stage-turn-layout.tsx` |
| Turn panel: party strip, narrative with the staged paragraph lit, GM prompt and composer, roll card (reuses `DiceRoll` / `DiceRollResult`), Story and Chat tabs, compact mode for short screens | `components/stage/turn-panel.tsx` |
| Dialogue: head-anchored bubble plus a portrait plate | `components/stage/stage-dialogue.tsx` |
| Landscape gate: a rotate prompt for phones in portrait (≤ 600 px, coarse pointer); stage paused behind it; best-effort fullscreen and orientation lock on the first tap | `components/stage/rotate-gate.tsx` |
| Stage hook | `components/stage/use-stage.ts` |

## Validation (2026-09-29)

- TypeScript, lint (baseline), `pnpm stage:check` and `pnpm build` pass.
- A CDP driver played all five turns end to end at 1440×900 DPR 2 on the high tier: beats, bubbles, plates, holds, the roll and the end card all appeared.
- Phone landscape (852×393, DPR 3, touch; auto tier `mobile`): the compact panel fits, with the prompt and composer visible without scrolling the header.
- Phone portrait: the rotate prompt shows and the stage stops rendering (0 frames in 0.8 s).
- Tablet portrait (820×1180): bottom sheet; the hold shot frames Cassia in the uncovered top area.

## Findings

- **The mobile tier looks soft on 3× phones.** It renders at DPR 1 and paint 480, so an 852-wide frame is upscaled 3×, and stair-steps show in emulation. It needs a real-phone measurement before raising the tier's ratio (probably 1.5).
- **Brazier flames read as pale blobs without bloom** (high tier). This is inherited from the prototype.
- Earlier-turn narrative stays readable in the Story tab. Replies show as the actor's quoted line on stage and as an italic block in the panel.

## Next

- Wire to real turns: map a `Turn`'s narrative (parsed with `parseNarrative`) and its actors onto the panel. Swap Suggest for the real Generate, and replace the canned GM turns with the existing server actions.
- Beats generation: a flash model maps each resolved turn onto the set's vocabulary (marks, cast, named shots). It needs an eval harness like Mapview's.
- Storyview sync: TTS paragraphs drive `narrate`.
- Measure the mobile tier on a real phone.
- The fallback staging and generic sets (phase 5).

## Progress

- [x] Beats and Stage API
- [x] Stage-first layout, panel, dialogue, landscape gate
- [x] Scripted gates encounter at `/dev/turn`
- [x] Desktop, phone landscape and portrait, and tablet portrait checks
- [ ] Owner review
