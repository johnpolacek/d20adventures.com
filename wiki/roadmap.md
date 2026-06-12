# Roadmap

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · **Roadmap** · [Architecture](Architecture.md)

Re-assessed 2026-06-12, after the production cutover deployed to `main` (`3857148`).

**Where we are:** the wiki-adventure runtime is fully live in production. All four Realm of Myr adventures (Midnight Summons, Covert Cargo, Road to Kordavos, March of Davos) resolve through the wiki runtime end-to-end — discovery, character selection, gameplay, and turn execution. The legacy adventure-plan editor is removed. March of Davos was reconciled (prod S3 → repo canonical). Convex functions deployed; Vercel frontend deploying from `main`. Both the release-readiness and production-cutover tracks are **closed**.

## ✅ Now — release readiness (closed 2026-06-11)

| # | Item | Status | Why |
|---|---|---|---|
| 1 | Fix `pnpm check` (Biome diagnostics) | ✅ Done | One green, build-stable validation command (generated files excluded). |
| 2 | Pre-write validation for admin canonical S3 source writes | ✅ Done | Edits are compiled and gated before any S3 write, so invalid source never becomes the runtime candidate. |
| 3 | Complete-manifest-aware S3 source fallback | ✅ Done | S3 is preferred only when it covers every expected local path; a partial seed falls back to repo-local source. |
| 4 | Normalize admin route naming and nav state | ✅ Done | `/admin/wiki-adventures` is the single canonical family; the rest redirect into it. |
| 5 | Authenticated end-to-end playthrough of one migrated adventure | ✅ Done | The Midnight Summons played start→completion in-browser (selection, auto-start, perception/stealth rolls, branching, terminal encounter, completion UI). Found and fixed a solo auto-start navigation bug. See the [playthrough checklist](plans/midnight-summons-playthrough-checklist.md). |

## ✅ Next — production cutover (closed 2026-06-12)

Full detail in [Production Cutover](plans/production-cutover.md).

- ✅ Carry `availableCharacterOptions` (and `teaser`/`summary`) through the wiki runtime.
- ✅ Cut listing, character-select, character-create, and the `/play` grid onto wiki-backed data.
- ✅ Route the whole gameplay/runtime path through the wiki runtime (a stub legacy plan can no longer 500 any play surface).
- ✅ Gate the prototype workbench server actions behind `requireAdmin`.
- ✅ Remove the legacy adventure-plan editor; keep the legacy S3 JSON as a harmless never-reached fallback.
- ✅ Audit production S3 wiki-source completeness — all four adventures resolve to repo-bundled source (`pnpm audit:wiki-adventures:prod-s3`).
- ✅ Verify rollback: content-ref pinning isolates in-flight adventures; rollback re-points `latest.json` (`pnpm test:wiki-adventures:rollback`).
- ✅ Deployed: Convex functions pushed to `marvelous-mink-850`; schema fix for `tokenTransactionHistory.description`; Vercel build triggered from `main`.

## Later — platform hardening

Carry-over risk from prior assessments; scope after cutover is stable.

- **Authorization** — confirm the February 2026 security findings status first, then audit adventure access, per-character turn mutation, and Convex in-function auth checks.
- **Data layer** — index, validator, and query hardening (collect/filter hotspots, loose validators).
- **Realtime** — verify the Convex realtime model and remove any duplicated polling/SSE paths before refactors.

## Deferred — product growth

Bigger bets from the product brief, intentionally not started during hardening.

- Multiplayer adventures and community adventure creation.
- Authoring beyond default-adventure improvement (new adventures and settings).

## Vision — experience modes

Three distinct ways to experience the same adventure. All modes share the same game state and adventure content — players can switch freely between them mid-adventure.

### Gameview (current)
The default experience. Text-driven, turn-by-turn play with the AI Game Master. Players read encounter narrative, make choices, and roll dice. The foundation all other views build on.

### Storyview
A cinematic, immersive mode. Encounter narrative is presented one paragraph at a time, with each paragraph read aloud via AI-generated text-to-speech. The player taps to advance between paragraphs. Decision points and dice rolls still occur — they are narrated just like the story text. Feels like an interactive audiobook.

### Mapview
A tabletop-inspired visual layer. A realistic 3D tile map — detailed terrain and character models evoking painted miniatures on a physical table — serves as a visual backdrop to the adventure. The narrative and choices remain the primary interface; the map shows where you are in the world.

## How to use this page

`Now` is the only committed track. `Next`/`Later`/`Deferred` are direction, not commitments — re-assess after each `Now` item lands and record material changes in [the log](log.md).
