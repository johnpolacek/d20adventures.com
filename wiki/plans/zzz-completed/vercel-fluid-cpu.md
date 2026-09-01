# Reduce Vercel Fluid Active CPU

[Home](../../index.md) · [Plans](../index.md) · **Vercel Fluid CPU**

## Goal

Keep public/content-only routes statically renderable and out of request-time Clerk/Next.js execution while preserving authenticated homepage, navigation, editor, and gameplay behavior.

## Baseline

- Next.js 16.1.6 reports every page route as dynamic.
- `app/layout.tsx` calls `headers()` on every request, reads an `x-pathname` header injected by `proxy.ts`, and records production visits through a Convex mutation.
- The Clerk proxy matcher runs on nearly every non-asset request, including bot probes and content-only routes.
- `/` authenticates inside `getActiveAdventureForUser()`, authenticates again in the page, and fetches the Clerk user even when no active adventure is shown.
- `/privacy`, `/terms`, `/about`, `/contact`, `/roadmap`, `/unsubscribe`, and the not-found boundary contain no intrinsic request-time reads.

## Plan

1. Remove visit tracking completely: layout call, action, service, generated route set/generator, Convex visit functions/table, and visit-only testing helpers.
2. Move pathname-dependent header sizing/setting label and editor-footer visibility into small client components using `usePathname()`; keep the root layout a Server Component.
3. Replace the broad Clerk proxy matcher with explicit app/API route families that require server-side auth. Let content-only and unknown probe paths bypass middleware.
4. Deduplicate homepage authentication by passing the already-authenticated user ID into the active-adventure read and fetch Clerk profile data only when an active adventure needs it.
5. Investigate same-origin `/__clerk/v1/*` requests against repository config, deployed environment metadata when available, installed Clerk SDK behavior, and current official documentation. Change config only with a demonstrated cause.
6. Run build, standalone typecheck, lint, and tests; record final route modes and remaining legitimate dynamic surfaces.

## Validation

- `pnpm build`
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test:run` (with its required app services available)
- Inspect Next.js route output for `/`, `/privacy`, `/terms`, and `/_not-found`.

## Decisions and unknowns

- Preserve `/` as personalized server rendering; changing it to a client-fetched authenticated island would be a product loading-state change outside this focused optimization.
- Preserve Next.js link prefetching. Static content routes should become cheap instead.
- The root `AGENTS.md` references HTML wiki filenames, but this checkout's maintained wiki guide declares Markdown files as the source of truth.

## Outcome

- Removed the layout visit mutation, visit action/service, Convex visit functions and schema table, generated valid-route set, route generator, and visit-only test fixtures.
- The root layout no longer calls a request API. Header sizing/setting labels and editor-footer visibility use isolated `usePathname()` client components.
- Clerk proxy matching is limited to `/`, account/admin/API/create/AI-demo/mailing-list/player/settings route families. Content pages, static demos, dev-only preview, unknown paths, and common bot probes no longer invoke Clerk middleware.
- `/` now authenticates once. It reuses that user ID for the active-adventure result and only calls Clerk's user API when an active adventure needs the username.
- `/mailing-list` is explicitly dynamic because it personalizes subscription state; this prevents an authenticated read hidden behind a Server Action from being frozen at build time.
- Removed an ineffective `dynamic = "force-dynamic"` export from a Client Component. The turn-order page retains its route-level force-dynamic export because live gameplay state changes per request.

## Rendering audit

| Route | Before | After | Reason |
| --- | --- | --- | --- |
| `/` | Dynamic | Dynamic | Personalized Clerk auth plus active Convex adventure. |
| `/privacy` | Dynamic | Static | Content-only; no longer inherits root request APIs. |
| `/terms` | Dynamic | Static | Content-only; no longer inherits root request APIs. |
| `/_not-found` | Dynamic | Static | No root request API or broad Clerk proxy match. |

Other newly static pages include `/about`, `/contact`, `/roadmap`, `/pay`, `/unsubscribe`, `/demo/upload`, and the production response for `/dev/scene-preview`.

## Clerk finding

The deployed HTML loads ClerkJS from `https://clerk.d20adventures.com`, derived from the live publishable key. Neither the repository nor local environment sets a Clerk proxy URL, and `proxy.ts` does not enable Clerk's `frontendApiProxy`. Clerk documents `/__clerk` as the default only when Frontend API proxying is deliberately configured. Therefore the observed same-origin `/__clerk/v1/client` and `/__clerk/v1/environment` 404s are not initiated by the current app payload; likely sources are stale clients/extensions or probes. No Clerk configuration was changed.

## Dynamic rendering audit

- No application route/layout retains `headers()`, `cookies()`, `connection()`, `revalidate = 0`, `unstable_noStore`, or `noStore()`.
- `dynamic = "force-dynamic"` remains on `/mailing-list` for signed-in subscription state and `/settings/[settingId]/[adventurePlanId]/[adventureId]/[turnOrder]` for mutable live gameplay.
- Direct page-level `auth()` / `currentUser()` usage remains on `/`, `/account`, `/create`, `/player` pages, character editing, settings editing/practice/character selection, and auth-sensitive admin helpers. These routes legitimately personalize or authorize at request time.
- Auth calls in `app/_actions/`, `app/api/`, and `lib/ai/` protect mutations, gameplay reads, payment/upload endpoints, and AI work; they do not force unrelated public pages dynamic.

## Validation results

- `pnpm build`: passed. Route output confirms the rendering audit above.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm lint`: passed with one pre-existing informational `useTemplate` suggestion in `scripts/mapview-render.ts`.
- `pnpm test:run`: 8/8 Playwright tests passed after installing the matching Chromium runtime.
- Production-mode smoke: `/privacy` and `/terms` returned `x-nextjs-cache: HIT` with year-long shared cache headers; unknown paths, `/.env`, and `/wp-login.php` returned the pre-rendered not-found result with no Clerk auth headers; `/` retained Clerk headers and no-store caching as expected.
- The top-level `pnpm test` wrapper still waits forever for unused TCP port 4000 even after cloud Convex reports ready. The underlying suite passed when invoked directly; this test-harness issue predates and is unrelated to the CPU change.
