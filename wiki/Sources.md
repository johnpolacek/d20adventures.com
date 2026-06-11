# Sources

[Home](index.md) · **Sources** · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

This page catalogs the source material used to initialize and maintain the wiki. Claims are tied to repository evidence, current project docs, or explicit user instructions rather than inferred certainty.

**Reader goal:** after two minutes, know which sources are authoritative, which are stale, and where unknowns remain.

## Summary

- **Application shape** *(confirmed from repo)* — Next.js App Router app with Convex backend, Clerk auth, S3 content storage, AI SDK integrations, Stripe, SendGrid, Playwright, Biome, and custom local skills.
- **Product intent** *(confirmed from source doc)* — narrative turn-based RPG platform with an AI Game Master, authored adventure plans, character turns, rolls, NPC turns, and eventual multiplayer/community-creation ambitions.
- **Fresh priorities** *(needs hardening)* — the wiki-adventure implementation is merged. Current priorities are post-merge validation cleanup, canonical S3 source-write safety, partial remote-source fallback, admin route naming, and manual playthrough coverage.

## Source briefs

- **[Product brief](sources/prd.md)** — audience, gameplay loop, core workflows, constraints, and non-goals.
- **[Technical brief](sources/technical-brief.md)** — stack, runtime boundaries, integration surfaces, validation posture, and known technical risks.
- **[Design brief](sources/design-brief.md)** — interface principles, visual system direction, interaction patterns, and accessibility expectations.
- **[Marketing brief](sources/marketing-brief.md)** — public-entry, launch, signup, and external-audience context.

## Source matrix

| Source | Evidence | Confidence | Notes |
|---|---|---|---|
| `README.md` | Product overview, gameplay loop, public links, future multiplayer/community goals. | High | Primary product narrative. |
| `package.json` | Current dependency and script surface: Next 16.1.6, React 19.2.4, Convex 1.32.0, AI SDK 6, Clerk 7. | High | More current than older technical docs for exact versions. |
| Merge commit `fbd3e97` | Brought `feature/wiki-adventure-implementation` into `main`: migrated wiki source, runtime bridge, Convex content refs, admin authoring, and route conflict resolution. | High | Current source of truth for the post-merge review baseline. |
| `lib/wiki-adventures/` | Compiler, validation, source service, S3 key handling, local runtime, Convex session helpers, transition validation, admin authoring, and migration helpers. | High | Primary implementation surface for wiki-authored adventures. |
| `content/settings/realm-of-myr/` | Migrated source for The Midnight Summons, Covert Cargo, The Road to Kordavos, March of Davos, NPC profiles, character sheets, and migration reports. | High | Repo-local fallback source for registered local wiki adventures. |
| Validation commands | Focused wiki-adventure batch tests, admin authoring, four bridge checks, TypeScript, and build pass after merge. `pnpm check` fails with current Biome diagnostics. | High | See the [implementation review](plans/wiki-adventure-implementation-review.md) for command-level detail. |
| `TECHNICAL_DOCUMENTATION.md` | Architecture, runtime roles, data model, flows, LLM context guide, next milestones. | Medium | Strong structure, but dependency versions are older than `package.json`. |
| `CODEBASE_ASSESSMENT.md` | Security findings, build/check status as of 2026-02-28, remediation phases. | Medium | Some status may be superseded by later code changes; use as risk context. |
| `PRIORITY_ASSESSMENT_2026-02-28.md` | Convex, realtime, authorization, schema/index, and upgrade priorities. | Medium | Matches technical doc risk posture. |
| `Roadmap.md` (repo root) | Prior stabilization cycle closed; fresh priorities were TBD at import time. | High | Canonical roadmap reset before wiki import. |
| Repository tree | `app/`, `components/`, `convex/`, `lib/`, `types/`, `tests/`, `.agents/skills/`. | High | Confirms root target and repo-local skill convention. |
| `wiki/sources/adventure plans/the-midnight-summons.json` | Legacy Realm of Myr source: 1-player party, Thalbern premade, 7 encounters, Wollandora and Owlbear NPCs, transition graph. | High | Primary source for the playthrough migration/test plan. |
| `wiki/sources/adventure plans/covert-cargo.json` | Legacy Realm of Myr source: 2-player party, Lyra and Poppen premades, 9 encounters, 5 NPCs, branchy riverboat graph. | High | Primary source for the Covert Cargo migration and start-flow trial. |
| `wiki/sources/adventure plans/the_road_to_kordavos_adventure_plan.json` | Legacy Realm of Myr source: 1-3 player custom-character adventure, 3 encounters, 4 NPCs, simple road-to-city graph. | High | Primary source for the Road to Kordavos migration and saved-character bridge. |
| `wiki/sources/adventure plans/the-march-of-davos-plan.json` | Legacy Realm of Myr source: older nested format, 45 named encounters, inline NPC records, legacy stage blocks, no explicit transition graph. | High | Primary source for the March of Davos migration and normalization report. |
| User instruction | Initialize the project wiki; prefer commits and pulls when confident. | High | Commit/pull preference lives in root `AGENTS.md` and `wiki/AGENTS.md`; pushes still require confirmation. |

## Known unknowns

| Unknown | Why it matters | Safest next action |
|---|---|---|
| Current production S3 wiki source completeness. | Runtime prefers S3 source when any remote files are present, so partial remote seeding can override complete local fallback. | Audit bucket state or add complete-manifest detection before production cutover. |
| Authenticated end-to-end playthrough coverage after the merge. | Bridge tests validate runtime wiring, but user-facing creation, turns, completion, and admin edits need browser coverage. | Run at least one migrated adventure from character selection through completion with an authenticated account. |
| Whether February 2026 security findings are already fully fixed. | Planning should not repeat completed work or miss remaining vulnerabilities. | Run a focused audit before creating an authorization plan. |
