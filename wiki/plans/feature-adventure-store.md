# Adventure store

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md) · [GM core](../gm-core.md)

Status: Planned 2026-10-08. Branch `feature/adventure-store`. Nothing implemented yet.

A player buys an adventure on the website, then plays it in the desktop app. First-party adventures only. The creator marketplace and host mode are later plans. Owner decision and reasoning: [Desktop local play](desktop-local-play.md#owner-decisions).

## Current state

- The desktop app bundles all four Myr adventures into `packs.json` at build time (`apps/desktop/scripts/build-runtime.ts`). Stage assets ship in the app's `public/`, about 50 MB.
- The desktop app has no account sign-in. Its CSP allows only IPC and its own origin. The 2026-10-02 spike signed in with a Clerk ticket inside the webview, but session persistence and OAuth were not established.
- Stripe is used only for a $5 donation PaymentIntent (`app/api/pay/intent/route.ts`). No webhook, no Checkout, no product catalog.
- Convex has no auth configuration. Every function is public, and the Next server calls them with an unauthenticated `ConvexHttpClient`. See [Security](#security).
- No Stripe keys are in the local env files. The local Stripe CLI is signed in to a different account.

## Design

### Catalog

One typed catalog lists each adventure: id, title, price in cents, whether it is free, and the current pack version and hash. The web app, the API routes, and the desktop app read the same list. Prices live in code and go to Stripe as inline `price_data`, so no Stripe dashboard products are needed.

Proposed defaults, pending owner confirmation: The Midnight Summons free, the other three at $5.

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
| 2. Web checkout | Store UI on the website, Checkout route, webhook, Stripe test-mode run. | Stripe test keys for the D20 account. |
| 3. Desktop link | Link API and page, device token table, Keychain storage, linked-device list. | Phase 1. |
| 4. Pack delivery | Per-adventure pack build, S3 upload script, download API, desktop downloader, hash check, asset protocol. | Phases 1 and 3. |
| 5. Desktop library | Owned and locked adventures, Buy hand-off, refresh after purchase. | Phases 2 to 4. |
| 6. Release | Production Stripe keys and webhook, live purchase test, refund check. | Owner approval. |

## Security

- Pre-existing, found 2026-10-08: `convex/userTokenManagement.ts` exposes `incrementTokens` and `decrementTokens` as public mutations that take any user id with no check. Anyone with the public Convex URL can credit or drain any account's tokens. The same pattern would let anyone grant themselves adventures, so store functions use the server secret from the start. The token fix is tracked in [Maintenance](maintenance.md).
- Grants come only from a verified Stripe webhook or an admin action.
- Device tokens are random, stored hashed, revocable, and never logged.
- Packs are local files and can be copied. Accepted for now. Pack signing stays an open decision.

## Validation

- Unit tests: catalog shape, grant idempotency, secret rejection, webhook signature rejection, device link expiry.
- Stripe test mode end to end, with `stripe listen` forwarding to the worktree's dev server.
- Desktop: link, list, download, and play a purchased adventure in the packaged app.

## Open decisions

- Which adventure is free, and the price. Defaults above.
- Whether a refund removes the adventure.
- Stripe Tax at checkout, or price including tax.
