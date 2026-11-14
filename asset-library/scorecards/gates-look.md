# The Gates, isometric look: scorecard

Date: 2026-11-14 · Benchmark: a shipping isometric fantasy CRPG, as Baldur's Gate 3 or Pillars of Eternity look from above · Judged by: one blind judge a round, a fresh agent shown two unnamed sets and not told which is newer
Evidence: `~/Desktop/d20-iso-spike/gates-look/`, one frame a round. The owner named no target. The aim was to raise it and say where it stops.

## Rubric (0 to 2 points each, total out of 10)

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Readability | cast lost | found with effort | read at a glance |
| Lighting | murk or blowout | lit, but flat | a clear key, pools, grounded shadows |
| Materials and detail | wrong at this distance | right, with flaws | read as stone, wood and cloth |
| Composition and framing | broken crop | works, with awkward cuts | deliberate: board, surround, edges |
| Cohesion | out of period | one world, with strays | one fantasy world |

## Scores

| Frame | Before | Round 4 | Round 5 | Main fault fixed | Still short |
|---|---:|---:|---:|---|---|
| Wide | 3 | 5 | **5** | A void behind the gate and a broken crop: now a whole model on a board against a surround. | Towers cut by the top edge. The plaza is a strip of specks. |
| Close | 5 | 6, then 5 | **6** | Cobbles a pace across, and a checkpoint with no light of its own: now setts, a fire pool and rings under the cast. | The crowd is a few flat cutouts repeated, with faint shadows at their feet. |

- Round 4's close frame got 6 from the first judge and 5 from the second. Judges differ by a point. Read every number here as give or take one.
- The "before" wide frame predates the rope change. The "before" close frame does not.
- Round 6 took the pale tracks off the cobbles, which the second judge read as painted lines. It has not been judged.

## Rounds

| Round | Changed | Frames |
|---|---|---|
| 0 | As first shown: open ground kept, crowd thinned to it, the awning left out. | `round0-wide.jpg`, `round0-play.jpg` |
| 1 to 2 | The whole gatehouse kept, a board under it, a surround lighter at its middle, less fill. | `r2-wide.jpg`, `r2-play.jpg` |
| 3 | The engine's brush over it, and bloom. The brush changed little and was left off. | `r3-play-paint.jpg` |
| 4 | Setts a hand across, dirtier. Views by name: `look=wide`, `look=play`. | `r4-wide.jpg`, `r4-play.jpg` |
| 5 | A cool fill, lamps at the brazier and the post lantern, rings under the cast, the wide shot pulled back. | `r5-wide.jpg`, `r5-play.jpg` |
| 6 | The worn tracks across the cobbles left off. | `r6-play.jpg` |

## Where it stops, and why

Both frames sit at 5 to 6. What holds them there is outside lighting and framing:

- The crowd is cards: a small set of flat pictures, repeated, each throwing a sliver of shadow. The judge named this as the close frame's biggest fault. Fixing it means more crowd pictures, a shade under each card, or 3D figures for the people nearest the play.
- Four of the six cast are still cards. They face the camera whichever way they are turned.
- The gatehouse is 44 m tall and the people 1.7 m. One frame cannot show both well. The wide shot is an establishing shot, not a play view.

## How to see it

```
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&look=play&panel=0
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&look=wide&panel=0
```

The look is `lab/stage-art/looks.ts`. It changes nothing in the game's own set.
