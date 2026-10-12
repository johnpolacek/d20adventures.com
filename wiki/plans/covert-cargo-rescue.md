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

## Revision, 2026-10-12: the arrow from the treeline

Owner request after a desktop play-through: Thalbern appeared inside the cabin and Silas and Reinhard vanished. He should be outside in the woods near Poppen. Poppen sees him loose one arrow, which hits and kills Reinhard or Silas with no roll. The other flees, and Thalbern tends the wounded. It should play out over a couple of rounds.

### Findings

- The rescue intro did everything in one block, and its staging dropped Reinhard and Silas from the cast.
- Stage positions reset on every encounter change, so The Ranger's staging decides where everyone stands.
- NPC standees never leave the stage. A dead or fled NPC keeps standing.
- NPCs do not walk on the stage. Only player replies are read for movement, and only entrances move an NPC.
- An NPC turn cannot kill another NPC or take itself out of the encounter. Only a roll outcome or the GM's advance patch sets a status.

### Decision

Two encounters pace it, each with an authored intro and staging.

| Encounter | What happens | Stage |
|---|---|---|
| The Ranger (rescue target) | A stranger rises from the ferns beside Poppen's bushes and looses one arrow through the lit window. Reinhard dies in the intro, authored, no roll. Silas flees on his turn. | Battle positions. Thalbern walks on beside Poppen. Reinhard falls when the narration says so. Silas runs for the bow. |
| The Ranger's Aid (new) | Thalbern crosses the gangway, tends the wounded, names himself, asks about the cargo. | Thalbern walks in through the saloon door. Reinhard lies where he fell. |

- The arrow always takes Reinhard, the one attacking. Silas is the one who runs, and he is the one who would come back with more men. Owner confirmed 2026-10-12, over shooting whichever of the two is still alive.
- The Ranger moves to The Ranger's Aid once Silas is gone, or after two rounds.
- The Ranger's Aid keeps the old exits: The Crate, Return to the City, The End.

### Engine work

- GM core: an NPC action type `flee`. The NPC takes the status "fled" and is out of the encounter.
- Stage: a standee can lie `down`. A staging cast member can start `down`. Staging `exits` time a fall or a run to the narration, the mirror of `entrances`.
- Desktop: a character who is dead lies down and one who has fled runs off, at the paragraph that came with the change. Both stay that way for the rest of the encounter.

### Known gaps

- If the players had already killed Reinhard before the rescue fired, the intro still names him.
- If Poppen had gone aboard, he is back at the treeline when the rescue starts, like every encounter change.
- A rescue out of The Disturbance, where elves were the threat, still shoots Reinhard. The GM notes cover the elves standing down.

### Results, 2026-10-12

- Content: The Ranger rewritten, The Ranger's Aid added, and Thalbern's sheet now says he shoots to kill a man who means murder.
- GM core: `flee` in `npc-turn-generation-service.ts` and `npc-turn-branch-service.ts`. The recorded turn fixture carries the new prompt and schema.
- Stage: `Standees.down`, `stage.setDown`, cast `down`, staging `exits`. Both stagings come from `scripts/stage-sets/covert-cargo.ts`.
- Desktop: `stage-play.tsx` plays exits and lays out or removes anyone the game has taken out of the encounter.
- Passed: `pnpm test:gm-core`, the Covert Cargo bridge and public flow checks, `pnpm stage:check`, 54 desktop tests against a rebuilt pack, stage, GM core and desktop typechecks, scoped Biome.
- Looked at in the stage preview at the high tier: the treeline two-shot, the saloon with Reinhard on the floor, and Thalbern in the doorway.
- Not done: a play-through with a live model. The fall, Silas's run and both entrances have not been watched in the app.

### Owner play-through, 2026-10-12

- "The scene is working pretty good." The fall did not show: Reinhard was gone from the view on his paragraph.
- Cause: he fell at once, and the shot on him looks at head height. He lay below the frame before the camera arrived.
- Fix: the fall waits 1.5 seconds, lands on the open boards before the crate, and is seen from a new shot above the helm. The body lies the same way in The Ranger's Aid.
- Looked at in the stage preview: the fall shot with Lyra and Reinhard, and the body before the crate.
- Not yet watched in the app.
