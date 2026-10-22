# Round budget

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [March of Davos playtest](march-of-davos-playtest.md)

Status: implemented on main 2026-10-22. Not deployed.

## Owner request, 2026-10-22

"Cap stalled encounters", then: "Add a round budget per encounter that nudges the GM toward its transition."

## Why

The second March of Davos run spent eight rounds in The Wine Cellar and five in the library while the AI heroes circled a locked cabinet. The round-end GM saw no count of how long a scene had run. Its only pacing rule was to transition once a listed condition is met.

## Design

- An encounter's frontmatter may set `roundBudget`, a whole number of rounds. Without one the budget is 4.
- The count is rounds played in a row in the encounter, the current one included. A return visit counts from 1.
- The round-end prompt gets a Scene Pace line before its task, only when the encounter has a listed transition.
  - Under budget: "round 2 of 4 budgeted for this scene".
  - From the budget's last round: if a condition is met or nearly met, transition now. If not, move the scene toward the nearest listed way out this round, by an NPC acting, a deadline or interruption, or an obstacle giving way.
  - Two rounds past the budget: take the listed transition that best fits what has happened.
  - Both say a way out that waits on the players' own choice stays theirs, and the scene presses them to make it.
- It is a nudge. The core never forces a transition, so a fight or a choice still ends in play.
- Desktop and hosted games, through the shared GM core. Legacy JSON plans keep their own turn count.

## Not done

- NPC turns and AI heroes do not see the budget. The round's end is where the scene moves on.
- No March of Davos encounter sets its own budget yet. Tune from play.

## Validation

- `pnpm test:gm-core`: the count, the three pace lines, the frontmatter field, and the replayed round's prompt.
- Desktop runtime tests.
