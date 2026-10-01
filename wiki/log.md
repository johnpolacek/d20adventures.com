# Decision history

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

This log retains durable decisions and dated evidence. Git owns detailed implementation history. Past validation does not establish current production health.

## 2026-10-01, desktop phase 0 findings

The isolated Tauri spike is in `apps/desktop-spike/` on `spike/desktop-local-play`, created with the approved worktree script. Its empty Convex project is `d20adventures-spike-desktop-local-play`, deployment `gallant-squirrel-646`. No web app, root dependency, shared schema, billing, production data, or CLI credential changes.

Claude Code 2.1.287 ran an authored Kordavos progression fixture from the real prompt service and a separate roll-schema probe in one persistent process. Its startup reported no tools, settings-derived capabilities, skills, plugins, or MCP. Progression took 4.180 s, including 0.781 s initialization. The second request took 1.451 s. Both passed the existing zod schemas on the first answer, one inference request each. The `gemini-3.5-flash-lite` API baseline passed in 2.283 s and 0.615 s. Claude was more vivid and slightly better grounded in this one sample. A complete gameplay pipeline was not measured.

Codex app-server, Gemini ACP, and Grok ACP were detected but blocked before GM inference. Their tested versions did not provide a verified way to ignore user settings while preserving existing CLI sign-in without handling credentials. No GM latency or quality result exists for those three. Claude also needed explicit built-in plugin overrides beyond safe mode. The final locator bypasses GUI PATH wrappers by preferring known installed binaries.

Codex generated a portrait in 44.022 s and a front/back sheet in 48.073 s. Grok took 12.799 s and 13.863 s. All now have locally removed backgrounds and split standees. Three used chroma key. Codex ignored the standee's green-background instruction, so local macOS Vision supplied the mask. Visual review found usable silhouettes, some hair-edge fringing, and portrait-to-standee detail drift.

Clerk signed in the existing test account in the packaged `tauri://localhost` webview through a single-use development ticket. The Convex React WebSocket connected and the real query resolved against the empty isolated database. OAuth redirects and authenticated Convex JWT authorization remain untested. No session secrets were saved in evidence.

Recommendation: **no-go for the four-provider GM promise under the current isolation rules, conditional go for a Claude-first follow-up if the owner accepts narrower support.** The four-provider execution requirement remains unmet. This does not change the owner's product scope or authorize a web migration. The [phase 0 results](plans/desktop-local-play.md#phase-0-spike) contain metrics, source and artifact links, limitations, and the next gates.

Validation passed for three focused tests, scoped Biome, root TypeScript, Vite production build, Rust formatting and Clippy, a packaged debug Tauri app, native UI trials, and local segmentation. Changes are committed locally. Nothing was pushed or merged. The worktree and isolated Convex project remain for review.

## 2026-10-01, stage-first turn page demo merged

