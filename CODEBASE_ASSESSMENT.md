# Codebase Assessment - d20adventures.com

Date: 2026-02-28

## Executive Summary

This is a substantial and ambitious Next.js + Convex + Clerk codebase (~298 TS/TSX files, ~26.4k lines in `app/`, `components/`, `convex/`, `lib/`, `tests/`). The core game loop and domain modeling are strong, and the production build currently succeeds.

The highest-risk issues are around authorization boundaries and write permissions. Several server actions and API routes allow authenticated (or in some cases unauthenticated) users to read or mutate resources they should not control.

Overall status: **functionally strong, security posture needs immediate hardening**.

## What I Ran

- `pnpm -s check`
  - Result: failed with **25 Biome diagnostics** (mostly formatting and style, not clear runtime blockers).
- `pnpm -s build`
  - Result: **passed** (Next.js production build compiled and generated routes/pages successfully).

## Architecture Snapshot

- Framework: Next.js App Router (`app/`), React 19.
- Auth: Clerk.
- Data + realtime: Convex (`convex/` + `lib/convex/*`).
- File/content storage: S3 + CloudFront (`lib/s3-utils.ts`, `lib/aws.ts`).
- AI: Vercel AI SDK wrappers (`lib/ai/*`) with token metering.
- Payments: Stripe payment intent API route.
- Testing: Playwright E2E only (light coverage; limited negative/security testing).

## Strengths

- Good domain decomposition for gameplay services (`lib/services/*`) and schema typing (`types/*`, Zod).
- Convex schema is explicit and reasonably indexed.
- Game orchestration has clear phases (reply -> roll requirement -> roll resolution -> NPC turns -> turn advance).
- Build pipeline is healthy (`pnpm -s build` succeeds).
- Some good auth patterns exist, e.g. chat access checks in [`app/_actions/chat.ts`](app/_actions/chat.ts) and [`app/api/adventure/chat/[adventureId]/route.ts`](app/api/adventure/chat/[adventureId]/route.ts).

## High-Priority Findings

### 1. Unauthorized data access (Critical)

