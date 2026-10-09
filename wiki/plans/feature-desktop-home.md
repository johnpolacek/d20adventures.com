# Desktop home screen

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop local play](desktop-local-play.md) · [Host mode](desktop-host-mode.md) · [Adventure store](feature-adventure-store.md)

Status: Active (2026-10-08) on `feature/desktop-home`.

## Goal

The desktop app opens on a general home screen instead of the current save's title screen. From it the player continues or resumes any adventure, starts a new one, manages heroes, and reads about the Realm of Myr. Hosted and joined games join the same adventure list when [host mode](desktop-host-mode.md) lands.

## Owner decisions, 2026-10-08

- Layout: library shelves. A Continue banner over the live 3D scene, then rows for your adventures, heroes, new adventures, and the Realm.
- Realm content reuses the website's setting data (`settings/realm-of-myr/setting-data.json` in S3), shipped with the app so it works offline.
- Host mode starts alongside this work, under its own plan.

## Current state

- `apps/desktop/src/play.tsx` opens on a title screen over the current save's scene: Continue, New game, and the account badge.
- `LocalStore` (`apps/desktop/runtime/store.ts`) keeps one current save. Starting over moves it to an `archive` table that nothing reads.
- The hero roster, hero creator, painting, and New game party setup exist (`hero-creator.tsx`, `new-game.tsx`).
- No setting text is bundled. The website's setting page reads S3.

## Design

- **Home** is the launch screen and where Menu returns.
  - Header: wordmark, account badge.
  - Banner: the most recent unfinished adventure over its live scene, with Continue. With no saves, the banner offers the free starter.
  - Your adventures: every local save as a module cover with round, status, and last played. Opening one resumes it.
  - Heroes: roster portraits, New hero, and edit or paint from a portrait.
  - New adventure: owned covers open party setup. Locked covers keep their price and link.
  - Realm of Myr: a card that opens the Realm page.
- **Realm page**: header painting, overview, technology, magic, and five locations with paintings and history.
- **Saves**: `saves` lists the current save and archive as summaries. `resume` swaps the chosen archive row with the current save in one transaction. Starting a new adventure no longer asks for confirmation, since nothing is lost.
- **Realm data**: `scripts/desktop-realm.ts` snapshots the setting JSON and paintings from S3 into `public/stage/realm/`, which the desktop build already copies. Re-run it when the website's setting changes.

## Progress

- [x] Plan and owner decisions
- [x] Runtime: a save list on every response and a `resume` command, with tests. Archived saves keep a summary column, backfilled for older archives.
- [x] Realm snapshot script and bundled data: five places, 1.3 MB of paintings.
- [x] Home screen shelves and banner
- [x] Realm page
- [x] Home button in play and on the ending replaces Menu and New game. Party setup has no archive warning.
- [x] Typecheck, lint, 40 runtime tests. Browser check against the real runtime and a copy of the owner's saves: home, Realm, a new game, back home, and resuming the older adventure.
- [x] Owner review, 2026-10-08: cover titles overflowed and cards were small. Cover type now scales with the cover and shrinks to fit the longest word. Shelf covers are 240 px wide.
- [ ] Owner review of the merged build

## Validation, 2026-10-08

The packaged webview could not be screenshotted from the session, since window capture returned a blank frame. The UI was checked in system Chrome with the GPU, with the Tauri bridge forwarded to the real `runtime.cjs` and a copy of the owner's app data. No real saves were touched.

## Open

- Deleting saves. Not in this pass.
- Other settings. The Realm shelf assumes one setting until a second ships.
