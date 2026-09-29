# feature/remove-3d-stack

[Plans](../../index.md) · [Wiki Home](../index.md) · [Stageview](../stageview.md)

Status: Implemented and validated on `feature/remove-3d-stack` (2026-09-29); merged to main in `b06a42b`

## Goal

Delete the old 3D encounter stack so [Stageview](../stageview.md) starts from a clean slate. Owner decision (2026-09-29): remove the r3f encounter diorama, scene-kit sets, standees and Hunyuan minis entirely. There are no real players, only test accounts, so there is no data migration and no refund handling.

Keep working: the turn page's 2D Mapview rail card, its fullscreen map, and the below-xl entry button; Storyview in the right rail; `/admin/mapview` and map generation.

## What was removed

| Area | Removed |
|---|---|
| Encounter view | `components/encounterview/*`, `lib/encounterview/*` |
| Scene engine | `lib/scene-kit/*`, `lib/scene-sets/*`, `lib/scene-pipeline/*`, `scripts/scene-pipeline/*`, `scripts/encounterview-assets-build.mjs` |
| Dev pages | `/dev/set-preview`, `/dev/scene-preview`, `public/dev-fixtures` (only the scene-preview page read them) |
| Server actions and types | `generate-encounter-scene.ts`, `generate-character-mini.ts`, `scene-preview.ts`, `generate-encounter-map.ts`, `types/encounter-scene-3d.ts` |
| Dormant 3D map | `components/adventure/miniatures-map.tsx`, `lib/map-preview-tokens.ts` (no importers) |
| `lib/map-utils.ts` | 1,110 lines cut to 99. Kept `inferEncounterSceneKit` (Mapview generation), `findEncounterById` (adventure home) and `listEncounterOptions`. |
| Paid products | `STANDEE_TOKEN_COST` (500) and `MINI3D_TOKEN_COST` (2,000), the flat-charge and refund paths, and all UI. `usage_encounter_asset` is no longer accepted by `decrementTokens` or the tokens action. |
| Assets | `public/standees/` (37 files) and `public/models/encounter/` (70 files, including `LICENSES.md`) |

Totals against `52ebdb9`:

- 173 files deleted (63 code, config and text files, plus 110 under `public/`), 1 added, 14 modified.
- About 13,600 lines of TypeScript and scripts deleted whole-file (16,765 lines including READMEs, fixtures and the exemplar HTML). The full diff is 17,517 deletions, including 922 lockfile lines.
- Binary assets: 45.4 MB (23.7 MB standees, 19.5 MB models), plus 24 KB of dev fixtures.

`three` and `@types/three` stay for Stageview. `lib/scene-kit/README.md` went with the code; the design lives on in [Stageview](../stageview.md).

## Map panel extraction

`EncounterPanel` and `EncounterRailPanel` hosted the 2D map alongside the 3D scene. They are replaced by `components/mapview/map-panel.tsx`, restored from the shape used before the encounter view (`c1635db^`):

- `MapRailPanel`: the rail card with title, expand button, and the 16:9 map with tokens. The map renders after mount only, because its foliage PRNG is not hydration-stable; a 16:9 placeholder holds the footprint.
- `MapPanel`: the amber "Map" floating button shown below xl, next to Game Chat.
- `MapOverlay`: the shared fullscreen view, portaled to `<body>` to escape the sticky rail. It keeps the title plaque, the "Close Map" pill, Escape to close, and the map summary caption. It uses `z-[60]`, above the turn page's `z-50` chrome and below the turn modal (`z-[70]`) and Storyview overlay (`z-[100]`).

`components/adventure/turn.tsx` mounts them only when the encounter has a stored map, as before the encounter view. Without a map the chat fills the rail. The chat-height mirroring and its zero-measurement guard are kept.

Dropped with the 3D stack:

- The Encounter/Map toggle and the 3D scene.
- The scene snapshot upload and the rail card's snapshot-then-art fallback.
- The turn strip, turn drawer and caption ticker.
- Overlay-open persistence in `sessionStorage`. It existed so the overlay survived turn advances triggered from inside it, and the map overlay has no turn UI.

The floating button no longer sets `aria-label`. The custom `Button` takes `ariaLabel`, so the old `aria-label` attribute was silently ignored; the visible text "Map" is the accessible name.

## Dependencies removed

