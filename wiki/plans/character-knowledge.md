# What each character knows

[Wiki Home](../index.md) · [Plans](index.md) · [What a hero knows](hero-knowledge.md) · [Adventure premise](adventure-premise.md)

Status: implemented on main 2026-10-21. Not yet played in the app. Convex deployed to production 2026-10-21.

## Owner request, 2026-10-21

"Can we have a more explicit and comprehensive way of maintaining AI PC and NPC knowledge. think through this thoroughly and solve completely"

This follows [what a hero knows](hero-knowledge.md), which made a whisper private for the round it is in.

## Before

Every prompt that plays one character, and what reached it:

- A private beat was known to those in it for its round only. No later prompt read it again.
  - An AI Thalbern forgot Garlan's whisper the next round.
- An AI hero read only the current round. Nothing it learned earlier reached it.
- An NPC read the whole round, other heroes' whispers and the players' own words included.
- An NPC read the encounter intro with its private paragraphs unmarked.
  - In Covert Cargo, Silas read where Poppen and Thalbern hide.
- On the desktop, every prompt carried every character's saved gear, effects and spells.
  - Poppen's prompt named Thalbern, whom he has never seen.
- The GM's discoveries were stored and never read back. The website's model was never told their shape.

## The ledger

An adventure keeps a list of facts. Each fact names, by character id, everyone who knows it.

- Two sources, both at the end of a round:
  - Each set of characters who shared private beats gets one fact. No model decides this.
  - The round's GM records what characters learned: a secret, a plan, a name, a place, a deadline. It returns them in a required `knowledge` field beside the beats, in the call it already makes.
- Facts merge by id. Knowers only grow. When a character tells a fact to others, the GM repeats its id with them.
- The desktop save and the Convex adventure keep it. It reaches the stores as `knowledge` on the round's commit.
- A finished adventure's chapter keeps its heroes' facts. A hero's own chapter shows only theirs.

## Who reads what

| Prompt | The round | Facts | Saved state, desktop |
|---|---|---|---|
| AI hero's move | their view | theirs | own, others' health |
| Replies offered to a player | their view | theirs | own |
| NPC's turn and its outcome | their view, and the intro without others' private paragraphs | theirs | own, others' health |
| Writing a player's reply into beats | the hero's view | none | own |
| Roll outcome, GM | all, private beats marked | all, with who knows each | all |
| Round end, GM | all, private beats marked | all, with ids and who knows each | all |

A character's view of a round keeps public beats and the private beats they are in. It drops other players' own words.

## Decisions made without the owner

- **The GM records facts in the round's existing call.** A call per character a round costs too much.
- **Private beats become facts by rule.** A whisper is remembered even when the GM records nothing.
- **A top-level field, not the adventure patch.** The website's model never sees the patch's shape, so most of its discoveries are dropped today.
- **No forgetting.** A fact once known stays known.
- **Prompts show the newest facts.** 12 for one character, 20 for the GM.
- **Prompts name the character they play.** A host uses it to add only that character's saved state.

## Not covered

- Who has seen whom. Who has heard a hero's name is kept since 2026-10-21, in adventures whose heroes start as strangers. See [meeting at the gate](meeting-at-the-gate.md). A hidden hero still relies on the premise, the GM notes and the knowledge rule. A private beat is not the same as hiding: Lyra's private thoughts do not hide her.
- An NPC's turn still reads the encounter's GM notes and the adventure summary. They direct the GM, and the rule limits what the NPC acts on.
- A fact is only as good as the GM's record. Each character's view of the current round is exact.

## Code

| Piece | Where |
|---|---|
| Ledger, merge, private facts, prompt notes | `packages/gm-core/src/story/knowledge.ts` |
| A character's view of a round | `characterStory`, `characterScript` in `story/render.ts`, `story/turn.ts` |
| An intro as one character knows it | `authoredText(text, names, viewer)` in `story/authored.ts` |
| Round end records facts | `orchestration/advance-turn.ts`, prompt item 8 in `wiki-adventures/runtime-context.ts` |
| Ports | `AdventureRecord.knowledge`, `WikiTurnCommit.knowledge`, `Prompt.viewer` in `ports.ts` |
| Stores | `LocalStore.commitWikiTurnAdvance`, Convex `commitWikiTurnAdvance` and the adventures table |
| Desktop saved state per viewer | `characterContext` in `apps/desktop/runtime/characters.ts` |
| Chapters | `chapterOf`, `storyNote` in `apps/desktop/runtime/story.ts` |

## Validation

2026-10-21, local.

- Desktop tests, 73 pass. New in `character-knowledge.test.ts`:
  - A whisper and its answer become one fact for the two in it. Facts merge by id.
  - At the gate, next round: AI Thalbern and Garlan know the whisper. AI Milos knows only the GM's public fact, and holds no one else's gear.
  - The GM reads each fact with its id and knowers. Spreading one gives Milos the whisper.
  - Garlan's turn reads no whisper between two heroes, and no player's own words.
  - In Covert Cargo, Silas reads the intro without the hidden heroes' paragraphs. Each hero's opening becomes their own fact.
  - A chapter keeps its heroes' facts, and Lyra's shows only hers.
- The NPC tests fail with the old NPC prompt.
- `pnpm test:gm-core`, fixture re-recorded. Garlan's recorded NPC prompt no longer holds the player's "I try to deceive Garlan". The Convex commit merges a fact told again.
- Batches e and f, the four bridge checks and public-flow pass. Type checks and biome pass.
- Real GM through the Claude CLI at the March of Davos gate.
  - One run over two rounds. The whisper became a fact for Thalbern and Garlan. AI Thalbern went to watch the street the crate took. AI Milos had no facts and stayed off the shipment.
  - That run's GM recorded no facts of its own in either round, with the field optional.
  - With the field required and deadlines named, 2 of 2 round ends recorded the dusk closing for all four present. One also recorded Milos's stated business.
  - No round's narration repeated the whisper.
- Not checked: the running app, other GMs, hosted games.