- Adventure API route returns adventure + party data without validating caller membership:
  - [`app/api/adventure/[adventureId]/route.ts:38`](app/api/adventure/[adventureId]/route.ts#L38)
  - Depends on unguarded action call: [`app/_actions/load-adventure.ts:7`](app/_actions/load-adventure.ts#L7)
- User character API exposes arbitrary users' character files via querystring `userId`:
  - [`app/api/user-characters/route.ts:4`](app/api/user-characters/route.ts#L4)
  - Backing action has no auth/ownership check: [`app/_actions/character.ts:7`](app/_actions/character.ts#L7)

Impact: private game state and character data can be disclosed.

### 2. Missing authorization on game-state mutations (Critical)

- `advanceTurn` has no auth check:
  - [`app/_actions/advance-turn.ts:26`](app/_actions/advance-turn.ts#L26)
- `processTurnReply` and `resolvePlayerRollResult` check only authentication, not whether caller controls that character/adventure:
  - [`app/_actions/adventure.ts:23`](app/_actions/adventure.ts#L23)
  - [`app/_actions/adventure.ts:244`](app/_actions/adventure.ts#L244)
- `startAdventure` checks sign-in only, not owner/player authorization:
  - [`app/_actions/start-adventure.ts:34`](app/_actions/start-adventure.ts#L34)

Impact: authenticated users can potentially manipulate other users' sessions/adventures.

### 3. Content editing permissions are too broad (Critical)

- Setting/adventure-plan mutation actions allow any signed-in user:
  - [`app/_actions/setting-actions.ts:15`](app/_actions/setting-actions.ts#L15)
  - [`app/_actions/adventure-plan-actions.ts:14`](app/_actions/adventure-plan-actions.ts#L14)
  - [`app/_actions/adventure-plan-actions.ts:63`](app/_actions/adventure-plan-actions.ts#L63)
- Setting/adventure edit pages are not admin-guarded:
  - [`app/settings/[settingId]/edit/page.tsx:5`](app/settings/[settingId]/edit/page.tsx#L5)
  - [`app/settings/[settingId]/[adventurePlanId]/edit/page.tsx:10`](app/settings/[settingId]/[adventurePlanId]/edit/page.tsx#L10)
- Admin adventure-plans page does not call `requireAdmin`:
  - [`app/admin/adventure-plans/page.tsx:30`](app/admin/adventure-plans/page.tsx#L30)

Impact: global content integrity risk (settings/plans can be altered by non-admins).

## Medium-Priority Findings

### 4. SSE route lacks membership authorization

- `/api/adventure/stream/[adventureId]` only checks logged-in status; no owner/player validation:
  - [`app/api/adventure/stream/[adventureId]/route.ts:9`](app/api/adventure/stream/[adventureId]/route.ts#L9)

### 5. Billing and token accounting consistency gaps

- File upload returns success even when token decrement fails (free uploads possible during token errors):
  - [`app/api/upload/route.ts:80`](app/api/upload/route.ts#L80)
- Join adventure charges tokens before join validation/mutation success:
  - [`app/_actions/join-adventure.ts:30`](app/_actions/join-adventure.ts#L30)
- AI image route trusts client-provided `userId` for storage path:
  - [`app/api/ai/generate/image/route.ts:14`](app/api/ai/generate/image/route.ts#L14)

### 6. Payment/webhook input hardening gaps

- Stripe intent route does not validate `amount` bounds/type:
  - [`app/api/pay/intent/route.ts:18`](app/api/pay/intent/route.ts#L18)
- SendGrid inbound handler does not verify sender authenticity/signature:
  - [`app/api/sendgrid/inbound/route.ts:4`](app/api/sendgrid/inbound/route.ts#L4)

### 7. Profile actions trust caller-supplied userId

- `updateProfile` and `setUsername` accept arbitrary `userId` parameter with no auth/ownership check:
  - [`app/_actions/profile.ts:21`](app/_actions/profile.ts#L21)
  - [`app/_actions/profile.ts:47`](app/_actions/profile.ts#L47)

## Maintainability / Scale Risks

- Several very large files are carrying orchestration + policy + prompt logic together:
  - `lib/services/npc-turn-service.ts` (~901 lines)
  - `app/_actions/adventure.ts` (~539 lines)
  - `app/_actions/advance-turn.ts` (~490 lines)
- Heavy console logging in production paths increases noise and can leak context.
- Biome has many style/format errors; consistent formatting is currently drifting.

## Test Coverage Assessment

Current tests are mostly UI happy-path E2E and do not cover the highest-risk areas:

- No focused tests for authorization boundaries on server actions/API routes.
- No integration tests for token accounting atomicity (deduct-before-write / rollback behavior).
- No tests for cross-user access attempts.

## Recommended Remediation Plan

### Phase 1 (Immediate, security hardening)

1. Add centralized access guard helper for adventure resources (`assertAdventureAccess(adventureId, userId)`), reuse across:
   - `startAdventure`, `advanceTurn`, `processTurnReply`, `resolvePlayerRollResult`, `ensureNpcProcessed`, load-adventure actions, and stream/data API routes.
2. Lock down content mutations to admins (or explicit owner policy) for setting/plan create/update flows.
3. Protect `/api/user-characters` to only return the authenticated user's own records.
4. Add `requireAdmin` to `app/admin/adventure-plans/page.tsx`.

### Phase 2 (Integrity and reliability)

1. Make token deductions transactional/atomic with target action where possible.
2. In `joinAdventure`, validate join eligibility before token deduction, or refund on failure.
3. In upload flow, fail request if token deduction fails after upload, or mark debt ledger explicitly.
4. Validate payment `amount` (integer cents, min/max bounds).

### Phase 3 (Code health)

1. Split giant orchestration files into smaller modules (policy checks, prompt builders, turn state transitions, DB adapters).
2. Reduce production logging to structured, sampled, and non-sensitive events.
3. Bring `pnpm check` to green and enforce in CI.
4. Add integration tests for authz + billing edge cases.

## Final Assessment

The product direction and gameplay architecture are promising and the project is operationally close to production from a build/runtime perspective. The blocking risk is **authorization correctness** across server actions and API routes. Addressing those boundaries first will materially improve safety without requiring a full rewrite.
