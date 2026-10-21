# Wiki adventures

[Home](index.md) · [Architecture](Architecture.md) · [Gameplay](gameplay-flows.md) · [Testing](plans/testing-runbook.md)

Status: Implemented reference. Reviewed against local main on 2026-10-01.

The four registered Realm of Myr adventures use authored markdown and JSON compiled into runtime artifacts. The public discovery and gameplay cutover completed in June 2026. There is no remaining migration project for those four adventures.

## Source and compiler

| Concern | Current contract |
|---|---|
| Registry | `LOCAL_WIKI_ADVENTURES` in `lib/wiki-adventures/local-runtime.ts` registers The Midnight Summons, Covert Cargo, The Road to Kordavos, and March of Davos. |
| Manifest | Adventure `adventure.md` frontmatter supplies identity, start encounter, party limits, premades, character options, asset metadata, and the optional [safety rules](#safety-rules). |
| Encounters | Markdown files carry stable IDs, NPC/location refs, transitions, intro, and GM notes. NPC refs can include `startNear`. |
| Characters | JSON sheets hold mechanical data. Paired markdown profiles hold authored narrative context. |
| Entities | NPCs, locations, factions, and items support context retrieval. Encounter location refs also supply map titles. |
| Compiler | `compiler.ts` produces manifest, encounters, entities, character sheets, graph, retrieval index, and validation report. Registered runtime loads compile in publish mode and reject blocked content. |
| Source selection | Prefer S3 source only when it covers every expected repo-local path. Empty, partial, or failed remote reads fall back to the repo source. A complete but invalid remote source fails compilation. |
| Deployment | `next.config.ts` explicitly includes the Realm of Myr content tree in server traces. Dynamic filesystem reads do not ensure bundling by themselves. |

The current runtime uses `loadAdventurePlanForRuntime` in `lib/wiki-adventures/plan-view.ts`. Registered adventures are adapted from compiled wiki artifacts into the UI's `AdventurePlan` shape. Other plans retain the legacy S3 JSON loader.

Do not delete the legacy JSON source files under `wiki/sources/adventure plans/`. The migration scripts read them. Legacy remote plan data was deliberately retained at cutover as a fallback.

## Premise

An adventure page may have a `## Premise` section. It compiles to `manifest.premise`. Added 2026-10-11 for Covert Cargo, where the two heroes are strangers.

- It says who knows whom, and what each knows, when the adventure starts.
- Every prompt that writes for a character carries it: NPC turns, roll outcomes, the end of a round, AI heroes, and the replies offered to a player.
- Players' side prompts see it, so it holds no secrets. Secrets go in an encounter's GM Notes.
- The GM is told it holds until the story shows it change.
- Without one, the GM assumes characters shown travelling or working together know each other.
- Legacy plans have none. See [the plan](plans/adventure-premise.md).

## Safety rules

Two optional manifest fields, enforced by the GM core in `packages/gm-core/src/wiki-adventures/player-safety.ts`. Added 2026-10-10 for Covert Cargo.

| Field | Contract |
|---|---|
| `playerDeath: false` | Player characters keep at least 1% health and never take the status "dead". Applies to NPC effects, roll outcomes, and advance patches. The GM's notes for every encounter gain a line saying so. |
| `rescue.encounter`, `rescue.atHealthPercent` | At the end of a round, when the encounter would otherwise continue and a player character is at or below the threshold, play moves to the rescue encounter. Once per playthrough. |

- A rescue fires only from an encounter that authors a transition to the rescue encounter. Add `- To [[encounter:<id>]] when ...` wherever a fight can happen.
- The model is never offered that transition. The health check alone triggers it.
- A fight already won or fled follows the transition the GM chose.
- The rescue encounter's intro follows the GM's narration of the round, so write it to open mid-fight.
- The compiler rejects a `rescue.encounter` that is not an encounter.
- No bundled adventure authors a rescue now. Covert Cargo had one until 2026-10-13, when its rescuer became a hero. Its bridge check exercises the rule on a copy of the artifacts with a rescue added.
- Legacy plans ignore both fields.

A premade can share an ID with another adventure's premade, since each adventure compiles from its own files. Thalbern is `thalbern` in The Midnight Summons and in Covert Cargo, with a sheet in each.

The four Myr adventures are one story: The Midnight Summons, Covert Cargo, The Road to Kordavos, then March of Davos. Names, the cargo and the endings are kept in step by hand, since nothing carries from one playthrough to the next. See [the lead-in plan](plans/adventure-lead-in.md) before changing a shared name or an ending. An adventure page names its successor in `nextAdventure`, which the website's ending and the desktop app's ending both offer. In the desktop app, continuing from an ending adds "THE STORY SO FAR" to the next adventure's premise: a chapter for each adventure finished, which outranks the notes where they disagree. Write a note that depends on an earlier adventure's outcome as "If the story so far says ..., then ...", as March of Davos does for the crate.

Editing March of Davos content changes its content hash, which the recorded GM prompts in `scripts/gm-core-fixtures/turn.json` pin. Replace the old hash there with the one `pnpm test:gm-core` reports.

To make one ending the likely one, say it three times: in the NPCs' `behavior`, in the GM notes with a rough number of rounds, and as the first transition. Covert Cargo's boat fight does this for Lyra going overboard.

Heroes who start apart and unknown to each other need two things. The `## Premise` says who knows of whom, which reaches every prompt. Each encounter's GM notes say what check changes it, since the roll decision on a hero's action reads the encounter's notes and not the premise. Covert Cargo's watchers use a Perception check, DC 15.

## Length

The round-end prompt for the four Myr adventures limits the GM's narrative. Added 2026-10-13, see [the plan](plans/concise-narration.md).

| Case | Limit |
|---|---|
| The encounter continues | One paragraph, 3 short sentences, 50 words. |
| The encounter changes | 2 short sentences, 35 words. |
| The GM notes call for an event at that moment | 5 sentences, 90 words. |
| An NPC's turn, and the outcome of its roll | 2 short sentences of narration, 40 words. Spoken lines are extra. |
| A player's action | Kept as written, or rewritten plainly with nothing added. |

- Nothing from the round or recent turns is told again, and no character repeats a line.
- Each transition option shows the GM its target's intro. The bridge stops where the intro starts, so write an intro to stand by itself.
- It is a prompt rule. No code cuts a long narrative.

Authoring for length:

- An intro says each fact once. Leave out a sentence that only sets a mood.
- Lines a note scripts for an NPC are spoken whole, beyond the NPC's limit. Say in the note that they are said once, or the NPC says them every round.
- An NPC with no scripted lines speaks at most 2 short ones a turn. Script what must be said in full.
- A note that asks the GM to describe something should say how much, such as "in a sentence or two".
- Write an intro in one tense. Narration is in the present.

## Labels in an intro

Added 2026-10-14 with [structured narrative](plans/structured-narrative.md). An intro paragraph may open with labels in braces, so the 3D stage knows who speaks, who acts and where to look. A paragraph without labels is narration.

```
{place: treeLine} Eyes shine in the shadows of the tree line.
{actor: owlbear, target: thalbern, from: treeLine, pace: hurry} A hulking monster crashes out of the undergrowth.
{speaker: wollandora, to: thalbern, delivery: soft} Thalbern. The forest is grateful you are here.
{actor: wollandora, effect: burst, element: nature} She sends out a wave of natural energy.
```

- `speaker` makes a line: the paragraph is the spoken words only. `actor` makes an action. Otherwise it is narration.
- Ids are character ids and the set's labelled marks. An id the scene does not have is dropped, and the words still show.
- `place` on an action walks the actor there. `from` brings them on from there.
- `effect`, `element` and `object` take the words in [the plan](plans/structured-narrative.md).
- Values are split on commas, so a `delivery` is written "calm and commanding".
- `private: true` on an action or line hides it from the other heroes' side: only its actor or speaker and its `target` or `to` know it. Use it for a hero's own errand, a hidden watcher, or a whisper. Since 2026-10-21, see [what a hero knows](plans/hero-knowledge.md).
- Prompts and the website's text views show the intro with its labels taken off and each line under its speaker's name.
- All four Myr adventures are labelled, as of 2026-10-14. An unlabelled paragraph is narration: nothing is guessed from its words.
- A spoken line needs its speaker among the encounter's characters. A quote by someone outside them stays in the prose with no bubble or voice. Covert Cargo has one, from Aelar in the-transaction. March of Davos had several until 2026-10-20, when the speakers joined their encounters' `npcs` and the quotes became lines. Its last quotes in prose are a disembodied voice in the-ambush and an unnamed vendor at the festival. See [the playtest](plans/march-of-davos-playtest.md#content-pass-2026-10-20).
- March of Davos takes its NPC sheets from the `generatedFiles` of its `migration-report.json`, not from every file in `npcs/`. A new sheet for it goes in that list, or the encounter that names it throws "Missing NPC sheet".
- An encounter's Intro, GM Notes, Checks, Summary and Transitions sections are read. Text under any other `##` heading reaches no prompt.
- An encounter with no `[[encounter:...]]` transition is an ending: arriving there tells its intro and completes the adventure, with no turn played in it. A confrontation the party must resolve needs transitions to ending encounters of its own. March of Davos's Final Confrontation had none until 2026-10-20, so the adventure ended on Joran's first line. It now leads to The New Dawn, Vengeance of the Blackthorn or The Dust Settles.

## Admin authoring

The canonical editor route is `/admin/adventure-plans/{settingId}/{planId}`. The old `/admin/wiki-adventures` and misspelled `/admin/adventures-plans` routes redirect.

The editor offers chat and key-field editing for existing registered adventures. Saves apply changes to canonical S3 source, with source hashes, revision history, and restore actions. Proposed source is compiled and blocked on validation errors before the canonical write. Restores also create a revision.

There is no separate user-facing draft/publish approval workflow in this editor. Creating arbitrary new community adventures remains future work. The source/published repository modules support preview and immutable artifact versions, but those capabilities do not describe the current editor's entire UX.

## Live gameplay and content changes

Convex stores adventure participants, characters, current encounter/turn, narrative history, discoveries, entity updates, open/resolved threads, and summaries. Gameplay writes update the live adventure record, not the authored template.

The current registered-adventure path recompiles selected source during play. In `convex/adventure.ts`, `commitWikiTurnAdvance`:

- Rejects a changed current turn or encounter and duplicate turn order.
- Records the generated turn, transition, and adventure patch.
- Re-pins `contentRef` when the current content hash differs.
- Marks terminal adventures completed and sets `endedAt`.

Here `contentRef` records provenance. It does not freeze an adventure on an immutable content snapshot. The re-pin behavior was introduced on 2026-07-06.

The standalone published repository and artifact loader do support immutable versions and rollback. `test:wiki-adventures:rollback` exercises those modules in memory. It does not establish frozen-version behavior for the live registered-adventure path.

## Validation and remaining work

Compiler batches, four adventure bridge checks, admin-authoring checks, and public-flow checks are listed in the [testing runbook](plans/testing-runbook.md).

The last recorded production source audit was 2026-08-25. All four adventures then depended on repo fallback. This is historical evidence, not a current S3 inventory.

Open authoring edge cases, test gaps, and technical audits are tracked in [maintenance](plans/maintenance.md).
