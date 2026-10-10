# Desktop host mode

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop local play](desktop-local-play.md) · [Desktop home screen](zzz-completed/feature-desktop-home.md) · [Adventure store](feature-adventure-store.md)

Status: Merged into main 2026-10-10, not shipped. Paused 2026-10-08, resumed 2026-10-10. The app's hosting screens are untested in the running app. Convex lockdown not started.

## Goal

One player's desktop app runs the GM through their own CLI for the whole party. Friends join from a browser, with no CLI and no install. Free. Decided 2026-10-07 in [Desktop local play](desktop-local-play.md).

## Owner decisions, 2026-10-08

- No home Wi-Fi mode. Friends join through the website. This replaces "home Wi-Fi first, then a website relay".
- The host's copy of an adventure covers the table. Guests need not own it.
- Guests make characters with the website's existing character creation.
- Guests see the stage-first 3D play view on the website, built before host mode ships. Not today's text turn page.

## Current state

- Each game command spawns a short-lived Node process (`src-tauri/resources/runtime.cjs`) behind a Rust mutex. There is no long-lived server and no networking crate.
- Local saves hard-code `ownerId` and `playerIds` to `local-player` (`apps/desktop/runtime/game.ts`).
- GM core already enforces per-character control for several players (`packages/gm-core/src/access.ts`), from the web app's multiplayer.
- The play UI talks to the runtime only through `apps/desktop/src/bridge.ts`.
- The website already has multiplayer: an invite link to the adventure lobby, character pick or creation (`characters/<userId>/` in S3, `pcTemplateSchema`), and `joinAdventure` (`app/_actions/join-adventure.ts`, `convex/adventure.ts`).
- Web turns run the GM in Next server actions with Gemini and charge the acting player's tokens (`lib/gm-server/`). Clients get turns over SSE that polls Convex every 2 s (`app/api/adventure/stream/[adventureId]`).
- Desktop device tokens authenticate only `app/api/desktop/*` routes. Adventure and turn Convex mutations are public, recorded in [Maintenance](maintenance.md).
- Stageview is not on the web. Guests would see today's text turn page.

## Proposed design

A hosted game is an ordinary website adventure whose GM work runs on the host's desktop app instead of the server.

- **Hosting**: from the desktop home screen, the host picks an adventure and hosts it. The app creates the website adventure through a device-token route and shows the invite link.
- **Joining**: guests use the existing lobby link, sign in, pick or create a character, and join. No join token is charged for a hosted game.
- **GM work**: when a guest acts, the website records the action as a GM job instead of calling Gemini. While hosting, the desktop app polls for jobs and runs gm-core through the host's CLI, against a website-backed `Store` adapter. No tokens are charged.
- **Host's seat**: the host plays from the desktop app's Stageview through the same routes. Stage-only state (positions, movement, figures) is kept with the hosted adventure.
- **Guests' view**: the desktop app's stage-first play view, built for the website with a website-backed bridge. Turn updates arrive over the existing SSE stream.
- **Host away**: the game waits. Guests see that the host's GM is offline.
- **Home screen**: hosted games appear under Your adventures. Games the linked account joined as a guest appear too and open on the website.

## Phases

1. Website: a hosted flag on adventures, device-token host routes (create, store operations, job queue), server actions that queue GM work for hosted games, and no token charges for them.
1. Website: the stage-first play view for guests, shared with the desktop app's play UI.
2. Desktop: a host worker while hosting, the website `Store` adapter, the host's own turns, and the invite link.
3. Home screen: hosted and joined games in Your adventures.
4. Ship gate: provider terms, below.

## Build steps

- [x] Convex: a `host` field on adventures, and a `gmJobs` queue answered only by the Next server (`convex/hosting.ts`).
- [x] Website: device-token host routes to create, list, start and read hosted games, queue the host's actions, claim and finish jobs, and run `Store` operations on the host's own games (`app/api/desktop/host/`, `lib/host/server.ts`).
- [x] Website: guest actions for hosted games queue jobs (`app/_actions/hosted.ts`). The server's GM actions refuse hosted games, `ensureNpcProcessed` skips them, and joining one costs no tokens.
- [x] Desktop: a host worker process (`runtime/host.ts`, `host-main.ts`, bundled as `host.cjs`) with a website `Store`, the host's CLI, and the adventure packs. Rust starts and stops it and keeps its last status.
- [x] Desktop: Host online on party setup, the invite lobby, hosted play through the shared play view, and hosted games on home.
- [x] Website: the stage-first play page for guests at `/play/[adventureId]`. The play view is shared with the app (`apps/desktop/src/stage-play.tsx`). Lobby and turn pages send hosted games there.
- [ ] Convex: lock down public adventure and turn functions.

## Validation, 2026-10-08

- Desktop runtime: 44 tests, including four for the host worker: a guest's reply and roll, refused jobs that leave the game unchanged, advancing an encounter, and the website store.
- End to end against the dev server and dev Convex: the app's routes hosted Covert Cargo with a premade, a test guest joined, the host started it, and the host could not act for the guest's hero. The bundled `host.cjs` worker ran the host's reply through Claude, and the turn saved on the website.
- The guest page rendered the 3D scene in Chrome for the signed-in test user. The Clerk proxy now covers `/play`.
- Not yet exercised: the app's own Host online, lobby and hosted play screens in the running app. They typecheck and share the tested routes and play view.

## Known gaps

- Hosted games keep no stage positions, so movement is not read or walked.
- The journal shows only the current turn.
- No AI companions in hosted parties yet.
- The app's home does not yet list games the account joined as a guest.

## Open decisions

- Locking down the public Convex adventure and turn mutations before hosted games ship. Proposed: yes, as phase 1 work.
- Relay cost ceiling per hosted game.
- Host mode under provider terms. A party driving one account stretches "ordinary, individual usage". Ask Anthropic before shipping.

## Security

- Guests act only for their own character.
- Guests get no access to the host's files, CLI, or account. The device token stays in the host's Keychain.
