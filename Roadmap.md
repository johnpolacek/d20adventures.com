# D20Adventures Stabilization Roadmap

Last updated: 2026-02-28

## Progress Snapshot

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1: Security Hardening | Complete (Planned Items) | Core authz hardening items are implemented; legacy content without owner metadata remains admin-only until backfilled. |
| Phase 2: Billing/Token Integrity | Complete (Planned Items) | Fail-closed charging, Stripe amount validation, and rollback/refund flows are implemented for join/upload and AI non-stream paths. |
| Phase 3: Test and CI Guardrails | In Progress | New Playwright auth baseline exists; CI gates are not set up. |
| Phase 4: Dependency Upgrade Track | Not Started | Deferred until Phases 1-3 are complete. |
| Phase 5: Architecture Cleanup | Not Started | No structured split/logging cleanup work has started for this plan. |

## Phase-by-Phase Status

### Phase 1: Security Hardening

- `DONE`: Shared access helpers and broad adoption in adventure actions/routes, including page-load path guard:
  - `lib/adventure-access.ts`
  - `app/_actions/adventure.ts`
  - `app/_actions/advance-turn.ts`
  - `app/_actions/defer-turn.ts`
  - `app/_actions/ensure-npc-processed.ts`
  - `app/_actions/check-encounter-final.ts`
  - `app/_actions/load-adventure.ts` (including `loadAdventureWithNpc`)
  - `app/api/adventure/[adventureId]/route.ts`
  - `app/api/adventure/chat/[adventureId]/route.ts`
  - `app/api/adventure/stream/[adventureId]/route.ts`
- `DONE`: Setting/adventure-plan edit actions and pages now enforce admin-or-owner checks:
  - `app/_actions/setting-actions.ts`
  - `app/_actions/adventure-plan-actions.ts`
  - `app/settings/[settingId]/edit/page.tsx`
  - `app/settings/[settingId]/[adventurePlanId]/edit/page.tsx`
  - `app/settings/[settingId]/new/page.tsx`
  - Note: legacy content without owner metadata is effectively admin-only until ownership metadata is backfilled.
- `DONE`: `/api/user-characters` now requires auth, defaults to current user, and only allows cross-user reads for admins:
  - `app/api/user-characters/route.ts`
- `DONE`: adventure page load path now goes through guarded loader:
  - `app/settings/[settingId]/[adventurePlanId]/[adventureId]/page.tsx`
  - `app/_actions/load-adventure.ts`

### Phase 2: Billing/Token Integrity

- `DONE`: token deductions are fail-closed for core paid flows (no success response on failed debit):
  - `app/api/upload/route.ts`
  - `app/_actions/join-adventure.ts`
  - `lib/ai/index.ts` (object/text paths, including cleaned-parse paths)
- `DONE`: rollback/refund behavior exists for failed paid operations after a successful debit:
  - `app/api/upload/route.ts` (refund on upload failure)
  - `app/_actions/join-adventure.ts` (refund on post-debit join failure)
  - `app/_actions/tokens.ts`
  - `convex/userTokenManagement.ts`
- `DONE`: Stripe payment intent amount is validated server-side:
  - `app/api/pay/intent/route.ts`
- `NOTE`: compensation refunds are best-effort; if refund mutation fails, the operation now fails and logs the incident for manual correction.

### Phase 3: Test and CI Guardrails

- `DONE (Partial)`: New Playwright auth baseline and runbook:
  - `tests/api-auth.spec.ts`
  - `tests/auth.spec.ts`
  - `tests/utils/auth.ts`
  - `tests/global-setup.ts`
  - `TESTING.md`
  - `package.json` (`test:auth`)
- `OPEN`: no CI workflow currently enforces checks/build/tests on merge.
- `OPEN`: no integration tests yet for token failure/rollback edge cases.

### Phase 4: Dependency Upgrade Track

- `OPEN`: no isolated upgrade PRs started for `next`, `ai` SDKs, or `convex` under this phased plan.

### Phase 5: Architecture Cleanup

- `OPEN`: planned modularization and structured logging standardization not started under this roadmap.

## Completed Milestones (Relevant Commits)

- `71f2b8b`: Centralized adventure access and character control checks.
- `b6e30f2`: Rebuilt Playwright auth tests from scratch.
- `1675b9b`: Added `test:auth` and an as-needed release checklist.

## Current Next Checklist

1. Add integration tests for token/rollback edge cases (join/upload/AI charge failure paths).
2. Add CI workflow to gate on `pnpm check`, `pnpm -s build`, and critical Playwright flows.
3. Start dependency upgrade track in isolated PRs after CI guardrails are in place.
