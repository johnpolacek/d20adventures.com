# Desktop host mode

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop local play](desktop-local-play.md) · [Adventure store](feature-adventure-store.md)

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
- That test game was removed from dev Convex later the same day, with the owner's other dev adventures.

### Contradiction

- 2026-10-08: "Guests make characters with the website's existing character creation." Held seats do not allow that.
- The website still supports a hosted game without seats, where guests bring any character. The app no longer has a way to start one.
- Settled 2026-10-10 by the any hero seat below.

## Any hero seat, 2026-10-10

Owner: an "any hero" seat, "if allowed on the adventure, host has right to approve or reject with note".

### Design

- Allowed where the adventure takes custom heroes, which is `availableCharacterOptions` in its manifest. March of Davos and The Road to Kordavos do. Covert Cargo and The Midnight Summons do not.
- Party setup: an Any hero tile beside New hero adds a seat for a guest's own hero. It counts toward the party size and is always an invited seat.
- The website keeps the count as `host.open`, and guests' requests as `host.requests`: who asks, their hero's key, name, race and class, the status, and the host's note.
- A guest with the link signs in and asks to join with one of their own heroes, or makes one first. One request per guest. Asking again replaces it.
- The host's lobby in the app lists each request with Approve and Reject. Reject takes an optional note.
- Approve seats the hero. Reject keeps the request with its note, which the guest sees, and they may ask again with another hero.
- A game with held or open seats refuses a direct join by any other hero, so approval cannot be skipped.
- The open seats share one link, the lobby link with `?as=any`.

### Built and checked, 2026-10-10

- App: the Any hero tile and seat in `new-game.tsx`, requests with Approve and Reject in `hosted-lobby.tsx`, `hostCreate` with `open`, and `hostAnswer`.
- Website: `host.open` and `host.requests` in the schema, `requestSeat` and `answerSeat` in `convex/hosting.ts`, the `requestSeat` action, the answer on `POST /api/desktop/host/<id>`, and the lobby's own-hero view. The lobby's poll carries the open seats and the guest's request.
- The website lobby shows only the host's seats in a game with seats for guests, not the adventure's maximum.
- A note goes with a rejection only. Approval has none.
- The host sees the hero's name, race, class, and the guest's username. Not the sheet.
- The website does not check a guest's hero against the adventure's allowed races and classes. The host decides.
- Checked in the running app against the local website and dev Convex, with March of Davos: Branka on You, Cassia on Invite, and one Any hero seat. The lobby showed a link for Cassia and one for any hero.
- As the test user with the any hero link: the guest's own heroes showed with Ask to join. A hero already at the table was refused with a message. A request showed in the app as Thora Battlehammer, Dwarf Cleric, d20playtest.
- Reject in the app showed the guest "The host declined Thora Battlehammer." A rejection with a note, sent straight to Convex, showed the note. Approve seated Thalbern, the app listed both heroes, and the any hero link went away.
- Not checked: typing a note in the app's field, two open seats, a guest making a new hero from the lobby, and Choose another hero while waiting.
- No tests were added. Owner prefers throwaway checks.
- That March of Davos test game was removed from dev Convex later the same day.

## Auto-approve and hero sheets, 2026-10-10

Owner: "let's also have auto-approve be the default", with the host able to open a guest's hero sheet.

- An any hero seat seats the guest's hero at once by default. `host.approve` on the adventure turns on the host's approval, set in party setup as Ask me beside Auto-approve. One setting covers every open seat of the game.
- The guest's button reads Join when seats are automatic, and Ask to join when the host approves.
- The app's lobby opens a guest's sheet from a request and from a guest at the table: attributes, appearance, background, skills, abilities, spells, and equipment. No portrait, since the app's content policy allows no remote images.
- A guest seated while their lobby page was open, by approval or at once, loads the page again as a player. The turn stream answers players only, so without this they would miss the start.
- Not built: changing the setting from the lobby.

### Removing a guest, 2026-10-10

