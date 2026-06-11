# Final Implementation Plan Assembly

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 8.** Synthesize Stages 1-7 into a decision-complete implementation roadmap for the worktree relaunch. After 2 minutes, know what the final plan must contain before any code work starts.

## Units Overview

- **Unit 01 - Implementation milestones**: Break execution into safe milestones: foundation deletion/replacement, S3 wiki content layer, parser/index/validation, Convex realtime model, LLM context assembly, AI authoring UI, Myr migration, tests, and cleanup. *Verification:* Each milestone has acceptance criteria and a clear dependency order.
- **Unit 02 - Test and acceptance plan**: Define automated and manual checks for authoring, validation, S3 writes, Convex realtime sync, gameplay turn loop, LLM output, migrated Myr adventures, and destructive cleanup. *Verification:* The plan names commands, test fixtures, and manual playthrough scripts.
- **Unit 03 - Risk controls**: Document risks around data loss, prompt quality, malformed markdown, S3 consistency, auth, publish mistakes, migration quality, and deleting too much too early. *Verification:* Each material risk has mitigation, detection, and rollback guidance.
- **Unit 04 - Final handoff**: Create the implementation-ready plan and update `wiki/plans/index.md`, `wiki/roadmap.html`, source briefs, and log as needed. *Verification:* A future agent can start implementation in a worktree without re-asking architecture basics.

## Final Decision - Implementation Plan Is Ready To Start In A Worktree

**Final decision.** The relaunch should proceed as a complete wiki-first implementation in an isolated worktree. S3 markdown/JSON source files become canonical authored adventure content; compiled S3 artifacts become runtime context; Convex remains live realtime session state; AI authoring applies structured change sets and records restorable revisions; and old JSON AdventurePlan editor/runtime paths can be removed after replacement gates pass.

Final architecture pillars:

- **Content source**: `content/` S3 source tree with `adventure.md`, `encounters/*.md`, setting entities, paired character JSON/profile files, assets, and typed wiki links.
- **Runtime projection**: Compiler writes `manifest.json`, `encounters.json`, `entities.json`, `character-sheets.json`, `graph.json`, `retrieval-index.json`, and `validation-report.json`.
- **Gameplay**: LLM context packets combine pinned published artifacts with Convex session state. Transitions validate against `graph.json`. Lightweight D20/narrative compatibility is preserved.
- **Authoring**: A dense wiki-editor workbench replaces the form-first AdventurePlan editor. AI chat applies structured changes to S3 source; humans steer and restore through revision history.

## Implementation Milestones

| # | Milestone | Primary output | Acceptance |
| --- | --- | --- | --- |
| 0 | Relaunch worktree setup | `feature/wiki-adventure-relaunch` worktree, isolated env/state notes, implementation plan copy | Work happens outside dirty main checkout; preview URL/state isolation documented. |
| 1 | Content schemas and source service | Typed source models, S3 file service, frontmatter/parser helpers, character-sheet validators | Can read source markdown/JSON sheets and apply change sets with stale-write hashes, schema validation, and revision records. |
| 2 | Compiler and validation | Stage 4 artifact compiler, `draftPreview`/`publish` validation, finding codes | Representative skeleton compiles; publish mode blocks unresolved targets and invalid sheets. |
| 3 | Preview/publish storage | `content/`, `preview/`, `published/`, `latest.json`, publish records | Preview bundle writes, published version immutability, no-op unchanged publish, rollback pointer movement. |
| 4 | Myr migration tool | Old JSON-to-wiki converter and migration report | At least one Myr adventure migrates and publishes with zero errors. |
| 5 | Wiki authoring workbench | File tree, key-field editors, chat-primary AI panel, revision history, validation drawer, graph/preview/publish center | Stage 6 safe deletion gates for core editor jobs are satisfied. |
| 6 | AI authoring tools | Server-action/API capabilities returning `AuthoringChangeSet` and writing `AuthoringRevision` records | Create/expand/split/link/repair/summarize/transition/character-pair tools auto-apply to canonical source, validate after writes, and support revision restore. |
| 7 | Gameplay runtime projection | Context packet assembler, transition validator, published artifact loader, prompt update | Turn advancement no longer reads old nested AdventurePlan sections/scenes. |
| 8 | Convex Adventure updates | Content pinning fields, Adventure wiki state fields, embedded turn patches, guarded mutations | Adventures pin content version/hash or preview draft ID; stale turn/transition writes are rejected and validated patches evolve the playthrough record. |
| 9 | Old system removal | Deleted/replaced old editor/runtime surfaces and obsolete tests | Removal list is satisfied or explicitly deferred; no launch path depends on old JSON AdventurePlan runtime. |
| 10 | Preview rollout and cutover | Preview deployment, smoke scripts, backup/rollback checklist | Myr playthrough, publish/rollback, authoring, and report flows pass before production cutover. |

