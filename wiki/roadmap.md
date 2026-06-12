# Roadmap

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · **Roadmap** · [Architecture](Architecture.md)

Re-assessed 2026-06-11, after the wiki-adventure implementation merged to `main` (`fbd3e97`, 2026-06-10).

**Where we are:** the wiki-authored adventure runtime is merged and four Realm of Myr adventures are migrated with passing bridge tests, TypeScript, and build. `pnpm check` is green and build-stable, admin canonical writes are gated behind validation, S3 fallback is complete-manifest-aware, the admin routes are normalized, and **The Midnight Summons has been played end-to-end in the browser to completion**. The whole "Now" release-readiness track is closed. Remaining gap before a production cutover: the public listing/selection path still reads legacy S3 JSON (see Next).

**Current focus:** [Production Cutover](plans/production-cutover.md) — move the public play flow off legacy `AdventurePlan` JSON onto the wiki runtime, then make it production-safe. The implementation-review hardening track is closed.

## Now — release readiness

Blocking work to make the merged runtime trustworthy. Source: the implementation review findings.

| # | Item | Status | Why |
|---|---|---|---|
| 1 | Fix `pnpm check` (Biome diagnostics) | ✅ Done | One green, build-stable validation command (generated files excluded). |
| 2 | Pre-write validation for admin canonical S3 source writes | ✅ Done | Edits are compiled and gated before any S3 write, so invalid source never becomes the runtime candidate. |
| 3 | Complete-manifest-aware S3 source fallback | ✅ Done | S3 is preferred only when it covers every expected local path; a partial seed falls back to repo-local source. |
| 4 | Normalize admin route naming and nav state | ✅ Done | `/admin/wiki-adventures` is the single canonical family; the rest redirect into it. |
| 5 | Authenticated end-to-end playthrough of one migrated adventure | ✅ Done | The Midnight Summons played start→completion in-browser (selection, auto-start, perception/stealth rolls, branching, terminal encounter, completion UI). Found and fixed a solo auto-start navigation bug. See the [playthrough checklist](plans/midnight-summons-playthrough-checklist.md). |

## Next — production cutover

Now the committed track. Detailed in [Production Cutover](plans/production-cutover.md). The runtime is trustworthy; move the public flow onto wiki source. Three public pages (listing, character-select, character-create) still read legacy JSON, and `availableCharacterOptions` is not yet compiled into the wiki manifest.

- Carry `availableCharacterOptions` through the wiki runtime (unblocks the custom-character path).
- Cut the listing, character-select, and character-create screens over from legacy JSON to wiki-backed data.
- Audit production S3 wiki-source completeness before seeding (complete-manifest fallback already exists locally).
- Remove, gate, or mark dev-only the prototype/unauthenticated workbench server actions.
- Verify rollback: revision restore and content-ref pinning behave under a bad publish.
- Then retire or stub the legacy dual-read once the new paths are proven in the browser.

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
