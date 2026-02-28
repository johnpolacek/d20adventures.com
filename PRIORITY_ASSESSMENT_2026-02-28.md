# D20Adventures Fresh Priority Assessment (Convex + Next/React)

Date: 2026-02-28
Scope: Fresh pass focused on Convex architecture/realtime + Next.js/React runtime patterns.
Skills applied: convex, convex-best-practices, convex-realtime, vercel-react-best-practices.

## Executive Summary

Top priority is security and authorization hardening across Convex access paths and server actions. The second priority is collapsing the current mixed realtime strategy (polling + SSE + Convex) into native Convex subscriptions. After those two, tighten schema/query design and then perform framework upgrades (Next / AI SDK / Convex) on a stabilized architecture.

## P0 (Do Immediately)

### P0.1 Missing authorization checks on sensitive adventure streams/data
Risk: Any authenticated user can access turn stream data for an arbitrary adventure ID in some paths.

Evidence:
- `app/api/adventure/stream/[adventureId]/route.ts` checks only authentication, not adventure membership/ownership.
- `app/api/adventure/[adventureId]/route.ts` has no auth gate and calls server action `loadAdventureWithNpc` directly.
- `app/_actions/load-adventure.ts` `loadAdventureWithNpc` has no auth check.
- `app/_actions/adventure.ts` `getAdventureLobbyData` checks `userId` but not whether user belongs to that adventure.

### P0.2 Missing per-character authorization in turn actions
Risk: Authenticated users may be able to perform actions on other players’ characters if they can invoke the action.

Evidence:
- `app/_actions/adventure.ts` `processTurnReply` validates auth but does not verify `characterPerformingAction.userId === userId`.
- `app/_actions/adventure.ts` `resolvePlayerRollResult` validates auth but does not verify character ownership.
- `app/_actions/advance-turn.ts` has no auth/authorization guard at action boundary.

### P0.3 No auth enforcement at Convex function boundary
Risk: Security relies on outer Next layer only; Convex functions themselves do not enforce identity/permissions.

Evidence:
- No `ctx.auth.getUserIdentity()` usage in `convex/` functions.
- Sensitive queries/mutations (adventure/turn/chat/visits) can be called without in-function authorization checks.

## P1 (Next)

### P1.1 Realtime architecture is duplicated and expensive
Risk: Higher infra load, race complexity, and stale-state behavior from polling + SSE + Convex mixed model.

Evidence:
- Polling loops:
  - `components/adventure/adventure-lobby.tsx` (`setInterval` + `/api/adventure/:id`)
  - `lib/hooks/use-adventure-lobby.ts` (`setInterval`) (currently unused)
- SSE loops backed by server-side polling intervals:
  - `app/api/adventure/stream/[adventureId]/route.ts`
  - `app/api/adventure/chat/[adventureId]/route.ts`
- Client SSE consumer for turns:
  - `lib/context/TurnContext.tsx`

Recommended direction:
- Move turn/lobby/chat reads to `useQuery` subscriptions against Convex.
- Keep Next route handlers for non-realtime concerns only.
- Remove interval-based server SSE polling.

### P1.2 Query/index inefficiencies in Convex
Risk: Full scans and in-memory filtering will degrade under growth.

Evidence:
- `convex/adventure.ts`
  - `getAdventuresByPlayer`: `collect()` then JS `.filter(playerIds.includes(...))`.
  - `getTurnByOrder`: index by adventure then `.filter(order)` instead of composite index.
  - `getTurnNavigationInfo`: `.collect()` to count turns.
- `convex/chat.ts`
  - `getSince`: index by adventure then `.filter(createdAt > since)` instead of index-range query.

Recommended direction:
- Add composite indexes for dominant access patterns (e.g., adventure+order, adventure+createdAt range).
- Replace collect+filter patterns with index-constrained queries.
- For player membership, consider a dedicated membership table keyed by `userId`.

### P1.3 Schema looseness (`v.any`) increases data integrity risk
Risk: Weak validation allows malformed turn/adventure state, causing runtime edge failures.

Evidence:
- `convex/schema.ts` uses `v.any` for `visits.metadata` and `turns.characters[].rollRequired`.
- `convex/adventure.ts` and `convex/turns.ts` use `v.array(v.any())` for `characters` in function args/patches.

Recommended direction:
- Replace `v.any` with strict validators for roll requirement and character payload subsets.
- Centralize shared validators and reuse across mutations.

### P1.4 Server-side Convex client choice
Risk: `ConvexClient` (realtime websocket client) is used in server contexts where `ConvexHttpClient` is more appropriate.

Evidence:
- `lib/convex/server.ts` uses `ConvexClient` from `convex/browser`.
- Route handlers also instantiate `ConvexClient` (`app/api/adventure/stream/...`, `app/api/adventure/chat/...`).

Recommended direction:
- Use `ConvexHttpClient` for server actions/route handlers.
- Reserve realtime client (`ConvexReactClient`) for browser/reactive UI.

## P2 (After Core Stabilization)

### P2.1 Framework upgrades (Next / AI SDK / Convex)
How upgrades fit:
- Upgrades should come after P0/P1 hardening so you do not migrate unstable architecture.
- Current baseline is already modern (`next@15.3.8`, `react@19.2.0`, `ai@5.0.97`, `convex@1.29.3`), so risk is mostly compatibility/regression, not urgent security patching from obviously stale majors.

Suggested order:
1. Convex authorization + realtime refactor.
2. Query/index/schema hardening.
3. Then run dependency upgrade pass with focused regression tests:
   - Next route handlers / server actions behavior
   - Clerk auth boundaries
   - AI SDK hooks (`experimental_useObject` usage)
   - Adventure turn realtime UX

### P2.2 Dead/legacy path cleanup
Evidence:
- `lib/hooks/use-adventure-lobby.ts` appears unused and mixes client code with server-only S3 utility imports.

Recommended direction:
- Delete or rewrite this hook after realtime architecture is finalized.

## Recommended Execution Plan (7 Steps)

1. Add explicit authorization helpers (`assertAdventureAccess`, `assertCharacterControl`) and apply to all action/route entrypoints.
2. Enforce identity checks inside Convex functions (not only Next wrappers).
3. Remove/replace vulnerable adventure stream and lobby endpoints with permissioned Convex subscriptions.
4. Refactor turn/lobby/chat UI to `useQuery` (Convex realtime) and remove interval polling/SSE bridges.
5. Tighten validators (`v.any` removal) and add composite indexes for hot paths.
6. Replace server-side `ConvexClient` with `ConvexHttpClient` where appropriate.
7. Run dependency upgrade wave (Next / AI SDK / Convex) with targeted Playwright + integration checks.

## Definition of Done for This Priority Cycle

- No adventure data path returns data without membership/ownership authorization.
- No turn mutation can be executed for a character not owned by the acting user.
- Lobby/turn/chat realtime updates use Convex subscriptions rather than server-side polling loops.
- Convex hot queries are index-backed; collect+filter hotspots eliminated.
- Schema/function validators remove critical `v.any` usage for gameplay state.