The scripted gate-scene mock (`feature/stage-turn-mock`, 2026-09-29 to 10-01) is merged and public at `/demo/kordavos` for feedback. It makes no model calls and is noindexed. Owner decisions made along the way are recorded in [Stageview](plans/stageview.md#product-decisions):
- Mapview is for larger maps.
- Turns work like Baldur's Gate 3, with movement as game state, coming from the written action.
- The narration stays as text, stepping through by default.
- Intros are staged and belong to the adventure plan.
- Rolls can interrupt a resolution, as contests.
- The scene is played as written: the party meets in line, then faces the sergeant.

Evidence:
- The narrative-to-movement eval scored 8/8 on the gate scene with `gemini-3.5-flash-lite`.
- Full step-throughs of both pickpocket outcomes ran with no console errors.

Details: [Stage-first turn mock](plans/feature-stage-turn-mock.md).

## 2026-10-01, desktop local play direction

Owner proposed a Tauri desktop app that becomes the only game client. Web play is deprecated once it ships. Solo play is free and runs the GM through the player's own installed AI CLI and subscription, including Claude Code, Codex, Gemini CLI, and Grok. Multiplayer keeps the server GM and is paid by a subscription granting tokens at roughly current pricing. Narration is an optional player-supplied voice provider. Players generate characters or use premades. The audience is AI-savvy tabletop players, and requiring a CLI is acceptable. Distribution is a notarized direct download. Local content is authored adventures with pre-baked art.

Anthropic's Claude Code legal page, read the same day, permits an end user signing in to the unmodified Claude Code binary with their own subscription. The app must not touch credentials, intermediate usage, or use the Agent SDK for subscription play. The owner accepts the terms risk for the other CLIs.

Game logic moves into a shared TypeScript package for the server and desktop. Stageview's stage-first turn page will be built in the desktop app, not the web app. Local players supply art and narration through their own CLIs or keys, with no tokens. Voice provider is TBD. Authoring moves into the desktop app, and admin stays on the web. Phones are TBD, and focus is desktop. No code was written. See [Desktop local play](plans/desktop-local-play.md).

## 2026-10-01, wiki reconciliation

- Audited plans against local main and Git history. Rebuilt the dashboard around active Stageview work, maintenance, and reference guides.
- Removed 26 completed planning documents and seven obsolete comparison images. Preserved engine details in [Stage engine](stage-engine.md), current narration behavior in [Storyview](storyview.md), and content contracts in [Wiki adventures](wiki-adventures.md).
- Rewrote Stageview to separate merged engine work from remaining staging, integration, and coverage. Corrected Mapview storage and integration status.
- Updated the testing runbook, architecture, roadmap, source briefs, and agent-guide filenames. Condensed old log entries whose detailed implementation history is already in Git.
- Carried unresolved checks and cleanup into [maintenance](plans/maintenance.md), including Storyview validation, the test wrapper, editor clearing, and remote resources.
- Corrected older content-pinning claims. Current live adventures compile current source and re-pin provenance on advance. The rollback test covers separate artifact modules.
- Recorded Storyview's implemented automatic split charging and paragraph reuse, which supersede the original on-demand-only plan.
- Verification passed for 144 local links and heading anchors across 21 documents, documented pnpm scripts and explicit source paths, stale-reference searches, and diff whitespace. Routes were checked against the source tree. No app build, browser playthrough, deployment, or remote cleanup was performed.

## 2026-09-29, Stageview direction and engine

Owner chose Stageview as the future primary play screen, with docked text/input, complete readable narrative, phone landscape play, and text fallback. Community sets must be declarative data interpreted by trusted code.

The old r3f encounter stack was removed in merge `b06a42b`. The map-only panel replaced its map surface. Paid standee/mini products were removed while historical ledger data and legacy schema fields were retained. No player purchase migration was required.

The v5 engine port merged in `384a622`: plain three.js, scoped atmosphere, painterly post-processing, instanced front/back crowd cards, standees, bounded set/staging specs, Kordavos gate, and a development preview. Named characters use detailed front/back art. Earlier procedural-only and overlay directions were superseded.

Recorded validation: TypeScript, lint, build, set checks, and GPU verification passed. Every tested shot fit 300 draw calls and 2.5M triangles. Ultra at DPR 2 ran 21 to 28 fps, high at DPR 1.5 ran 52 to 54 fps with motion disabled, and steady-state JS heap was 42 MB. Mobile tier results came from the desktop, not a phone. See [engine details](stage-engine.md).

Removal checks covered the extracted map panel on a fixture, not a real adventure turn. Fifteen production-compatible Playwright cases passed. The admin test passed separately in development, while production redirected to the missing sign-in route.

Convex production deployment to `marvelous-mink-850` shipped the ledger argument change and removed old visit indexes. The separate prototype repo/site was published. This does not establish deployment of later frontend commits.

Old local branches `2d-maps`, `minimap-claude`, and `claude/competent-moore-d09a8e`, plus remote `origin/claude/stoic-gates`, were retired. Remote asset and temporary-project cleanup remained separate work.

## 2026-09-15, static homepage

The homepage became a static public shell with personalized welcome and token data loaded through private APIs. It bypasses Clerk middleware. Clerk's cookie-only cache action was verified separately.

Recorded validation: production build, TypeScript, lint, 15 production-compatible Playwright cases, and authenticated browser checks on an isolated Convex project. Public responses had cache hits and no Clerk auth headers. Temporary test adventures were removed.

The feature merged in `46a0cfc`. No production deployment occurred in that session. The temporary Convex project still had a deletion reminder.

## 2026-08-31, public rendering

Removed request-wide visit tracking, root-layout request reads, and broad Clerk matching. Public content routes became static. The homepage remained dynamic at this point and was subsequently changed on September 15.

Recorded validation: build, TypeScript, lint, eight Playwright cases, and cache/header checks passed. The top-level test wrapper still waited on unused TCP port 4000.

## 2026-08-25, adventure listing

Explicitly included Realm of Myr source files in Next.js output traces. Replaced positional adventure curation with one grid and independent loading, so one invalid adventure does not hide the others.

Recorded production S3 audit: three adventures lacked source, and March of Davos had incomplete source. All four used repo fallback. The focused production build carried 201 source files, and browser verification showed four working adventure cards.

## 2026-07-06, live content changes

Changed live turn advancement to re-pin content provenance when the authored source changes. Current turn/encounter guards still reject concurrent stale advances. This superseded the earlier strict content-hash rejection.

## 2026-07-05, layout and narration

Merged the responsive character/narrative/right-rail layout and Storyview v1. Narration used stable voices, cached audio, and generation claims. The original browser check covered playback, replay, and concurrent requests. Later code added automatic generation, shared charging, and incremental paragraph reuse.

## 2026-07-03, Mapview

Merged Mapview v1, including the SVG catalog, admin generation, stored per-encounter maps, and player fullscreen view. Recorded a fresh-player Midnight Summons playthrough covering its seven encounters.

Visual guarantees such as connected paths and tree density belong in code. The model prompt alone was insufficient. NPC staging must match the intro, with explicit `startNear` and stored token replacement after changes.

## 2026-06-12, wiki cutover and worktrees

Completed the registered-adventure discovery and gameplay cutover. Kept legacy remote plan JSON as a fallback instead of deleting it. Reconciled richer March of Davos production source into the repo, then cleared its adventure source prefix so runtime used the complete repo source. Setting-level residue was recorded for later review.

Cutover deployment was recorded for Convex production and frontend main `3857148`. Immutable artifact rollback was tested in memory. Live content re-pinning later changed the gameplay behavior, as recorded above.

Added the [worktree workflow](plans/parallel-dev-worktrees.md): one isolated Convex project per branch, Portless URLs, shared S3/Clerk, and no-ff merges.

## 2026-06-11, release hardening

Implemented pre-write validation for admin source changes, complete-source fallback, canonical admin routes, and formatting cleanup for that baseline.

Authenticated Midnight Summons playthrough reached completion, including rolls and encounter transitions. Covert Cargo reached a live transition in practice mode, not a full recorded completion. Browser testing exposed and fixed legacy-plan reads and solo redirect handling that bridge tests missed.

Converted the maintained wiki from HTML to Markdown.

## 2026-05, wiki foundations

Established authored markdown encounters, JSON character sheets, compiled runtime artifacts, Convex live adventure state, validated change sets, revision restore, and AI-assisted editing.

Migrated all four Myr adventures and replaced the legacy plan editor with chat and key-field editing. Chat changes apply directly through validated canonical writes. New community-adventure creation remained deferred.
