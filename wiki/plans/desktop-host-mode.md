# Desktop host mode

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop local play](desktop-local-play.md) · [Desktop home screen](feature-desktop-home.md) · [Adventure store](feature-adventure-store.md)

Status: Planned 2026-10-08. Owner asked to start it alongside the [home screen](feature-desktop-home.md), which lists hosted and joined games. Not started.

## Goal

One player's desktop app runs the GM through their own CLI for the whole party. Friends join from a browser, with no CLI and no install. Free. Home Wi-Fi first, then a website relay for remote friends. Decided 2026-10-07 in [Desktop local play](desktop-local-play.md).

## Current state

- Each game command spawns a short-lived Node process (`src-tauri/resources/runtime.cjs`) behind a Rust mutex. There is no long-lived server and no networking crate.
- Local saves hard-code `ownerId` and `playerIds` to `local-player` (`apps/desktop/runtime/game.ts`).
- GM core already enforces per-character control for several players (`packages/gm-core/src/access.ts`), from the web app's multiplayer.
- The play UI talks to the runtime only through `apps/desktop/src/bridge.ts`, which makes a browser bridge possible.

## Proposed design

- **Host**: from the home screen, host a new or saved adventure. The app starts a long-lived runtime process that serves HTTP on the local network and runs every game command for the session, the host's included.
- **Invite**: a URL with a join token, shown as text and a QR code. Stopping the host or quitting the app closes it.
- **Guests**: open the URL in a browser, give a name, and take an open seat. A seat is a party member the AI plays until someone claims it.
- **Guest client**: a browser build of the desktop play UI with an HTTP bridge, served by the host. Stage assets come from the host over the local network.
- **Turns**: guests act only for their seat. State updates reach every client over server-sent events.
- **Desktop as guest**: the home screen can join a game too. Joined games appear under Your adventures while the host is online.
- **Relay**: the host connects out to the website, and guests connect there. Transport is open (Convex tables or a WebSocket service).

## Phases

1. Long-lived host runtime, local network server, invite, browser guest client, seat claiming.
2. Desktop join, and hosted and joined games on the home screen.
3. Website relay for remote friends.
4. Ship gate: provider terms, below.

## Open decisions

- Guest identity on the local network: a name only, or a linked website account. Proposed: a name only, with accounts required for the relay.
- Whether guests must own a paid adventure. Proposed: no, the host's copy covers the table, as with a printed module.
- Guest heroes: premade and AI seats only, or hero creation in the browser through the host's CLI.
- Relay transport and cost ceiling.
- Host mode under provider terms. A party driving one account stretches "ordinary, individual usage". Ask Anthropic before shipping.

## Security

- Bind to the local network only, require the join token on every request, and accept only game actions for the guest's own seat.
- The guest client gets no file, CLI, or account access. The device token stays in the host's Keychain.