Owner chose Remove for a seated guest, since automatic seating needs a way to undo a seat.

- In the app's lobby each guest at the table has Remove, with an optional note. It works before the game starts.
- Removing frees the seat. A held hero's link shows again, and an open seat opens again.
- The guest sees "The host removed" with the hero's name and the note.
- `host.removed` lists the guests the host removed. Such a guest cannot take a held seat, and their next request for an open seat waits for the host even when seats are automatic. Otherwise they could sit straight back down.
- A guest removed while their lobby page is open loads it again as a guest.
- Checked in the running app, 2026-10-10, on the auto-approve test game: Remove took Thora from the table and reopened the seat. The guest's open page changed to "The host removed Thora Battlehammer." with Ask to join on their heroes. Asking again waited as a request, and Approve seated her.
- A removal with a note, sent straight to Convex on the Ask me test game, showed the guest the note.
- Not checked: removing a guest from a held seat, and typing the note in the app's field.

### Checked, 2026-10-10

- In the running app against the local website and dev Convex, with March of Davos and two any hero seats.
- Default: the seats showed Auto-approve chosen. The guest's buttons read Join. Join seated Thora at once, and the guest's page loaded again as a player.
- The app's lobby read "auto-approve", listed Thora at the table with Sheet, and Sheet showed her attributes, appearance, background, personality, motivation, skills, abilities, spells, and equipment.
- Ask me: the guest's buttons read Ask to join. The request showed in the app with Sheet, Reject, and Approve. Sheet showed Thalbern's sheet under the request.
- Approve seated Thalbern, and the guest's page loaded again as a player without being touched.
- Not checked: Start after an approval, and a guest whose sheet cannot be read.
- The two March of Davos test games were removed from dev Convex later the same day.

## Guests choose first, 2026-10-10

Owner, at Covert Cargo's party setup with Lyra on You and Poppen on Invite: "there does not seem to be a way to invite a player to be either character in this screen."

### Cause

- The only You seat could not switch to Invite, so one hero always stayed with the host.
- Covert Cargo takes its own heroes only, so it has no Any hero seat either.

### Design

- Party setup: the last You seat can switch to Invite when another hero is already invited.
- With every hero on Invite, guests choose first and the host plays the hero left. One line under the party says so.
- It needs at least two invited heroes and no AI heroes.
- The website keeps it as `host.pick`. Every hero is a held seat and the host has no hero in `players` until the game starts.
- Guests take any held seat but the last one. That one is the host's.
- Start seats the host as the first held hero nobody chose, then makes the first turn. Start from the website lobby does the same.
- The app's lobby shows one link, the plain lobby link, and the host's row reads the hero left once only one is.

### Built and checked, 2026-10-10

- App: the last You seat's Invite in `new-game.tsx`, the line "Your guest chooses a hero. You play the other.", `hostCreate` without a character, and the lobby's one link and host row in `hosted-lobby.tsx`.
- Website: `host.pick` in the schema, `seatHost` in `convex/hosting.ts` and `lib/host/server.ts`, the last seat rule in `joinAdventure`, and `keep` on the lobby's seats.
- Checked in the running app against the local website and dev Convex, with Covert Cargo and both heroes on Invite.
- The app's lobby showed "Invite · Guest's choice · 1 open" with one link, and "You play the hero left".
- As the test user with that link: Choose your hero showed Lyra and Poppen. Join as Lyra seated them.
- The app then listed Poppen Quickfoot for the host and Lyra with Sheet and Remove. The link went away.
- A second guest asking for Poppen was refused: "Every seat at this table is taken".
- Start seated the host as Poppen, made turn 1 with both heroes, and moved the guest to the play page.
- Not checked: three or more invited heroes, a roster hero left for the host, Start before any guest joins, and Start from the website lobby.
- Seen then: a seated guest's website lobby showed the host's seat as Empty and read "Waiting for more players". Fixed below.
- The test game was removed from dev Convex afterward. No tests were added.

