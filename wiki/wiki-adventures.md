# Wiki adventures

[Home](index.md) · [Architecture](Architecture.md) · [Gameplay](gameplay-flows.md) · [Testing](plans/testing-runbook.md)

Status: Implemented reference. Reviewed against local main on 2026-10-01.

The four registered Realm of Myr adventures use authored markdown and JSON compiled into runtime artifacts. The public discovery and gameplay cutover completed in June 2026. There is no remaining migration project for those four adventures.

## Source and compiler

| Concern | Current contract |
|---|---|
| Registry | `LOCAL_WIKI_ADVENTURES` in `lib/wiki-adventures/local-runtime.ts` registers The Midnight Summons, Covert Cargo, The Road to Kordavos, and March of Davos. |
| Manifest | Adventure `adventure.md` frontmatter supplies identity, start encounter, party limits, premades, character options, and asset metadata. |
| Encounters | Markdown files carry stable IDs, NPC/location refs, transitions, intro, and GM notes. NPC refs can include `startNear`. |
| Characters | JSON sheets hold mechanical data. Paired markdown profiles hold authored narrative context. |
| Entities | NPCs, locations, factions, and items support context retrieval. Encounter location refs also supply map titles. |
| Compiler | `compiler.ts` produces manifest, encounters, entities, character sheets, graph, retrieval index, and validation report. Registered runtime loads compile in publish mode and reject blocked content. |
| Source selection | Prefer S3 source only when it covers every expected repo-local path. Empty, partial, or failed remote reads fall back to the repo source. A complete but invalid remote source fails compilation. |
| Deployment | `next.config.ts` explicitly includes the Realm of Myr content tree in server traces. Dynamic filesystem reads do not ensure bundling by themselves. |

The current runtime uses `loadAdventurePlanForRuntime` in `lib/wiki-adventures/plan-view.ts`. Registered adventures are adapted from compiled wiki artifacts into the UI's `AdventurePlan` shape. Other plans retain the legacy S3 JSON loader.

Do not delete the legacy JSON source files under `wiki/sources/adventure plans/`. The migration scripts read them. Legacy remote plan data was deliberately retained at cutover as a fallback.

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
