# Static homepage

[Plans](../index.md) · [Wiki Home](../../index.md)

Status: Implemented and validated (2026-09-15)

## Goal

Serve `/` from Next.js prerendered output without Clerk middleware. Fetch the signed-in player's welcome card after hydration while preserving the public hero, navigation, redirects, token balance, and authenticated adventure selection.

## Design

- Keep the homepage a synchronous Server Component. Pass its existing public hero to a small client component as fallback content.
- Fetch the current user's active adventure through `/api/user/active-adventure`, covered by the existing `/api/:path*` Clerk matcher. Use the client Clerk profile for the player link instead of an additional backend profile request.
- Serve personalized API responses with `Cache-Control: private, no-store`; derive identity on the server. Cancel stale requests and hide results after sign-out or account changes.
- Move the global token provider's Server Action call to `/api/user/tokens`. Preserve initialization and refresh behavior with POST, so application data requests no longer post Server Actions to static page URLs.
- Clerk 7 still runs its own `invalidateCacheAction` on sign-in/sign-out. Installed SDK inspection confirms it only deletes a cache-marker cookie and never calls `auth()`. Keep this one-off SDK action working without adding homepage middleware.
- Remove only `/` from `proxy.ts`. Admin navigation already uses `/api/check-admin`; the header, footer, and redirect handler have no other homepage-hosted Server Actions.
- Do not change gameplay polling, wiki compilation, dependencies, schema, or shared production data.

## Validation

- Production build: `/` must appear in the prerender manifest and build output as static.
- Production HTTP: homepage and privacy remain cacheable without Clerk request headers; personalized endpoints reject signed-out requests and cannot be shared-cached.
- Browser: anonymous hero with no personalized requests; signed-in welcome and player links; empty/error fallback; sign-out and stale-response handling; tokens use the API and any homepage POST is Clerk's cookie-only cache invalidation.
- Run TypeScript, lint, and focused Playwright coverage with isolated Convex data; visually inspect desktop and mobile.

## Progress

- [x] Inspect homepage, middleware, and globally mounted auth interactions.
- [x] Implement the static homepage and authenticated API reads.
- [x] Verify production output and anonymous/authenticated browser flows.
- [x] Record results and prepare verified changes for `wt:finish`.

## Results

- `pnpm build`: passed; `/` is prerendered, while the two user APIs remain dynamic.
- `pnpm exec tsc --noEmit`: passed.
- Touched-file Biome check: passed. Full `pnpm lint`: passed with 7 pre-existing warnings and 3 informational diagnostics outside this change.
- `PLAYWRIGHT_BASE_URL=http://localhost:4109 pnpm test:run --grep-invert 'signed-out users cannot access the admin dashboard'`: 15/15 passed against the production build.
- The omitted admin case assumes development behavior. Production's existing `/sign-in` redirect leads to a missing route; the feature does not alter admin authorization or routing.
- `PLAYWRIGHT_BASE_URL=http://localhost:4821 pnpm test:run tests/auth.spec.ts --grep 'signed-out users cannot access the admin dashboard'`: 1/1 passed against the isolated development server.
- Public `/` and `/privacy`: HTTP 200, `x-nextjs-cache: HIT`, `s-maxage=31536000`, no Clerk auth headers. Signed-in document requests also contain only the public shell.
- Real Clerk sign-in and a temporary adventure in isolated Convex verified the welcome card, current-user API identity, token display, adventure-list navigation, and sign-out. The temporary adventure was deleted afterward; no shared gameplay data was mutated.
- Desktop and mobile browser screenshots checked for both public hero and real welcome card. No browser page errors in the live check.
- No production deploy occurred. Vercel CPU savings require a subsequent deployment and comparable traffic measurements.

Finished: 2026-09-15 (merged to main, policy: merge)
