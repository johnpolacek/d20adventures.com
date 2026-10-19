# NPC turn card

[Wiki Home](../index.md) · [Plans](index.md) · [One roll card](one-roll-card.md)

Owner, 2026-10-19: while the GM plays an NPC's turn, the card said "The GM is resolving the action…". Make it more tailored to the NPC. Owner picked three options: an authored line per NPC, a rotating fallback line, and the NPC's portrait on the card.

## What the player sees

While the GM plays an NPC's or AI hero's turn, the card shows that character's portrait, "Garlan's turn" as the eyebrow, and a line under it.

- An NPC sheet may set `thinking`, such as "Garlan strokes his beard, weighing his duty…". The card shows it as written.
- The sheet goes with the NPC into every encounter, so the line describes the character, never a place or a scene.
- Without one, the card picks a line by the turn, such as "Garlan weighs the moment…". The same turn always shows the same line.
- A player's own action keeps "The GM is writing…" and "The GM is resolving the action…".

## How it works

| Piece | Where | Notes |
|---|---|---|
| Sheet field | `packages/gm-core/src/types/character.ts`, `convex/schema.ts` | Optional `thinking` on every character. |
| Line | `apps/desktop/src/stage-play.tsx` | The NPC's `thinking`, or a line from a short pool picked by turn and character. |
| Card | `components/stage/prompt-card.tsx` | A thinking mode's `who` shows the portrait and "Name's turn". |

Garlan Ironfist gets the first authored line.
