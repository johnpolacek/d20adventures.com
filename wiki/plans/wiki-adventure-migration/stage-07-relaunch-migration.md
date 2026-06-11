# Relaunch Migration And Old-System Removal

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 7.** Plan the worktree-based complete relaunch: remove old JSON/editor assumptions, migrate Myr templates, and define rollback at the branch/deployment level rather than preserving old runtime compatibility. After 2 minutes, understand what "nuke the old system" means in a controlled implementation plan.

## Units Overview

- **Unit 01 - Worktree relaunch plan**: Define branch/worktree setup, isolation rules, environment strategy, deployment preview, and merge criteria for the full architecture replacement. *Verification:* No old-system destructive work is planned on the main working tree.
- **Unit 02 - Myr template migration**: Map current Myr setting adventure templates from JSON into S3 wiki folders, preserving story intent, encounters, NPC sheets/profiles, maps, premade character sheets/profiles, and start flows. *Verification:* Representative Myr migrated templates pass the Stage 4 validation model and Stage 5 prompt model.
- **Unit 03 - Removal list**: Identify old files, routes, components, Convex schema fields, types, services, tests, scripts, and docs that become obsolete under the relaunch. *Verification:* Removal list distinguishes delete now, adapt, and defer until post-launch cleanup.
- **Unit 04 - Rollout and rollback**: Define preview validation, production launch steps, S3 content backup, Convex data reset/migration expectations, and rollback strategy. *Verification:* Rollback does not depend on maintaining legacy JSON plan compatibility inside the new code path.

## Unit 01 - Worktree Relaunch Plan

**Unit 01 decision.** Implement the relaunch in an isolated feature worktree/branch, not directly in the dirty main checkout. The implementation branch can remove old JSON/editor architecture aggressively after replacement gates pass, while main remains the rollback point until the new stack validates in preview. The branch should be treated as a complete architecture replacement, not a compatibility shim.

Worktree relaunch rules:

- **Branch isolation**: Create a dedicated relaunch branch such as `feature/wiki-adventure-relaunch` in a sibling worktree. Keep main as integration/rollback until merge.
- **Environment isolation**: Use separate local runtime state, S3 prefixes, preview URLs, and any mutable backend identifiers for the relaunch worktree. Do not run destructive migration tests against production-like content.
- **Implementation posture**: Remove old paths only after the new compiler, editor, gameplay context, and Myr migration are usable enough to satisfy acceptance gates.
- **Merge criteria**: Merge only after Stage 8 final plan acceptance, preview deployment validation, migrated Myr adventure proof, and rollback plan confirmation.

### Setup Rules

- Inspect dirty state before creating the worktree and do not overwrite user/agent wiki changes.
- Use a sibling path such as `../d20adventures.com.worktrees/wiki-adventure-relaunch`.
- Use a dedicated branch such as `feature/wiki-adventure-relaunch`.
- Use a stable preview URL, preferably Portless, such as `https://wiki-adventure-relaunch.d20adventures.localhost` if the repo workflow supports it.
- Keep S3 test prefixes separate from current production paths until cutover.
- Ask before dependency installs, pushes, commits, and long commands per project automation policy.

### Implementation Phases

1. Compiler/validator and Stage 4 artifact generation.
2. S3 source/preview/published service layer.
3. Stage 6 wiki editor shell and AI change-set flow.
4. Myr JSON-to-wiki migration tool and migrated source artifacts.
5. Stage 5 gameplay context assembler and transition validator.
6. Convex session schema/function changes for content pinning.
7. Old editor/runtime path removal.
8. Preview deployment, acceptance tests, and cutover readiness review.

## Unit 02 - Myr Template Migration

**Unit 02 decision.** Myr is the proof migration. The old JSON templates should be converted into the canonical source layout from Stage 3, compiled through Stage 4, played through Stage 5, and edited through Stage 6. The migration should preserve story intent and gameplay affordances rather than byte-for-byte JSON structure.

| Old source | New source | Migration rule |
| --- | --- | --- |
| `AdventurePlan.title`, `teaser`, `overview`, `party`, `image`, `start`, `nextAdventure` | `adventure.md` | Move identity and launch metadata to frontmatter; move overview/teaser into body sections. |
| `sections[].scenes[].encounters[]` | `encounters/{encounterId}.md` | Flatten to encounter files. Preserve title, intro, GM instructions, NPC refs, transitions, image refs, and map notes. |
| `encounter.instructions` | `## GM Notes`, `## Checks`, and `## Transitions` | Split instructions into meaningful markdown sections where possible; keep ambiguous text in GM Notes. |
| `encounter.transitions[]` | Typed transition bullets and `graph.json` after compile | Use `[[encounter:id]]` links; unresolved targets allowed only in preview, not publish. |
| `AdventurePlan.npcs` | `content/settings/myr/npcs/{id}.json` and `.md` | Reusable Myr NPCs become setting-level paired sheet/profile files unless clearly adventure-specific. |
| `premadePlayerCharacters[]` | `adventures/{adventureId}/characters/{id}.json` and `.md` | Keep JSON sheet as mechanical source; generate profile markdown for wiki retrieval and character selection. |
| Images/maps | Full S3 URL asset refs | Preserve or convert existing keys to approved full S3 URLs where valid. Validate missing refs. Do not assume WebP. |
| `availableCharacterOptions` | `adventure.md` metadata | Preserve only if the relaunch character creation flow still needs it. |
| `skipInitialNpcTurns` | Explicit encounter runtime metadata | Migrate if still needed by Stage 5 gameplay rules. |
| `resetHealth` | Do not migrate by default | Flag for manual review; reintroduce only as explicit transition/session effect. |