### Start Commands

```bash
# Ask before running these per project policy.
git worktree add ../d20adventures.com.worktrees/wiki-adventure-relaunch -b feature/wiki-adventure-relaunch
cd ../d20adventures.com.worktrees/wiki-adventure-relaunch
pnpm install

# Then copy this planning track into the implementation worktree context:
sed -n '1,220p' wiki/plans/wiki-adventure-migration/index.html
sed -n '1,260p' wiki/plans/wiki-adventure-migration/stage-08-final-plan.html
```

### Do Not Start By

- Deleting old editor/runtime files before compiler, editor, gameplay, and Myr gates exist.
- Writing directly to production S3 prefixes during migration tests.
- Changing user-created character storage as part of this relaunch.
- Adding full SRD combat automation or HP migration.
- Making AI chat the only authoring path.
- Letting published sessions read unsaved editor buffers or raw draft markdown.

## Test And Acceptance Plan

| Area | Automated checks | Manual acceptance |
| --- | --- | --- |
| Parser/compiler | Fixtures for valid adventure, unresolved preview target, duplicate IDs, missing start encounter, bad frontmatter, invalid character sheet, missing asset. | Open compiled artifacts and confirm records match source files. |
| Validation | Severity tests for `draftPreview` vs `publish`; stable finding shape snapshots. | Editor shows findings grouped by severity and focuses affected file/entity. |
| S3 lifecycle | Unit tests for key builders, stale-write hash rejection, preview write, immutable publish, unchanged content no-op, latest pointer rollback. | Publish a test adventure, roll latest back, verify previous version remains intact. |
| Myr migration | Migration fixture from old JSON to source tree; migration report coverage; publish validation zero-error proof. | Review migrated Myr story/encounters/NPCs/premades for intent preservation. |
| Authoring UI | Component/integration tests for file tree, auto-save revisions, AI chat edits, validation drawer, graph view, publish center. | Create/edit encounter, repair validation issue through chat, restore a revision, publish valid draft. |
| Gameplay context | Context packet unit tests, token-budget ordering, live Convex state precedence, legal transition enforcement. | Play no-roll turn, roll turn, legal transition, invalid transition rejection. |
| Convex/session | Mutation tests for content pinning, current turn guards, player control, embedded transition patch, optional roll mirror, chat separation, and Adventure wiki patch application. | Two clients observe realtime turn/chat updates without stale writes moving encounter, and reports/admin views see the evolved playthrough record. |
| Reports | Practice report reads pinned artifacts, turn snapshots, parsed rolls, transitions, adventure patches, changed entities, and validation findings. | Generate practice report from migrated Myr preview run that reflects what happened in that playthrough. |
| Removal | `rg AdventurePlan` inventory decreases to migration-only/explicit deferred uses. | Old form editor route no longer needed for launch-critical authoring. |
| Rollout | Build/lint/typecheck/test suite and preview smoke script. | Preview cutover checklist completed with rollback owner and commands. |

## Launch Acceptance Gates

