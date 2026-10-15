# One roll card

[Wiki Home](../index.md) · [Plans](index.md) · [Structured narrative](structured-narrative.md) · [Skip a hero's turn](skip-turn.md)

Owner, 2026-10-14, after a Stealth roll in Owlbear Confrontation: a roll card, then a "GM is writing" card that cut the die off, then the roll again in the reader. "I think it should be all one UI. Roll, then show the result, then it can say in the same UI that the GM is resolving and when done let them continue."

## What the player sees

One card from the ask to the answer.

1. Dice roll needed: the hero's portrait, the check, the modifier and the DC, and the die as the button.
2. The die tumbles and lands. The total and the verdict stamp in, as the reader shows a roll.
3. Under the verdict: "The GM is resolving the roll…" while the GM writes.
4. Continue, once the GM is done. The reader then starts at the paragraph after the roll, so the roll is not shown twice. Read turn still shows it.

In Auto, the card moves on by itself once the verdict has had a moment and the GM is done. A roll the game did not take, such as a failed GM call, brings back a fresh die with the error. A walk no longer shows the "GM is writing" card.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Roll display | `components/stage/roll-result.tsx` | Takes a roll still to make, with `onRoll`, and reports `onVerdict`. The reader's rolls are unchanged. |
| Card | `components/stage/prompt-card.tsx` | A roll mode's `made` and `resolving`, and `onContinue`. A contest keeps its two dice. |
| Play view | `apps/desktop/src/stage-play.tsx` | Holds the roll from the throw until Continue. The story that arrives meanwhile waits, and the camera stays on the hero. |
| Clients | `apps/desktop/src/play.tsx`, `components/hosted/hosted-play.tsx` | `onRoll` resolves to whether the roll was taken. Saving positions after a walk no longer marks the GM busy. |

The roll goes to the GM on the click, not when the die lands, so the GM starts about a second sooner.

## Not covered

- The website's text turn page, which has its own dice.
- A contest roll, which only the `/dev/turn` demo uses.
- The small-window layout, not checked.

## Validation

2026-10-14, in the desktop preview, on a copy of the owner's save rewound to before the Stealth roll, with the GM's answer faked in the page. Card sequence: ask, rolled, resolving at 2.1s, Continue when the answer came, then the reader at "The Owlbear swings…". A faked failure brought back a fresh die and the error. No GM was called. Typechecks and desktop tests pass.

2026-10-15, the owner played The Midnight Summons with the live GM: "roll card looks good. live replay is working." The card's Continue is now the epic button with a chevron. Not checked in a hosted game or the small-window layout.