### Guest plays, 2026-10-10

Owner, on the same screen with Lyra on You and Poppen on Invite: "I want to invite a player to do either player for this adventure but that is not clear it is possible to do from this screen".

- Setting both seats to Invite was the only way in, and nothing said so.
- Party setup now shows a choice under the party once a hero is invited: Guest plays, then the invited hero's name, or Either hero.
- Either hero puts every hero on Invite and adds "You play the other." The named choice gives the player their hero back.
- With more than two heroes the choices read Invited heroes and Their choice.
- It is hidden while a hero is on AI, since an invited game takes none yet.
- The line by the Invite button is gone. The choice carries it.
- Checked in the running app with Covert Cargo, by reading each control's pressed state: Either hero set both rows to Invite with Invite enabled, and Poppen Quickfoot set Lyra back to You.
- Not checked: three or more heroes, and the look in the foreground. The window was covered, so captures showed stale highlights.

### The guest's lobby waits for the host, 2026-10-10

Owner chose both follow-ups.

- The website lobby shows the host's seat where the host plays the hero left. It reads "Host, Plays the hero left", then that hero with a Host tag once one hero is left.
- In a hosted game, a seated guest sees "Waiting for the host to start..." in place of Start Adventure. The host still sees Start Adventure.
- The `startAdventure` action refuses anyone but the host in a hosted game. It had no check before.
- Checked on the local website with a throwaway hosted game in dev Convex, as the test user: the Host seat before joining, Poppen with the Host tag after joining as Lyra, the waiting line, and no Start button.
- Not checked: the action's refusal itself, since no button reaches it now, and the host's own view of the website lobby.
- A seated guest no longer gets the Invite Players box in a hosted game. Only the host invites, from the app. Checked the same way.
- The throwaway game was removed afterward.

## Host watches, 2026-10-11

Owner: "can we make it possible for me to invite a different player to play the solo adventure and just watch?"

### Cause

- Invite showed only for adventures with more than one seat.
- A hosted game needed a hero for the host, or two invited heroes with the host on the one left.

### Design

- Party setup: Invite shows on every adventure. A party of one hero can be invited, and the host watches.
- The same holds for a party of one Any hero seat, where the adventure takes custom heroes.
- One line under the party says the host watches.
- The website gets `watch` with the new game. The host has no hero in `players` and `host.pick` is off. Nothing new is stored: a host with no hero and no `pick` is watching.
- The host stays in `playerIds`, as before a guests-choose game starts.
- Start is refused until a guest is seated.
- The app's lobby shows "You watch" at the table. In play every hero's turn reads Waiting for that hero, and the host can still continue NPC turns.

### Built and checked, 2026-10-11

- App: Invite on every adventure and the watching party in `new-game.tsx`, `hostCreate` with `watch`, "You watch" and the held Start in `hosted-lobby.tsx`, and "Hosting · watching" in play.
- Website: `watch` on `POST /api/desktop/host` and `createHostedAdventure`, `hostWatches` in `lib/host/seats.ts`, `watching` in the summary, and the refusal in `seatHost`.
- Checked against the local website and dev Convex, with a device linked to the test user as host and The Midnight Summons.
- No hero and one invite without `watch` was refused as before. `watch` with nothing invited was refused: "Invite a hero to watch them play."
- `watch` with Thalbern invited made the game: no players, one held seat with its link, `watching` true.
- Start with nobody seated was refused: "Nobody has joined yet." The game stayed in its lobby.
- A signed-out visitor to the link saw the game, one empty slot, and the sign-in prompt.
- With a guest seated, Start made turn 1 with Thalbern alone, the guest's. The host was refused acting for Thalbern.
- The play page as the host showed "Thalbern's turn", "Waiting for Thalbern", and no reply box. The app shares that view.
- The guest was a stand-in seated straight through Convex, since the check had one test account. The join page itself is unchanged from the invite seat work.
- Not checked: party setup, the lobby, and play in the running app. Computer use was unavailable. Also not checked: a real guest joining, a turn played while the host watches, and a lone Any hero seat.
- Both typechecks and 47 desktop runtime tests pass. No tests were added.
- The throwaway game, the test device, and the browser were removed afterward.
- The lobby on the website does not tell a guest that the host watches.

