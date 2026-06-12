# March of Davos Wiki Migration

[← All plans](index.md) · **Status:** Implemented

Migrate the older nested March of Davos source into authored wiki source with normalized encounter IDs, promoted NPC sheets, inferred linear transitions, and saved-character runtime support.

**Encounters:** 45 · **NPC sheets:** 35 · **Source files:** 116 · **Start:** `the-gates-of-kordavos`

## Scope
- Normalize 45 legacy encounters from name, narrative, and notes fields into wiki encounter files.
- Promote 35 inline NPC records into reusable Realm of Myr NPC sheet and profile pairs.
- Fold legacy stage text into GM notes and infer linear encounter transitions, because the source has no explicit transition graph.
- Set the blank start field to `the-gates-of-kordavos`.

## Acceptance
- `pnpm migrate:march-of-davos` generates 116 source files plus `migration-report.json`, and publish validation passes.
- `pnpm test:wiki-adventures:march-of-davos-bridge` verifies runtime registration, 45 encounters, 35 NPCs, inferred transitions, and first-turn saved-character and NPC assembly.
- Typecheck, build, and route smoke pass before handoff.
