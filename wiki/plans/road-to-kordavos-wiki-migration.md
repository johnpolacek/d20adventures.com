# Road to Kordavos Wiki Migration

[← All plans](index.md) · **Status:** Implemented

Migrate the custom-character legacy adventure `the_road_to_kordavos_adventure_plan.json` into authored wiki source and wire it into the local wiki runtime bridge.

**Encounters:** 3 · **NPC sheets:** 4 · **Source files:** 12 · **Start:** `well-met`

## Scope
- Generate source under `content/settings/realm-of-myr/adventures/the-road-to-kordavos/` plus 4 shared Realm of Myr NPC sheet and profile pairs.
- Repair the blank legacy start field to `well-met`.
- Preserve custom-character start and transition behavior by loading saved player sheets into the local wiki runtime.

## Acceptance
- `pnpm migrate:road-to-kordavos` generates 12 source files plus `migration-report.json`, and publish validation passes.
- `pnpm test:wiki-adventures:road-to-kordavos-bridge` verifies runtime registration, 3 encounters, 4 NPCs, custom character assembly, and transition graph shape.
- Typecheck, build, and route smoke pass before handoff.
