# Sources

[Home](index.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

GM core sources updated on 2026-10-02. Other sources reviewed 2026-10-01. Current local source establishes implementation. Dated logs establish past validation and decisions. Remote state requires a fresh read.

## Source index

| Source | Establishes |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Script names and declared/resolved dependencies. |
| `app/`, `components/`, `proxy.ts`, `next.config.ts` | Routes, UI, auth matcher, and runtime content tracing. |
| `lib/wiki-adventures/`, `content/settings/realm-of-myr/` | Four registered wiki adventures, compiler, source selection, admin writes, and runtime bridge. |
| `packages/gm-core/src/orchestration/advance-turn.ts`, `convex/adventure.ts` | Current live progression and content re-pinning behavior. |
| `lib/services/turn-audio-service.ts`, `convex/turnAudio.ts` | Incremental narration, claims, manifests, charging, and auto mode. |
| `lib/mapview/`, `components/mapview/` | Stored 2D maps, catalog, generation, placement, and rendering. |
| `lib/stage/`, `public/stage/`, `app/dev/stage/` | Current Stage engine, declarative specs, assets, and preview. |
| `tests/`, `scripts/wiki-adventures-*-check.ts`, `scripts/stage-*.ts` | Available verification and its actual scope. Tests are not evidence of passing until run. |
| `scripts/wt.sh`, root and wiki `AGENTS.md` | Worktree behavior and automation policy. |
| `packages/gm-core/`, `lib/gm-server/`, `lib/ai/` | Portable GM runtime and typed ports, server adapters, billing, current model, and compatibility wrappers. See [GM core](gm-core.md). |
| `scripts/gm-core-check.ts`, `scripts/gm-server-check.ts`, `scripts/gm-core-fixtures/` | Extraction parity against `7ff0b2d`, browser dependency boundary, access/transition checks, and billing behavior. |
| [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) | Permitted use of a player's own Claude subscription through the unmodified CLI. External, read 2026-10-01. |
| [Desktop spike](../apps/desktop-spike/README.md), its `harness/` and `results/` | Dated native CLI measurements, complete service-turn traces, exact-prompt/state replay, strict patch-retention checks, paired request-count and native render timings, image artifacts, Clerk ticket sign-in, and Convex connectivity. Limits and external protocol sources are in [phase 0](plans/desktop-local-play.md#phase-0-spike). |
| `~/Projects/aifilmcamp/apps/macos/Packages/FilmBrain/Sources/FilmBrain/` | Local reuse source for CLI locators, invocation builders, bounded processes, and image generation. No credential files copied. Read 2026-10-01. |
| [Decision log](log.md) | Dated milestones, owner decisions, validation evidence, and limits. |
| Git history through `0eedb26` | Pre-cleanup plans and implementation history. Deleted documents remain recoverable. |

## Retained migration inputs

The files under `wiki/sources/adventure plans/` are legacy inputs, not current authored content. The four `scripts/migrate-*.ts` scripts still read their adventure JSON files. Preserve them unless the migration tooling is deliberately retired.

The current authoring source is under `content/settings/realm-of-myr/` or the corresponding complete S3 source. March of Davos was reconciled from richer production source into the repo in June 2026, so rerunning its original migration can overwrite later authoring.

## Source briefs

[Product](sources/prd.md) · [Technical](sources/technical-brief.md) · [Design](sources/design-brief.md) · [Marketing](sources/marketing-brief.md)

Old root technical/assessment documents named in earlier wiki versions no longer exist. Their historical risk lists are not a substitute for inspecting current code.

## Evidence limits

- Last recorded production S3 completeness audit: 2026-08-25. All four registered adventures then used repo fallback.
- Last recorded Stage engine validation: 2026-09-29 on an M3 development build. No phone measurement.
- Last recorded homepage browser/cache validation: 2026-09-15 on an isolated local production server.
- October's documentation audit did not inspect current Vercel/Convex/S3 state, rerun gameplay, or delete remote resources.

Unknown deployment state, remaining temporary projects, and current audit findings are tracked in [maintenance](plans/maintenance.md).