1. At least one migrated Myr adventure compiles and publishes with zero validation errors.
2. Preview playthrough can start from the migrated published bundle, select premades, submit a no-roll action, resolve a required roll, advance a turn, and validate a graph transition.
3. Wiki editor can create/edit/save source files, show validation, apply an AI chat change, restore a revision, repair a missing transition target, and publish.
4. Published gameplay no longer reads old JSON AdventurePlan section/scene/encounter arrays.
5. Convex Adventures pin content refs and do not change authored context when a new version is published.
6. Rollback can move `latest.json` or deployment pointer without rewriting immutable published artifacts.
7. Old editor deletion gates are satisfied or explicitly listed as deferred non-launch cleanup.
8. Implementation worktree has clean status, validation evidence, and user approval before merge/push.

## Risk Controls

| Risk | Mitigation | Detection | Rollback |
| --- | --- | --- | --- |
| Data loss in S3 source | Stale-write hashes, source versioning/backups, explicit delete confirmation. | Audit write logs, source hashes, editor history. | Restore source object version or backup prefix. |
| Invalid content published | Hard publish validation, write artifacts before latest pointer, read/hash verification. | Validation report, publish smoke checks. | Move `latest.json` back to prior version. |
| LLM invents transition | Graph validator commits only current ID or legal outgoing edge. | Rejected transition patches and telemetry. | Keep current encounter, retry generation, admin repair. |
| Prompt context too broad/noisy | Unit 01 deterministic ordering and token budget rules. | Context packet snapshots and prompt-quality review. | Reduce linked context and rely on graph/typed refs. |
| Migration loses story intent | Migration report, human review, representative Myr playthrough. | Diff old JSON concepts against generated source tree. | Patch source files before publish; keep old JSON as migration input. |
| Old code deleted too early | Safe deletion gates and delete/adapt/defer list. | Acceptance checklist failure or missing authoring/runtime capability. | Do not merge deletion until replacement passes; recover from branch history. |
| Unauthorized authoring writes | Server-side Clerk/admin/ownership checks for all S3 writes, preview compiles, publishes, rollbacks. | Authorization tests and denied-write logs. | Revert source object versions and rotate affected access if needed. |
| Active sessions break after publish | Version pinning and immutable artifact folders. | Session contentRef checks. | Existing sessions continue pinned version; rollback latest for new sessions. |

## Implementation Contracts Addendum

This addendum locks the concrete contracts needed before coding. It reflects the decision that an authored Adventure Plan is a stable S3 wiki template, while an Adventure is a live AI-GM-controlled playthrough that evolves its own backend wiki record in Convex.

| Area | Locked contract | Implementation consequence |
| --- | --- | --- |
| Naming | `planId` identifies the authored Adventure Plan. Convex `adventures._id` identifies the live Adventure playthrough. | Do not rename `planId` away just because old JSON plans are removed. Reinterpret it as the wiki Adventure Plan ID. |
| Drafts | One shared active draft exists per Adventure Plan. Publishing or explicitly locking a version freezes that draft and starts a new active draft copied from the locked source. | Editor and AI tools target the active draft for a plan. The product does not need multiple named draft workspaces in v1. |
| Writes | All source mutations go through `AuthoringChangeSet`. Human text edits create human-authored change sets; AI edits create AI-authored change sets; restores create restore-authored change sets. | No direct human file-write path. The same validation, stale-hash, and revision history flow applies to human, AI, and restore edits. |
| Preview | Each active draft has one mutable latest preview bundle, with optional preview history deferred. | Validation/playtest uses the latest preview pointer for that draft. Old preview bundles can be overwritten or garbage-collected unless later history is added. |
| Publish versions | Published version IDs use timestamps plus content hash, not simple numeric versions. | Use paths such as `published/settings/myr/adventures/the-old-road/2026-05-21T22-30-00Z-ab12cd34/`. `latest.json` points to a concrete timestamp/hash version. |
| Assets | Authored image/asset fields store full S3 URLs. | The compiler validates allowed bucket/prefix, existence, content type, and accessibility. Runtime can render URLs directly while still rejecting unsafe external URLs. |
| Admin operations | Use Next.js Server Actions for admin UI operations. Use API routes only for streaming, uploads, webhooks, or other request shapes Server Actions do not fit. | Authoring service boundaries should be app-owned actions/API handlers, not production use of local agent skills. |
| Adventure runtime | An Adventure Plan does not mutate during play. The live Adventure evolves in Convex as a backend wiki-like playthrough record. | Turn advancement returns `narrative`, `nextEncounterId`, and `adventurePatch`. The patch updates summaries, discoveries, entity changes, open threads, character mutations, and transition data after validation. |
| Transitions | No separate `transition_events` table for v1. | Store transition decisions on the turn that caused them and summarize them into the Adventure wiki record. Keep the graph validator as the authority for legal movement. |
| Reports | Reports read pinned plan artifacts plus the evolved Adventure record. | Practice/campaign reports should summarize what happened in this playthrough, including discoveries and changed state, not only raw turns plus original plan text. |

