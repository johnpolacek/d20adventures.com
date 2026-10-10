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
- 2026-10-10: party setup always shows Invite players for adventures with more than one seat. Unlinked or offline, it starts linking first. The header shows Link account in place of Account offline. Host online was hidden until linked, so the owner found no way to invite.
- 2026-10-10: the production website cannot host yet. `/api/desktop/host` returns 404, and `/api/desktop/link` and `/api/desktop/me` return 500, so the app shows Account offline. Production needs the current website and Convex deployed.
- 2026-10-10: `pnpm dev` starts Convex, the website, and the app with `D20_SITE_URL` set to the local website, so linking and hosting can be tested without production. Invite links from that app are localhost links. `pnpm desktop:dev` still targets d20adventures.com.

## Invite seats, 2026-10-10

Owner, at party setup with Lyra and Poppen seated: "i want to be able to invite another player to play as poppen from this screen". Chosen: a per-seat Invite choice, a link that joins as that hero, and no AI companions in hosted games yet.

### Design

- Party setup: each seat is You, AI, or Invite. Invite shows for adventures with more than one seat.
- With any seat on Invite, the main button reads Invite and hosts the game. The separate Invite players button is gone.
- An invited game needs exactly one You seat and no AI seats. Otherwise the button is off and one line says why.
- Unlinked or offline, Invite starts linking first, as before.
- The website holds each invited hero for a guest: `host.seats` on the adventure, with the hero's id and name. A roster hero's sheet is saved to the host's account and the seat carries its key.
- Each seat has its own link, the lobby link with `?as=<hero id>`. The app's lobby lists each open seat with its link and Copy.
- On the website, a guest with that link signs in and sees one card, Join as that hero. Without `as`, they see every open seat.
- In a game with seats, guests join only as a held hero. Their own characters and the other premades are not offered. `joinAdventure` in Convex refuses any other hero, and a hero already taken.

### Built, 2026-10-10

- App: `new-game.tsx` seats, `hosted-lobby.tsx` seat links, `hostCreate` with `invites`.
- Website: `host.seats` in the schema, `lib/host/seats.ts`, the join action and `joinAdventure`, and the lobby's held-seat view.
- Party rows are one column where Invite shows. Three choices left no room for the names in two.
- Found while checking: the lobby page returned 404 to anyone not already in the game, signed in or not, so no invite link opened. `loadAdventureWithNpc` asks for a player. `loadAdventureLobby` now loads a game still waiting for players for anyone with its link. The lobby's polling route answers a signed-in guest the same way.
- Found while checking: a guest waiting in the lobby stayed there when the host started, and would have seen the text turn view. The lobby of a hosted game now leaves for `/play/<id>` when the first turn arrives.
- The website lobby still shows Start Adventure to any seated player, guests included. It starts a hosted game the same way the app does.

### Checked, 2026-10-10

- In the running app against the local website and dev Convex: Covert Cargo with Lyra on You and Poppen on Invite. Invite hosted the game and the lobby showed one link for Poppen.
- In a browser as the test user: signed out, the link showed the party and the sign-in prompt. Signed in, it showed one card, Play as Poppen Quickfoot. Join seated Poppen, and the app's lobby listed both heroes with no link left.
- Start in the app moved the guest's browser to `/play/<id>`, which showed Poppen's turn and "Hosted · GM online".
- 49 desktop tests and 12 store, link, and seat tests pass. Both typechecks pass.
- Not checked: a roster hero as an invited seat, more than one invited seat, a second guest trying a taken seat, the amber note for an AI seat beside an invited one, and any turn played by the guest.
- That test game is still in dev Convex, hosted by the owner's account with the test user as Poppen.

### Contradiction

- 2026-10-08: "Guests make characters with the website's existing character creation." Held seats do not allow that.
- The website still supports a hosted game without seats, where guests bring any character. The app no longer has a way to start one.
- Open: whether a seat can be held for "any hero".

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
