# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Active and completed planning work for D20 Adventures. The wiki-adventure runtime has merged to `main` and the post-merge hardening track is closed; current focus is the production cutover of the public play flow.

## Current focus

**[Production Cutover](production-cutover.md)** — *planned, not started*

Move the three public pages that still read legacy `AdventurePlan` JSON (listing, character-select, character-create) onto the wiki runtime, carry `availableCharacterOptions` through compilation, audit prod S3 completeness, gate the prototype workbench actions, and verify rollback. See the [roadmap](../roadmap.md) for the full Next/Later/Deferred view.

| | |
|---|---|
| **Cutover surface** | listing, character-select, character-create still read legacy JSON |
| **Key gap** | `availableCharacterOptions` not yet compiled into the wiki manifest |
| **Sequencing** | Unit 3 (manifest field) → Units 1–2 (front-door cutover) → Units 5–7 (prod gates) |

## Completed

- **[Wiki Adventure Implementation Review](wiki-adventure-implementation-review.md)** — *hardening done*. All five release-readiness findings closed: Biome check, admin pre-write validation, complete-manifest S3 fallback, admin route naming, and an authenticated end-to-end playthrough (The Midnight Summons to completion). Three further runtime bugs found and fixed via live playthroughs.

## Implemented

- **[Admin Wiki Authoring Rebuild](admin-wiki-authoring-rebuild.md)** — per-adventure chat authoring, key-field editing, and canonical S3 wiki source writes with revision recovery.
- **[Admin Adventure Plans Navigation](admin-adventure-plans-nav.md)** — admin-only top-bar links for the dashboard and Adventure Plans area behind the existing admin check.
- **[Covert Cargo Wiki Trial](covert-cargo-wiki-trial.md)** — migration and start-flow bridge for the legacy two-premade Covert Cargo adventure.
- **[Road to Kordavos Wiki Migration](road-to-kordavos-wiki-migration.md)** — custom-character Realm of Myr migration with saved-character runtime bridge support.
- **[March of Davos Wiki Migration](march-of-davos-wiki-migration.md)** — older nested full-adventure source normalized into wiki encounters, NPC sheets, and inferred linear transitions.

## Archive

- **[Wiki Adventure Migration](wiki-adventure-migration/index.md)** — *merged*. The original eight-stage implementation plan. The worktree has merged; see the Implementation Review for current hardening work.
