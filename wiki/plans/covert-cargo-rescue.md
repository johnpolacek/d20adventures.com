# Covert Cargo: Thalbern's rescue and no player deaths

[Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [GM core](../gm-core.md) · [Gameplay](../gameplay-flows.md)

Started 2026-10-10 at owner request on `feature/covert-cargo-rescue`: "add Thalbern in as a NPC character that comes in and saves the day if anyone is down to half their health or less (don't allow player deaths since this is an intro adventure and we are setting them up for the main adventure)".

## Source review

- Every fight funnels into Battle on the Boat: an arcanist and a halfling rogue against Reinhard and Silas, who mean to kill.
- The GM never sees health numbers when it chooses the next encounter. A transition worded "at half health" would be a guess.
- A player character dies at 0% health or the status "dead". Nothing stops either today.
- The Midnight Summons already sends Thalbern after "a river boat, Valkaran-made, heading downstream to Kordavos". He can reach this pier without new lore.

## Decision

Two authored adventure rules, enforced by the GM core rather than judged by the model.

| Manifest field | Rule |
|---|---|
| `playerDeath: false` | Player characters never drop below 1% health and never take the status "dead". The GM is told so in its notes. |
| `rescue.encounter`, `rescue.atHealthPercent` | At the end of a round, if the encounter would otherwise continue and a player character is at or below the threshold, play moves to the rescue encounter. Once per playthrough. |

- The rescue is legal only from encounters that author a transition to it. The graph stays explicit.
- The model never sees the rescue transition as an option. It cannot fire early.
- A fight the party has already won or fled follows its own transition. Thalbern does not arrive after the fact.

## Work

- Compiler and manifest: both fields, with the rescue target validated.
- GM core: the death floor on NPC effects, roll outcomes and advance patches. The rescue check on turn advance. Rescue transitions hidden from the model.
- Content: Thalbern as an NPC (`thalbern-npc`, since `thalbern` is the Midnight Summons premade), a new encounter The Ranger, and rescue transitions from the five encounters where blades can come out.
- Desktop: a saloon staging for The Ranger with Thalbern's existing standee.
- Wiki: the new contract in [Wiki adventures](../wiki-adventures.md).

## Validation

- `pnpm test:gm-core`, the Covert Cargo bridge check, the wiki adventure batches.
- `pnpm stage:check`, desktop tests against a rebuilt pack, stage and desktop typechecks, scoped Biome.

## Results

- Rules live in `packages/gm-core/src/wiki-adventures/player-safety.ts`. The contract is in [Wiki adventures](../wiki-adventures.md#safety-rules).
- Rescue transitions: The Shipment, The Transaction, The Fake, The Disturbance, Battle on the Boat.
- The Ranger leads to The Crate, Return to the City, or The End. Thalbern tends wounds, asks what the boat carried, and does not join the party.
- Desktop tests drive the real core: a lethal NPC blow leaves Lyra at 1%, the round ends in The Ranger, the rescue plays once, and a won fight goes to The Crate.
- Passed: `pnpm test:gm-core`, all wiki adventure checks, `pnpm stage:check`, 42 desktop tests, GM core, stage and desktop typechecks, scoped Biome.
- The web app typecheck reports only stale generated files under `.next/dev/types`.
- Not done: a play-through with a live model, on web or desktop.

## Open

- The Ranger needs no 2D map. Per-encounter maps gave way to 3D staging (owner, 2026-09-29, restated 2026-10-10).
- The Ranger has no encounter painting. Only the web turn page shows one, and it falls back to the adventure cover. Thalbern's own standee and portrait are in use.
- The new staging is placed from existing saloon marks. It still needs a look in the preview page and the app.
- On the web, premade heroes return to full health on every encounter change. On desktop they keep their wounds, and Thalbern's healing depends on the GM's patch.
- The Midnight Summons still leaves its own rescue to the GM's judgment. It could adopt the same rule.
