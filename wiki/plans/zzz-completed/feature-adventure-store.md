# Adventure store

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md) · [GM core](../gm-core.md)

Status: Phases 1, 3, 4 and 5 implemented 2026-10-08 in branch `feature/adventure-store`, isolated Convex project `d20adventures-feature-adventure-store`. Not merged or deployed. No packs uploaded to S3. Web checkout waits until beta.

A player buys an adventure on the website, then plays it in the desktop app. First-party adventures only.

Owner, 2026-10-08: this is alpha. Web checkout waits until at least beta. Every adventure is free in alpha, so no grant tool is needed. March of Davos shows its $5 price crossed out beside FREE, on its New game tab and on its cover. Because the store build bundles every free adventure, an alpha build plays all four without linking or downloads. Linking, story packs and locked adventures stay in place for beta.

Owner, 2026-10-08: playing needs a linked account, alpha included. Until the computer is linked, the title screen shows only Link your account. A stored Keychain token lets play start while the website check runs, so a linked player can play offline. A revoked token returns the title screen to the link step. Development builds skip the requirement unless `D20_REQUIRE_ACCOUNT` is set, so local playtests and checks still run without the website. Rust's `account_info` answers both questions without a network call. The creator marketplace and host mode are later plans. Owner decision and reasoning: [Desktop local play](desktop-local-play.md#owner-decisions).

## Current state

