# Desktop Stageview integration

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md)

Status: Implemented locally, 2026-10-02. Owner requested the 3D interface in the desktop app connected to the real turn flow. Branch `feature/desktop-stage-play` includes the committed GM core branch. No merge into main or deployment.

## Scope

Build `apps/desktop` using the extracted GM core and the existing Stageview renderer and cinematic components. Start with the authored March of Davos adventure and the Kordavos gate set. Local CLI generation must drive replies, roll requirements, dice resolution, NPC turns, and advancement. Preserve real state between launches. Render later encounters honestly when no authored 3D set exists. Keep the web demo and spike intact.

Use an isolated worktree based on main plus the committed GM core branch. No production mutations, shared auth changes, push, or merge into main. Reuse the tested local CLI adapters. Do not create new scripted gameplay outcomes.

## Implementation

- Extract the unchanged renderer to `packages/stage` for both web and desktop consumers.
- Add the desktop workspace, native bridge, bundled authored content, and local persistence.
- Wire GM core ports and turn commands with serialized operations, retry/error handling, and resumable state.
- Port the 3D HUD, journal, camera controls, character focus, and dice to real state.
- Verify deterministic turn/store boundaries, browser UI, native build, and a live CLI turn.
- Record actual results and limits, then commit locally.

## Validation

Use two Rust build jobs because this Mac has 8 GB RAM. Check types, scoped lint, local state and transition tests, frontend build, native build, and the running native webview. Confirm actions and dice update saved state and survive restart. Do not claim that all adventures have 3D sets or that this is a signed distribution.

## Results

- Added `apps/desktop`, `pnpm desktop:dev`, and `pnpm desktop:build`. The bundle carries local content, renderer assets, fonts, and the Node runtime. Node 24+ and an installed, signed-in AI CLI remain external requirements.
- Shared `packages/stage` serves web and desktop. Same-origin image loading works in WKWebView. The desktop uses real turn order, narration, action input, dice, journal, character focus, cameras, and clamped action movement. Later encounters use story view with the same turn controls.
- SQLite commits accepted milestones, holds a process lease, rejects stale input and illegal transitions, and saves a natural die before generation. Failed inference returns the durable checkpoint. Strict nested world-state validation uses the tested CLI adapters.
- Three integration tests cover start/reopen, cross-instance ownership, duplicate/stale input, dice retry retention, and core advancement with durable summary/discoveries. Root, desktop, and renderer TypeScript checks passed. Scoped Biome, Rust formatting/Clippy, renderer content checks, frontend build, and a macOS release bundle passed. The Next production build passed with the existing missing SendGrid configuration warning.
- In the packaged native app, Claude generated a Persuasion DC 13 check for Branka's fee-waiver request. A natural 2 failed and stayed saved. Yeva paid the group fee, Milos waited, Garlan responded, and Cassia explained her business. The real core advanced to The Harvest Festival with its authored NPC roster. Reopening restored that turn. Native renderer reporting recorded ready state with no JavaScript errors.
- Browser verification covered renderer loading, with no browser console errors. Game commands require native IPC, so the browser check was not a gameplay test. The native test above covered the actual bridge and local save.
- The native test save was preserved as `~/Library/Application Support/com.d20adventures.desktop/validation-desktop-stage-2026-10-02.sqlite`. The app was returned to a fresh starting screen. Movement waits for completed actions and leaves failed checks in place.

## Remaining scope

One local slot and four premade player-controlled characters. The gate is the only authored 3D set. Add further sets, character creation, AI companions, save management, narration audio, and multiplayer separately. Character patches are retained with existing core semantics, not applied as inventory/effect updates. Native combat and the other providers were not tested in this playthrough. The five-call batching experiment remains separate. Distribution still needs Node packaging or onboarding, signing, notarization, and an updater.

The worktree's isolated Convex project is `d20adventures-feature-desktop-stage-play`, deployment `adamant-hawk-913`. Desktop gameplay does not use it. Remove that project after the worktree is retired. Runtime details and commands are in [the desktop README](../../apps/desktop/README.md).