## Table chat, 2026-10-11

Owner: "Do we have chat working so the participants in the session can chat?" It was not. Owner chose chat in the play view and in both lobbies.

### Before

- The website's text turn page and its lobby had chat, for adventures with more than one seat: `chat_messages` in Convex, `sendChatMessage`, and a stream route.
- The stage play view had a Table chat tab in the journal, fed an empty list, with no way to send.
- The app had no route to chat. Sending needed a website sign-in.

### Design

- One chat per game, in the existing `chat_messages`. Lobby and play share it.
- Both state polls carry the latest 50 lines: `GET /api/hosted/<id>` for guests and `GET /api/desktop/host/<id>` for the app.
- Guests send through a server action. The app sends through `hostChat`, a `chat` action on `POST /api/desktop/host/<id>`.
- The server names the sender: their username, then their hero's name when they have one.
- Play view: a Chat button beside Journal opens the journal on Table chat, with a box to send. It counts lines that arrived since the chat was last open.
- App lobby: Table chat under the table, with a box to send.
- Website lobby: the existing chat button shows for a seated guest of any hosted game, one-seat games included.
- The app offers chat only where the website's state carries it, so an older website shows none.

### Built and checked, 2026-10-11

- Website: `lib/host/chat.ts`, `chat` on both state routes, the `chat` action on the host route, `sendHostedChat`, and the lobby's chat button for hosted games.
- Shared play view: the Chat button and its count in `stage-play.tsx`, and the live tab with its box in `components/stage/journal.tsx`.
- App: `hostChat`, and Table chat in `hosted-lobby.tsx`.
- Checked against the local website and dev Convex, with a device linked to the test user as host of The Midnight Summons.
- The app's route took a line and refused an empty one. State carried the chat, named "d20playtest · Thalbern".
- The website lobby of that one-seat game showed Chat, the app's line in it, and sent a line back.
- The play page showed Chat beside Journal. A new line made it "Chat · 1". Opening it showed every line at the newest, and cleared the count.
- A line arriving with the chat open showed without a count. One arriving with the story open counted.
- Sending from the box added the line and emptied the box.
- Not checked: the app's lobby chat and the app's own play view. Computer use was unavailable. They share the routes and the view checked here. Also not checked: two different accounts talking.
- Both typechecks and 47 desktop runtime tests pass. No tests were added.

### Found: guests could not act from the website

- Sending chat from the play page failed with "HostedAction is not defined". So did a guest's reply.
- `app/_actions/hosted.ts` re-exported a type. In a server actions file that broke every action in it at run time.
- So no website guest could reply, roll, or continue since the play page was built on 2026-10-08. No guest turn had been played before.
- Fixed by dropping the re-export. Nothing imported it.
- Checked after the fix: the guest's reply queued, the bundled `host.cjs` worker ran it through Claude, and the GM asked for a Perception roll.
- The guest rolled on the page, the worker resolved it, and the page showed the roll and the new narration. That is a guest's first full turn through the website.
- Seen then: headless Chromium has no WebGL, and the play page crashed when the roll prompt came up. The die makes its own renderer with no fallback. The scene itself falls back to story view.
- The throwaway game, the test device, and the browsers were removed afterward.

## Suggested replies, 2026-10-11

The host's GM writes each player's suggested replies as a `suggest` job. See Suggested replies.

## Turns that need no player, 2026-10-11

Owner, after local play stopped asking for "Continue NPC turn": the host's app should run these turns itself in a hosted game.

### Design

