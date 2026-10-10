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
- Legacy plans ignore both fields.

An NPC who is also another adventure's premade needs its own ID. Covert Cargo's Thalbern is `thalbern-npc`, since `thalbern` is the Midnight Summons premade.

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