`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `n8ao` (a direct dependency with no imports; `postprocessing` was only transitive) and `sharp` (only the removed standee, mini and pipeline code imported it; the app does not use `next/image`). `pnpm-lock.yaml` shrank by 922 lines. `sharp@0.34.5` stays as a Next.js transitive dependency.

## Kept on purpose

- Convex `usage_encounter_asset` in `tokenTransactionHistory` (ledger rows exist), with a comment. It was removed only from the `decrementTokens` args and the tokens action union, so nothing can create new rows.
- `map3d` / `map3dKey` on the encounter schema and the `Encounter3D*` schemas they use. `listEncounterOptions` and the Myr migration warning still read them. Removing them is a data-compatibility decision for later.
- `app/api/image-proxy` (host-allowlisted same-origin image proxy for WebGL textures). It has no callers now; Stageview may need it for portrait plates or figure textures. Delete it if Stageview does not.
- The `drawer` variant of `TurnNarrativeBody`. Its only host was the encounter view's turn drawer; Stageview's overlay is expected to reuse it.
- `content/settings/realm-of-myr/art-direction.md`, with its intro reworded. It is setting content that Stageview should read.
- `/dev/:path*` in the Clerk matcher in `proxy.ts`, ready for `/dev/stage`.
- The `.agents/skills/threejs-*` skills.
- "scene-kit" naming in `lib/mapview/generate.ts` and the Mapview scripts. It refers to the kept `inferEncounterSceneKit` keyword heuristic.

## Validation

Run in the worktree, with its isolated Convex project:

- `pnpm exec tsc --noEmit`: exit 0, no diagnostics.
- `pnpm lint` (`biome lint .`): 0 errors, 0 warnings, 1 info in 479 files. The pre-change baseline at `52ebdb9` was 7 warnings and 3 infos in 542 files, so the removal cleared all 7 warnings and 2 infos. The remaining info (`useTemplate` in `scripts/mapview-render.ts`) is untouched. `pnpm exec biome check .` still reports 24 formatting and import-order errors in files this branch did not touch.
- `pnpm build`: passed on the final code; the route table has no `/dev/*` routes and `/api/image-proxy` is still listed.
- Playwright (`PLAYWRIGHT_BASE_URL=http://localhost:3317`, against `next start -p 3317` on the production build): 15 of 16 passed. The failure is the existing production limitation described in [Static homepage](zzz-completed/feature-static-homepage.md): `signed-out users cannot access the admin dashboard` expects development's `Access Denied` page, but production redirects to the missing `/sign-in` route (404). It passed when run separately against an isolated `next dev -p 3318` server, so all 16 cases pass.
  - Playwright 1.58.2's own Chromium build (1208) is not installed on this machine. A temporary config (not committed) used the installed Google Chrome via `channel: "chrome"`.
- Map panel check with a temporary fixture page and spec (deleted afterwards), on the dev server at 1440×900:
  - The rail card shows the title, tokens and 16:9 map.
  - Expand and map-click open the fullscreen view with the title plaque, tokens and summary caption.
  - Escape and Close Map close it; the floating Map button opens and closes it too.
  - No page errors. Screenshots were inspected.
- Real turn page: not rendered. The worktree Convex database is empty, so no adventure or turn exists to open.
- Leftover-reference grep for `encounterview`, `scene-kit`, `scene-sets`, `scene-pipeline`, `standee`, `minis3d`, `character-mini`, `@react-three`, `miniatures-map`, `encounter-scene-3d`: outside the wiki, only the kept items above remain (the ledger literal and comment, the Mapview "scene-kit inference" wording, and `art-direction.md` naming the removed reader).

## Left for later

- **S3 prefixes** (nothing in code reads or writes them now; deleting is a manual, remote-data decision):
  - `settings/<settingId>/scenes3d/` (per-turn scene specs)
  - `images/minis/` (standee cutouts)
  - `images/minis3d/` (Hunyuan GLBs)
  - `images/scene-previews/` (rail snapshots)
- **Git branches to retire:** `minimap-claude`, `claude/competent-moore-d09a8e`, `origin/claude/stoic-gates`. Not touched here.
- **External repo:** `~/Projects/asset-pipeline` (source of the generated props) is no longer needed.
- **Environment:** `FAL_KEY` is unused now; drop it from the Vercel and local env files.
- **Convex deploy:** removing `usage_encounter_asset` from the `decrementTokens` args needs a Convex deploy to take effect. Nothing depends on it.
- **Convex project:** delete the worktree's Convex project `d20adventures-feature-remove-3d-stack` in the dashboard after `wt:finish`.
- **Follow-ups:** decide whether to drop `map3d` / `map3dKey` and `Encounter3D*`; keep or delete `image-proxy` and the `drawer` variant once Stageview's needs are known.

## Progress

- [x] Extract the map-only panel and mount it from the turn page.
- [x] Remove code, dev pages, fixtures and assets.
- [x] Remove the standee and mini token products (ledger literal kept).
- [x] Trim `lib/map-utils.ts` to the Mapview-used helpers.
- [x] Remove the 3D dependencies and `sharp`.
- [x] Validate: TypeScript, lint, build, Playwright, map panel check.
- [x] Update the wiki.
- [ ] `wt:finish` (owner decision; not run).

Finished: 2026-09-29 (merged to main, policy: merge)