- **The worker queues its own Continue.** After a job that changed the game, it looks at who is up. An NPC, an AI hero, or nobody once the round is done: it queues a `continue` job before reporting the first job done, so no screen sees the game waiting.
- **Continue also ends the round.** A `continue` job runs the NPCs and AI heroes, then advances the turn if nobody is left, as local play does. Before, the round's end was a second job.
- **Once per character.** Each is queued once. A job that fails queues nothing, so the Continue button stays on every screen to retry.
- **A player must be left.** With no living hero played by a person, nothing is queued, so a game cannot play itself on the host's AI.
- **Start and reopen.** Starting the game queues the opening turn if an NPC or AI hero has it. A worker that goes idle checks once, which covers reopening the app.
- **Reading is not interrupted.** Narration that arrives while a player is still reading an earlier paragraph no longer jumps them forward. This holds in every game, and is what lets the GM run ahead.

### Built and checked, 2026-10-11

- `apps/desktop/runtime/host.ts`: `selfRunning` decides, `hostLoop` queues, and `continue` ends the round. `host-commands.ts` queues the opening turn on start. `apps/desktop/src/stage-play.tsx` holds the reader's place.
- Runtime tests: after a guest's skip the worker queues one Continue for an AI hero. When it fails it is not queued again. A new worker takes the turn up, plays the hero, and ends the round in one job. Nothing is queued while a player is up, or with no living hero played by a person.
- 53 desktop runtime tests, the desktop and website type checks, and Biome pass.
- Not checked: a hosted game end to end with the website and a real GM, the reader's place holding on a live page, and the opening turn after Start.
- The Continue button remains on every screen for a turn the GM could not finish, or while the host's app is offline.

## Known gaps

- Hosted games keep no stage positions, so movement is not read or walked.
- The journal shows only the current turn.
- No AI companions in hosted parties yet.
- A browser without WebGL crashes at a roll prompt, since the die has no fallback.
- The play view's chat shows the latest 50 lines, with no way to load older ones.
- The app's home does not yet list games the account joined as a guest.

## Host plays from a phone, 2026-10-23

Owner: the host hosts on the laptop, then plays as a player from the website on their phone. Signing in is enough, no QR code.

- Supported as is. The host's linked account is in `playerIds`, so the player page lists the game, and `queueHostedAction` takes any seated player.
- Fixed: the website lobby held the host's Start Adventure to the adventure's minimum party, "2/3 minimum" for Covert Cargo. A hosted game now starts with any hero seated, as in the app.
- Checked against the local website and dev Convex at 390 by 844, with the bundled `host.cjs` worker standing in for the app, Claude as GM, and a second test account, `d20guest`, as the new player.
- The guest joined Poppen from the seat link. The host found Covert Cargo under Your Adventures on the player page, opened its lobby, and started.
- Both phones moved to `/play/<id>`. The host sent Lyra's reply, the guest sent Poppen's, the worker ran both and two NPC continues, and both phones reached Lyra's turn again.
- One reply failed when the website's call to Convex timed out. The phone showed "The website answered 500." and sending again worked.
- Seen: the stage play view in portrait overlaps the header, the party strip, and the narration card. The rotate prompt from Stageview's landscape decision was wired only into `/dev/turn`. `/play` now shows it to a phone held upright, and asks Android for fullscreen landscape on the first tap.
- Checked: the rotate prompt on `/play` at 390 by 664 with a coarse pointer faked through `matchMedia`. Not checked on a real phone.
- The home page's Welcome Back card leads to the game with Continue. It loads after the page, about 4 s in dev.
- Not checked: the app's own play view while the host acts from the phone, and a roll on the phone.

## Open decisions

- Locking down the public Convex adventure and turn mutations before hosted games ship. Proposed: yes, as phase 1 work.
- Relay cost ceiling per hosted game.
- Host mode under provider terms. A party driving one account stretches "ordinary, individual usage". Ask Anthropic before shipping.

## Security

- Guests act only for their own character.
- Guests get no access to the host's files, CLI, or account. The device token stays in the host's Keychain.
