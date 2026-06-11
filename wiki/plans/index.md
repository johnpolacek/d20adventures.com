# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Active and completed planning work for D20 Adventures. The wiki-adventure runtime has merged to `main`; current focus is post-merge hardening before production cutover.

## Current focus

**[Wiki Adventure Implementation Review](wiki-adventure-implementation-review.md)** — *merged, hardening pending*

Post-merge code review, validation evidence, and hardening recommendations for the merged feature worktree. Fix the validation and source-write findings before treating the wiki runtime as production-ready.

| | |
|---|---|
| **Active** | Implementation Review |
| **State** | Merged, hardening pending |
| **Next** | Fix validation and S3 source-write hardening findings |
| **Blockers** | `pnpm check` Biome diagnostics; production S3 source needs controlled verification |
| **Validation** | Wiki tests, TypeScript, and build pass; repo-wide Biome check fails |

## Implemented

- **[Admin Wiki Authoring Rebuild](admin-wiki-authoring-rebuild.md)** — per-adventure chat authoring, key-field editing, and canonical S3 wiki source writes with revision recovery.
- **[Admin Adventure Plans Navigation](admin-adventure-plans-nav.md)** — admin-only top-bar links for the dashboard and Adventure Plans area behind the existing admin check.
- **[Covert Cargo Wiki Trial](covert-cargo-wiki-trial.md)** — migration and start-flow bridge for the legacy two-premade Covert Cargo adventure.
- **[Road to Kordavos Wiki Migration](road-to-kordavos-wiki-migration.md)** — custom-character Realm of Myr migration with saved-character runtime bridge support.
- **[March of Davos Wiki Migration](march-of-davos-wiki-migration.md)** — older nested full-adventure source normalized into wiki encounters, NPC sheets, and inferred linear transitions.

## Archive

- **[Wiki Adventure Migration](wiki-adventure-migration/index.md)** — *merged*. The original eight-stage implementation plan. The worktree has merged; see the Implementation Review for current hardening work.