## Starter Module Map

The exact file names may change during implementation, but the first pass should keep these boundaries clear so source storage, compilation, authoring, and runtime state do not blur together.

| Module area | Likely files | Responsibility |
| --- | --- | --- |
| Source service | `lib/wiki-adventures/source-service.ts`, `lib/wiki-adventures/s3-keys.ts` | Read active draft files, apply change sets, enforce stale hashes, build S3 keys, validate full S3 asset URLs, and exclude revision snapshots from source reads. |
| Change sets | `lib/wiki-adventures/change-sets.ts` | Define `AuthoringChangeSet`, path safety, stale-hash checks, and apply rules. |
| Compiler | `lib/wiki-adventures/compiler.ts`, `lib/wiki-adventures/validation.ts` | Parse source markdown/JSON, produce runtime artifacts, generate validation reports, and enforce publish blockers. |
| Publish repository | `lib/wiki-adventures/published-repository.ts` | Write mutable preview bundle, immutable timestamp/hash publish bundle, `latest.json`, and rollback pointer updates. |
| Gameplay runtime | `lib/wiki-adventures/runtime-context.ts`, `lib/wiki-adventures/transition-validator.ts`, `lib/wiki-adventures/adventure-patch.ts` | Load pinned artifacts, assemble AI GM context, validate legal transitions, validate/apply `adventurePatch`. |
| Admin actions | `app/_actions/wiki-adventures/source-actions.ts`, `publish-actions.ts`, `ai-authoring-actions.ts` | Server-side admin operations for file tree, edit/change-set flow, validation, preview, publish, rollback, and AI authoring. |
| Convex | `convex/schema.ts`, `convex/adventure.ts`, optional `convex/adventureWiki.ts` | Add content refs, current encounter, adventure summary/state fields, embedded turn patches, and guarded mutations for turn advancement. |

## Final Handoff Prompt

```
Use project-html-wiki and parallel-dev-worktrees. Start implementation of the Wiki Adventure Migration relaunch in an isolated worktree. Read:
- wiki/plans/wiki-adventure-migration/index.html
- wiki/plans/wiki-adventure-migration/stage-08-final-plan.html
- wiki/plans/wiki-adventure-migration/stage-03-content-model.html
- wiki/plans/wiki-adventure-migration/stage-04-runtime-projection.html
- wiki/plans/wiki-adventure-migration/stage-05-llm-gameplay.html
- wiki/plans/wiki-adventure-migration/stage-06-authoring-admin.html
- wiki/plans/wiki-adventure-migration/stage-07-relaunch-migration.html

Do not implement on the dirty main checkout. Create a relaunch worktree/branch after asking if needed by project policy. Implement in milestone order: source service, compiler/validation, preview/publish lifecycle, Myr migration, authoring workbench, AI change sets, gameplay context/transition validation, Convex pinning, removal gates, preview rollout. Preserve user character JSON behavior. Do not add full SRD combat automation. Do not write production S3 prefixes during tests.
```

*Verification:* Stage 8 is complete when a future implementation agent can start the relaunch worktree and execute milestones without re-asking content model, runtime projection, gameplay, authoring, migration, or rollout architecture basics.
