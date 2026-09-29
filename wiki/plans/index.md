# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Active planning work for D20 Adventures. The wiki-adventure runtime is merged and the production cutover is complete and deployed (2026-06-12). All prior plans are in [zzz-completed](zzz-completed/).

## Active

- **[Stageview](stageview.md)** — assessment and plan (2026-09-29) to replace the whole 3D stack (r3f encounter diorama, scene-kit, standees, Hunyuan minis) with the painted procedural three.js approach from the `d20-graphics-test-2` Kordavos v4 demo. Includes measurements, experiments, removal inventory, and phases. Owner decisions are recorded; phase 1 (clean slate) is merged to main.
- **[Storyview](feature-storyview.md)** — token-funded TTS audio narration of turns (Gemini TTS, narrator + per-character voices) with a full-screen cinematic paragraph-at-a-time mode. On `feature/storyview` (worktree, branched off `feature/play-layout-refactor`).
- **[Mapview](mapview.md)** — 2D D&D-style battle maps: AI-generated at authoring time from a standard SVG piece set, square grid, static encounter backdrop. v1 merged to main 2026-07-03; catalog growth (water/interiors/city pieces) is next.
- **[Testing Runbook](testing-runbook.md)** — canonical testing runbook for adventure plans and runtime play behavior.
- **[Parallel Dev Worktrees](parallel-dev-worktrees.md)** — git worktree workflow with Portless URLs and per-worktree Convex projects (`pnpm wt:*` scripts).

## Completed

- **[Remove 3D stack](zzz-completed/feature-remove-3d-stack.md)** — phase 1 of Stageview: deleted the old r3f encounter view, scene-kit, standee and mini stack (about 13,600 LOC, 45 MB of assets, 8 dependencies) and re-homed the 2D map rail as `components/mapview/map-panel.tsx` (2026-09-29).
- **[Static homepage](zzz-completed/feature-static-homepage.md)** — prerendered public homepage, client-loaded welcome card, and authenticated API token refresh (2026-09-15).
- **[Reduce Vercel Fluid Active CPU](zzz-completed/vercel-fluid-cpu.md)** — removed request-wide visit tracking and pathname headers, restored static public routes, narrowed Clerk middleware, and audited remaining dynamic rendering (2026-08-31).
- **[Setting adventure listing hardening](zzz-completed/setting-adventure-listing.md)** — restored repo-local wiki content in production traces and replaced Realm of Myr's positional intro/full curation with one playable-adventure grid (2026-08-25).

All completed plans are archived in [zzz-completed/](zzz-completed/).
