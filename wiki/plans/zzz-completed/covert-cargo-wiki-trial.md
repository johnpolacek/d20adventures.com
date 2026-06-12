# Covert Cargo Wiki Trial

[← All plans](index.md) · **Status:** Implemented

Migrate the legacy `covert-cargo.json` AdventurePlan into authored wiki source and wire it into the local wiki runtime bridge far enough to start a two-premade practice run and reach the first generated turn.

**Source:** legacy JSON · **Party:** 2 premade · **Encounters:** 9 · **Source files:** 24

## Scope
- Use the existing `wiki-adventure-implementation` worktree.
- Generate wiki source under `content/settings/realm-of-myr/adventures/covert-cargo/` plus shared Realm of Myr NPC sheets.
- Repair legacy source issues during migration: missing start encounter, blank transition target, and numeric-looking premade IDs in frontmatter.
- Generalize the Midnight-only runtime bridge so both The Midnight Summons and Covert Cargo can pin compiled artifacts for create, start, and advance flows.

## Acceptance
- `pnpm migrate:covert-cargo` generates 24 source files plus `migration-report.json`, and publish validation passes.
- `pnpm test:wiki-adventures:covert-cargo-bridge` verifies start encounter `the-shipment`, 9 encounters, 5 NPCs, 2 premades, no blank transition, and first-turn assembly for Lyra and Poppen.
- `pnpm test:wiki-adventures:midnight-bridge` still passes after the bridge is generalized.
- Typecheck, build, and diff whitespace validation pass before handoff.

## Manual trial
Use practice mode for the first smoke because Covert Cargo requires exactly two player characters. Select Lyra Silvanus and Poppen Quickfoot, start the run, and confirm the first turn renders for `the-shipment`.
