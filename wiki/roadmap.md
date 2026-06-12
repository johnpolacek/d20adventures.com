# Roadmap

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · **Roadmap** · [Architecture](Architecture.md)

Re-assessed 2026-06-11, after the wiki-adventure implementation merged to `main` (`fbd3e97`, 2026-06-10).

**Where we are:** the wiki-authored adventure runtime is merged and four Realm of Myr adventures are migrated with passing bridge tests, TypeScript, and build. `pnpm check` is green and build-stable, admin canonical writes are gated behind validation, S3 fallback is complete-manifest-aware, the admin routes are normalized, and **The Midnight Summons has been played end-to-end in the browser to completion**. The whole "Now" release-readiness track is closed. Remaining gap before a production cutover: the public listing/selection path still reads legacy S3 JSON (see Next).

**Current focus:** [Production Cutover](plans/production-cutover.md) — **complete and verified** (2026-06-12). The entire discovery + gameplay path reads the wiki runtime; the legacy editor is removed; the legacy AdventurePlan JSON is kept as a harmless never-reached fallback; the prod S3 audit and rollback verification are done; March of Davos was reconciled (prod S3 → repo) so all four adventures resolve to repo-bundled source. All four are deploy-ready — only the prod deploy itself (`convex:deploy` + frontend) remains, at the owner's discretion.

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

The committed track, detailed in [Production Cutover](plans/production-cutover.md). The code cutover is **done and browser-verified**; only pre-prod-push assurance remains.

- ✅ Carry `availableCharacterOptions` (and `teaser`/`summary`) through the wiki runtime.
- ✅ Cut listing, character-select, character-create, and the `/play` grid onto wiki-backed data.
- ✅ Route the whole gameplay/runtime path through the wiki runtime (a stub legacy plan can no longer 500 any play surface).
- ✅ Gate the prototype workbench server actions behind `requireAdmin`.
- ✅ Remove the legacy adventure-plan editor; keep the legacy S3 JSON as a harmless never-reached fallback.
- 🔲 Audit production S3 wiki-source completeness (read-only) before the prod push.
- 🔲 Verify rollback: revision restore + content-ref pinning behave under a bad publish.

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