- The desktop app bundles all four Myr adventures into `packs.json` at build time (`apps/desktop/scripts/build-runtime.ts`). Stage assets ship in the app's `public/`, about 50 MB.
- The desktop app has no account sign-in. Its CSP allows only IPC and its own origin. The 2026-10-02 spike signed in with a Clerk ticket inside the webview, but session persistence and OAuth were not established.
- Stripe is used only for a $5 donation PaymentIntent (`app/api/pay/intent/route.ts`). No webhook, no Checkout, no product catalog.
- Convex has no auth configuration. Every function is public, and the Next server calls them with an unauthenticated `ConvexHttpClient`. See [Security](#security).
- No Stripe keys are in the local env files. The local Stripe CLI is signed in to a different account.

## Design

### Catalog

One typed catalog lists each adventure: id, title, price in cents, whether it is free, and the current pack version and hash. The web app, the API routes, and the desktop app read the same list. Prices live in code and go to Stripe as inline `price_data`, so no Stripe dashboard products are needed.

Alpha, owner 2026-10-08: all four free. March of Davos carries a $5 list price, shown crossed out. A free entry's optional `listPriceCents` is display only.

### Entitlements

A Convex `entitlements` table records what each account owns: Clerk user id, adventure id, source (`purchase` or `grant`), Stripe Checkout session id, amount, and time. The session id makes grants idempotent. Free adventures need no rows.

Store functions never take a user id from the caller without proof. Convex functions that read or write entitlements require a server secret shared only with the Next server. The Next routes establish who the user is, through Clerk on the website or a device token from the desktop app.

### Buying

1. The website shows each adventure with Buy or Owned.
2. Buy posts to `/api/store/checkout`. The route checks Clerk, refuses owned or free adventures, and creates a Stripe Checkout session with the user and adventure in metadata.
3. Stripe's hosted page takes payment and returns to the website.
4. `/api/store/webhook` verifies Stripe's signature and grants the entitlement on `checkout.session.completed` when paid.

Refunds are handled in the Stripe dashboard. Whether a refund revokes the adventure is open.

### Linking the desktop app

Plain version: like signing in to a TV app. The desktop shows a short code and opens the website. The player signs in there, confirms the code, and the app is linked.

1. The desktop asks `/api/desktop/link` for a code pair: a short user code and a long device secret.
2. The website page `/desktop/link` takes the user code from a signed-in player and approves it.
3. The desktop polls with the device secret and receives a device token once approved.
4. Rust stores the token in the macOS Keychain. Convex stores only its hash, with the user, device name, last use, and revocation.

This avoids running Clerk inside the Tauri webview. The website can list and revoke linked devices.

### Pack delivery

- The build writes one pack file per adventure: the compiled runtime plus that adventure's own art and set fixtures. Shared assets such as crowds, textures, and stock heroes stay bundled.
- The free starter stays bundled, so the app plays offline from first launch.
- Paid packs upload to private S3 under their version.
- `/api/desktop/packs/[id]` checks the device token and the entitlement, then returns a short-lived signed download URL and the expected hash.
- The desktop downloads into its app data folder, checks the hash, and loads bundled plus downloaded packs. Downloaded art loads through Tauri's asset protocol, which needs a CSP change.

### Desktop library

The New game screen shows owned adventures and locked ones with their price. Buy opens the website. Returning to the app refreshes the library and downloads new packs.

## Phases

| Phase | Scope | Needs |
|---|---|---|
| 1. Catalog and entitlements | Catalog, `entitlements` table, secret-guarded Convex functions, library query, tests. | Nothing external. |
| 2. Web checkout, beta | Store UI on the website, Checkout route, webhook, Stripe test-mode run. | Beta. Stripe test keys for the D20 account. |
| 3. Desktop link | Link API and page, device token table, Keychain storage, linked-device list. | Phase 1. |
| 4. Pack delivery | Story packs: per-adventure build, S3 upload script, download API, desktop sync, hash and version checks. Art and 3D scenes as downloadable data come later. | Phases 1 and 3. |
| 5. Desktop library | Locked adventures with prices on the New game screen, refresh after linking. The Buy hand-off waits for phase 2. | Phases 3 and 4. |
| 6. Release | Production Stripe keys and webhook, live purchase test, refund check. | Owner approval. |

## Phase 1 record, 2026-10-08

- `lib/store/catalog.ts`: the catalog and `libraryOf`, which marks free and owned adventures.
- `convex/schema.ts`: the `entitlements` table with user, user and adventure, and Stripe session indexes.
- `convex/store.ts`: `ownedAdventures` and `grantAdventure`, both requiring `STORE_SERVER_SECRET`. Grants are idempotent by Stripe session and by existing ownership.
- `lib/store/server.ts`: server helpers that add the secret. `grantAdventure` rejects ids outside the catalog.
- `app/api/store/library/route.ts`: the signed-in user's catalog with owned flags.
- `pnpm test:store`: five catalog tests, including a check that every catalog id is a bundled desktop adventure.

Validation on the worktree deployment: a wrong secret was refused, a grant was created, a replayed session and a second session for an owned adventure both returned the first row, and another user owned nothing. Biome and TypeScript passed. The library route was not exercised through a signed-in browser.

`STORE_SERVER_SECRET` must be set in each Convex deployment and in the matching Next environment. It is set for this worktree only.

## Phase 3 record, 2026-10-08

Website:

- `convex/devices.ts`: pending links and linked devices, all behind the server secret. Links expire after 10 minutes, are single use, and store only SHA-256 hashes of the poll secret and device token.
- `convex/serverSecret.ts` and `lib/convex/server-secret.ts`: the shared secret check, now used by store and device functions.
- `lib/desktop/link.ts`: eight-character codes without 0, O, 1 or I, secrets, hashing, bearer parsing, device names.
- API routes under `app/api/desktop/`: `link` and `link/token` for the app, `link/approve` and `devices` for the signed-in player, and `me`, `library`, `unlink` for a linked app's bearer token.
- `/desktop/link`: sign in, confirm the code, see linked computers and unlink them.

Desktop:

- `runtime/account.ts`: account commands. They reach the website only and never open the save.
- `src-tauri/src/main.rs`: `account_command` adds the Keychain token to each command and stores or clears it from the reply, so the webview never sees it. It skips the game lock. `open_site` opens website pages in the default browser. Development builds use their own Keychain item. The site defaults to `https://d20adventures.com`, and `D20_SITE_URL` points it at a local server.
- `src/account.tsx`: Link account on the start screen. It shows the code, opens the website, polls, then shows the account with Unlink.

Validation: Biome, both TypeScript projects, `cargo check` and rustfmt passed. `pnpm test:store` ran 9 tests and the desktop runtime suite ran 33, including 8 new account tests. End to end against the worktree's dev server, through the bundled `runtime.cjs` and a real Clerk session in a browser: link start, pending poll, approval on `/desktop/link`, a token on the next poll, a refused replay, account and library with a granted adventure, the device on the website list, unlink, and 401 for the old token. The Rust Keychain path and the start-screen control were not exercised in the running app.

## Phase 4 record, 2026-10-08

What downloads is the story: the compiled runtime the local GM plays. Art, set fixtures and 3D scene specs still ship in the app. The desktop's scene table (`apps/desktop/src/scenes.ts`) imports sets and stagings as code, so making them downloadable means moving that table into pack data. That is needed before adding an adventure without an app update, and before creator packs.

- `@d20/gm-core/packs`: the format. A pack is `{ format: 1, id, version, builtAt, runtime }`. The version is the first 16 hex characters of the runtime's SHA-256, so a bundled and a downloaded copy of the same content share a version.
- `scripts/desktop-packs.ts`: builds a pack per catalog adventure and `index.json`. `--out <dir>` writes a folder, and `--upload` writes `desktop-packs/` in the private data bucket. The index is written last.
- `lib/desktop/packs.ts`: reads the index and packs from S3, or from `DESKTOP_PACKS_DIR` in development. The index is cached for a minute.
- `GET /api/desktop/packs/[id]`: needs a linked device and ownership. It returns the pack with an `X-Pack-Sha256` header. `/api/desktop/library` adds each owned adventure's current pack version.
- `apps/desktop/runtime/packs.ts`: loads bundled packs plus valid downloads from `<app data>/packs/`, with downloads taking precedence. A file whose version does not match its content is ignored. Sync downloads owned packs it lacks, checks the hash and version, writes through a temporary file, and removes a download when the bundled copy is current.
- A linked status check syncs packs. The start screen reloads the adventure list when anything changed.
- `D20_BUNDLE=free pnpm build` in `apps/desktop` bundles only the free starter, as a store build will. The default still bundles all four, so development play is unchanged.

Validation: 38 desktop runtime tests, including 5 pack tests, and 9 store tests passed, with both TypeScript projects, gm-core's boundary check, and Biome. End to end with a free-only runtime against the worktree's dev server serving a local pack folder: before linking only The Midnight Summons was playable. Linking downloaded March of Davos, which the account owned, and skipped the bundled starter. Covert Cargo returned 403 until granted, then downloaded on the next status. A repeat status downloaded nothing. A hand-edited pack was ignored and replaced on the next sync. The test device was unlinked afterwards.

Not done: uploading packs to S3, which writes to the shared data bucket and needs owner approval. Downloads already on disk stay playable after unlinking or losing ownership.

In-app check, 2026-10-08, debug build with only the free starter bundled: with a linked token in the development Keychain item, the app read it at launch, called the website once for the account and library, and downloaded March of Davos and Covert Cargo. Two fixes came from this run. The account check re-ran on every screen update, because the parent passed a new callback each render. And isolating test data by overriding `HOME` also hid the login Keychain, so debug builds now accept `D20_DATA_DIR` for a separate data folder. The owner then clicked Unlink and Link account in the running app. Unlink revoked the device and deleted the Keychain item. Link account opened the website, polled, and after approval saved a new item and loaded the library. The owner found the `/desktop/link` page ugly, so it was redrawn in the desktop's stage look: a painted cover behind a leather panel, gold labels, the code as parchment tiles, and linked computers listed under a rule. Checked at desktop and phone widths, signed out, with a pending code, with a bad code, and with the entry form.

## Phase 5 record, 2026-10-08

- The desktop build writes `catalog.json` beside `packs.json`: every catalog adventure's title, teaser, player range, price and free flag, bundled or not. The runtime returns it with each game response.
- The New game screen lists playable adventures first, then the rest as tabs with a lock and their price, or "Owned" when the account owns one that has not downloaded.
- A locked adventure shows its cover under a brass lock, its teaser, and a panel. Not linked: the price and "Already own it? Link your account to download it." with a Link account button. Linked without it: the price and "The store opens soon." Owned: downloading, or the download failed and retries next launch. Play reads Locked.
- The start screen picks the first playable adventure until the player chooses one, so a free-only build opens on The Midnight Summons.
- The account control reports ownership to the game screen and lets it start linking.

Validation: desktop TypeScript, 38 runtime tests and Biome passed. A free-only build wrote a catalog of all four adventures. The screen was checked in a browser with the app's bridge answered from fixtures, as not linked, linked without the adventure, and owned with a failed download. The 3D stage does not run in that headless browser, so its error box was dismissed for the captures. Not yet seen in the running app.

The desktop runtime tests read `src-tauri/resources/packs.json`. After a free-only build, 22 of them fail until the default build runs again.

## Account required, 2026-10-08

- `useAccount` in `apps/desktop/src/account.tsx` holds the link state for the whole title screen. `AccountBadge` shows the account and Unlink top right. `LinkGate` replaces Continue and New game while play is gated, and shows the code as parchment tiles while waiting.
- If the account is unlinked or revoked mid-game, the title screen comes back.
- Checked in a browser with the bridge answered from fixtures: the gate, the waiting code, and a linked account reaching New game. Not yet seen in the running app.
- A release build needs the website's desktop API deployed, or nobody can link and play.

## Security

- Pre-existing, found 2026-10-08: `convex/userTokenManagement.ts` exposes `incrementTokens` and `decrementTokens` as public mutations that take any user id with no check. Anyone with the public Convex URL can credit or drain any account's tokens. The same pattern would let anyone grant themselves adventures, so store functions use the server secret from the start. The token fix is tracked in [Maintenance](maintenance.md).
- Grants come only from a verified Stripe webhook or an admin action.
- Device tokens are random, stored hashed, revocable, and never logged.
- Packs are local files and can be copied. Accepted for now. Packs are hash-checked in transit and version-checked on disk, but not signed. Signing stays an open decision.

## Validation

- Unit tests: catalog shape, grant idempotency, secret rejection, webhook signature rejection, device link expiry.
- Stripe test mode end to end, with `stripe listen` forwarding to the worktree's dev server.
- Desktop: link, list, download, and play a purchased adventure in the packaged app.

## Open decisions

- Unsigned development builds may prompt for Keychain access after each rebuild.

- Beta prices. March of Davos is listed at $5. The other three have no stated price.
- Whether a refund removes the adventure.
- Stripe Tax at checkout, or price including tax.

Finished: 2026-10-08 (merged to main, policy: merge)
