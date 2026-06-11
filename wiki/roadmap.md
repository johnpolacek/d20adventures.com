# Roadmap

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · **Roadmap** · [Architecture](Architecture.md)

Re-assessed 2026-06-11, after the wiki-adventure implementation merged to `main` (`fbd3e97`, 2026-06-10).

**Where we are:** the wiki-authored adventure runtime is merged and four Realm of Myr adventures are migrated with passing bridge tests, TypeScript, and build. It is **not** a production cutover — legacy S3 JSON still drives the public listing and selection path, `pnpm check` fails repo-wide, and no authenticated end-to-end playthrough has been run. Current focus is hardening, not new features.

**Current focus:** [Wiki Adventure Implementation Review](plans/wiki-adventure-implementation-review.md) — close its findings before anything ships.

## Now — release readiness

Blocking work to make the merged runtime trustworthy. Source: the implementation review findings.

| # | Item | Why |
|---|---|---|
| 1 | Fix `pnpm check` (Biome import-sort/format diagnostics) | Restore one green, standard validation command before release work. |
| 2 | Pre-write validation for admin canonical S3 source writes | Stop invalid LLM or key-field edits from becoming the runtime source of truth. |
| 3 | Complete-manifest-aware S3 source fallback | Prevent a partial S3 seed from overriding known-good repo-local source. |
| 4 | Normalize admin route naming and nav state | One canonical admin URL; the rest redirect. Reduce authoring confusion. |
| 5 | Authenticated end-to-end playthrough of one migrated adventure | Bridge tests cover data flow; a human path must reach completion in the browser. |

## Next — production cutover

Once the runtime is trustworthy, move the public flow onto wiki source.

- Audit production S3 wiki-source completeness, or add complete-manifest detection, before seeding.
- Cut the public listing and character-selection screens over from legacy JSON to wiki-backed data (or retire the dual-read bridge).
- Remove, gate, or mark dev-only the prototype/unauthenticated workbench server actions.
- Verify rollback: revision restore and content-ref pinning behave under a bad publish.

## Later — platform hardening

Carry-over risk from prior assessments; scope after cutover is stable.

- **Authorization** — confirm the February 2026 security findings status first, then audit adventure access, per-character turn mutation, and Convex in-function auth checks.
- **Data layer** — index, validator, and query hardening (collect/filter hotspots, loose validators).
- **Realtime** — verify the Convex realtime model and remove any duplicated polling/SSE paths before refactors.

## Deferred — product growth

Bigger bets from the product brief, intentionally not started during hardening.

- Multiplayer adventures and community adventure creation.
- Authoring beyond default-adventure improvement (new adventures and settings).

## How to use this page

`Now` is the only committed track. `Next`/`Later`/`Deferred` are direction, not commitments — re-assess after each `Now` item lands and record material changes in [the log](log.md).