### Migration Tool Output

- Generated source file tree under `content/settings/myr/...`.
- Migration report listing every source JSON field and destination path.
- Warnings for ambiguous instruction splits, missing assets, duplicate IDs, unresolved transitions, hidden flags, and character-sheet schema issues.
- Generated paired markdown profiles for NPCs and premade PCs.
- Preview compile bundle and validation report.

### Acceptance Proof

- At least one representative Myr adventure publishes with zero validation errors.
- Representative skeleton from Stage 3 remains consistent with generated migration output.
- Start flow can select premade characters and start a Convex preview session.
- Context packet contains current encounter, linked NPC/location profiles, character snapshots, transitions, and recent turns.
- Practice report reads migrated content and turn history without old section/scene paths.

## Unit 03 - Removal List

**Unit 03 decision.** The relaunch branch should keep a living removal list with three categories: delete now, adapt, and defer. This prevents the branch from carrying obsolete compatibility code indefinitely while avoiding premature deletion of behavior that the new stack has not replaced yet.

| Area | Decision | Gate |
| --- | --- | --- |
| `types/adventure-plan.ts` | Adapt/delete | Delete old runtime AdventurePlan type after compiler/runtime types replace it and Myr migration tool no longer imports it except in migration-only code. |
| `components/adventure-plans/*` | Delete/replace | Remove after wiki editor satisfies Stage 6 safe deletion gates. |
| `app/settings/[settingId]/[adventurePlanId]/edit` | Replace | Route to wiki adventure editor or remove old route once migrated adventure IDs are stable. |
| Old adventure creation/start actions reading JSON plans | Adapt | Replace with published bundle and pinned content ref loading. |
| Prompt services traversing sections/scenes | Delete/replace | Replace with Stage 5 context packet assembler. |
| Old transition lookup from encounter arrays | Delete/replace | Replace with `graph.json` validator. |
| Old S3 JSON plan storage helpers | Adapt | Keep generic S3 utilities; remove AdventurePlan-specific storage once source file service exists. |
| Convex `planId` semantics | Adapt | Rename or reinterpret as `adventureId`/content ref in final schema plan. |
| 3D map generation | Defer/delete | Keep only if product scope re-adds it; otherwise remove deprecated editor affordances. |
| User character JSON behavior | Preserve | Do not migrate in this relaunch except to ensure compatibility with session copies. |
| Practice reports | Adapt | Keep report feature but switch source context to pinned artifacts and turn history. |

## Unit 04 - Rollout And Rollback

**Unit 04 decision.** Rollback should happen at branch/deployment and content-pointer boundaries, not by preserving the legacy JSON runtime inside the relaunch code path. The launch should be gated by preview deployment validation, S3 backups, Convex migration readiness, and migrated Myr acceptance.

| Phase | Required checks |
| --- | --- |
| Before preview deploy | Compiler tests, validation fixtures, migrated Myr preview bundle, wiki editor smoke path, gameplay context assembly test, transition validator test, Convex content pinning test. |
| Preview deploy | Use isolated S3 prefixes and preview Convex data. Confirm no production latest pointer changes. |
| Pre-production backup | Record current deploy SHA, S3 content snapshot/prefix backup, Convex schema/data migration plan, and rollback owner. |
| Production cutover | Deploy relaunch code, publish validated Myr artifacts, update public adventure selection to read `latest.json`, and start only new sessions on wiki content. |
| Post-cutover verification | Start adventure, select characters, submit no-roll and roll actions, advance encounter, validate transition, generate practice report, publish/rollback smoke check. |
| Rollback | Revert deployment to prior stable SHA and/or move `latest.json` to prior published version. Do not mutate immutable version folders. |

### Launch Gates

- Stage 8 final implementation plan is approved.
- Myr migrated adventure publishes with zero errors.
- Old editor safe deletion gates from Stage 6 are satisfied or explicitly deferred.
- Runtime can start and play a session from published artifacts without old JSON AdventurePlan reads.
- Preview deployment passes manual and automated smoke checks.
- Rollback has been rehearsed on preview or documented with exact owner/actions.

*Verification:* Stage 7 is complete when Stage 8 can turn it into an implementation sequence with worktree setup, Myr migration proof, removal gates, preview rollout, production cutover, and rollback instructions.
