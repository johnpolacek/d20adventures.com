# Adventure premise: who knows whom

[Wiki Home](../index.md) · [Plans](index.md) · [Wiki adventures](../wiki-adventures.md) · [Gameplay flows](../gameplay-flows.md)

Owner, 2026-10-11, playing Covert Cargo: "Lyra and the NPCs seem to have knowledge of Poppen but they should not. Lyra has never met him. No one knows he is there, it is just happenstance. Similarly he has no idea what is going on, he just is spying."

## What went wrong

The narrator names every hero, and each prompt lists the cast by name. Nothing said who knows whom, so the GM treated the cast list as common knowledge. In the owner's save a reply offered for Lyra had her shout "Poppen, now!" at a halfling she had never seen.

## What changed

Two things, both in every prompt that writes for a character.

| Piece | Where | Notes |
|---|---|---|
| The rule | `KNOWLEDGE_RULE`, `PLAYER_KNOWLEDGE_RULE` in `packages/gm-core/src/utils/narrative-utils.ts` | Every adventure. A character knows only what the story shows them seeing, hearing or being told. A stranger has no name until it is spoken to them. |
| The premise | `## Premise` on the adventure page, `manifest.premise` | Per adventure, authored. Who knows whom and what at the start. |
| GM side | `gmNotesWithRules` in `wiki-adventures/player-safety.ts` | Adds the premise to each encounter's GM notes: NPC turns, roll outcomes, the end of a round. |
| Hero side | `ai-pc-turn-service.ts` | The AI hero's reply and the replies offered to a player carry the premise too. |
| Local and hosted | `apps/desktop/runtime/game.ts`, `host.ts` | `suggest` now takes the packs to read the premise. |

## Decisions

- **The premise is authored, not inferred.** Mine. The rule alone failed: with only the rule, 2 of 2 offered replies still named Poppen. The round's text shows him shooting at Lyra's attackers, which reads as an ally.
- **The premise holds no secrets.** Mine. It goes into the players' side prompts, so it says only what every player knows at the start. Secrets stay in an encounter's GM Notes.
- **It is a starting fact.** The prompt says it holds until the story shows it change. Nothing tracks who has since met whom.
- **Covert Cargo's premise is the owner's statement** above, written out for Lyra, Poppen and the NPCs.

## Not covered

- Tracking introductions. After two strangers trade names, a hero side prompt sees only the current round, so it may keep them nameless for a while.
- The reply a player types. Its rewrite into prose carries neither the rule nor the premise.
- Legacy plans have no premise.
- The website's S3 copy of Covert Cargo.

## Validation

2026-10-11, local.

- Real GM through the Claude CLI on a snapshot of the owner's save, old prompts against new, 3 runs each.
  - Replies offered for Lyra: 3 of 3 named Poppen before, 0 of 3 after. She now calls to "whoever you are".
  - Poppen's own reply, 6 runs each: he said "Lyra, duck!" once before, and no name after.
  - Silas's turn: he named Poppen in neither, so the NPC side shows no measured change.
- A party that travels together, March of Davos, 3 runs: the hero still treats the others as her companions.
- Runtime tests: Covert Cargo's premise reaches the GM's prompt and the offered replies, and an adventure without one carries none. 54 pass.
- `pnpm test:gm-core`, the Covert Cargo bridge check, and type checks pass.
- Not checked in the running app.

2026-10-11, March of Davos, which has no premise.

- Real GM on throwaway saves at the gate, The Lady and the Bishop, and Face to Face with Silverhand.
  - 12 runs of the NPCs' turns and the round's end, half with a hero asking outright about the Covenant.
  - 6 runs of replies offered to a hero.
  - No secret came out in any. The heroes acted as companions.
- The old prompts were not run there, so this does not show the rule is the reason.
- An NPC's sheet name goes into every prompt. Silverhand's held his secret name, and is now "Silverhand".
