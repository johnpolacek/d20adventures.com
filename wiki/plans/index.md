# Plans

[Wiki Home](../index.html) · [Sources](../Sources.html) · [Roadmap](../roadmap.html) · [Architecture](../Architecture.html)

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

## In progress

- **[The Midnight Summons Playthrough Test](midnight-summons-playthrough-test.md)** — *iterating*. Migrate and manually test the single-player Realm of Myr adventure end-to-end through the existing public selection and premade flow.

## Implemented

- **[Admin Wiki Authoring Rebuild](admin-wiki-authoring-rebuild.md)** — per-adventure chat authoring, key-field editing, and canonical S3 wiki source writes with revision recovery.
- **[Sidebar Section & Scene Navigation](sidebar-section-scene-navigation.md)** — refocus the adventure editor on a prose workflow driven by sidebar section and scene selection with scroll-spy.
- **[Admin Adventure Plans Navigation](admin-adventure-plans-nav.md)** — admin-only top-bar links for the dashboard and Adventure Plans area behind the existing admin check.
- **[LLM Style Policy](llm-style-policy.md)** — universal user-visible prose style: no em dashes, no semicolons, simple grammar, concise output.
- **[Covert Cargo Wiki Trial](covert-cargo-wiki-trial.md)** — migration and start-flow bridge for the legacy two-premade Covert Cargo adventure.
- **[Road to Kordavos Wiki Migration](road-to-kordavos-wiki-migration.md)** — custom-character Realm of Myr migration with saved-character runtime bridge support.
- **[March of Davos Wiki Migration](march-of-davos-wiki-migration.md)** — older nested full-adventure source normalized into wiki encounters, NPC sheets, and inferred linear transitions.

## Archive

- **[Wiki Adventure Migration](wiki-adventure-migration/index.html)** — *merged*. The original eight-stage implementation plan. The worktree has merged; see the Implementation Review for current hardening work.
