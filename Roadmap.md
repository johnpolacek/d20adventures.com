# D20Adventures Stabilization Roadmap

Last updated: 2026-02-28

## Progress Snapshot

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1: Security Hardening | In Progress | Shared adventure access checks were added, but content-edit auth and `/api/user-characters` still need hardening. |
| Phase 2: Billing/Token Integrity | Not Started | Critical token/Stripe integrity gaps are still open. |
| Phase 3: Test and CI Guardrails | In Progress | New Playwright auth baseline exists; CI gates are not set up. |
| Phase 4: Dependency Upgrade Track | Not Started | Deferred until Phases 1-3 are complete. |
| Phase 5: Architecture Cleanup | Not Started | No structured split/logging cleanup work has started for this plan. |

## Phase-by-Phase Status

### Phase 1: Security Hardening

- `DONE (Partial)`: Shared access helpers and broad adoption in adventure actions/routes:
  - `lib/adventure-access.ts`
  - `app/_actions/adventure.ts`
  - `app/_actions/advance-turn.ts`
  - `app/_actions/defer-turn.ts`
  - `app/_actions/ensure-npc-processed.ts`
  - `app/_actions/check-encounter-final.ts`
  - `app/_actions/load-adventure.ts` (partial coverage)
  - `app/api/adventure/[adventureId]/route.ts`
  - `app/api/adventure/chat/[adventureId]/route.ts`
  - `app/api/adventure/stream/[adventureId]/route.ts`
- `OPEN`: Setting/adventure-plan edit paths are authenticated but not admin/owner gated:
  - `app/_actions/setting-actions.ts`
  - `app/_actions/adventure-plan-actions.ts`
  - `app/settings/[settingId]/edit/page.tsx`
  - `app/settings/[settingId]/[adventurePlanId]/edit/page.tsx`
  - `app/settings/[settingId]/new/page.tsx`
- `OPEN`: `/api/user-characters` trusts `userId` query param and can expose cross-user data:
  - `app/api/user-characters/route.ts`
- `OPEN`: adventure page load path still bypasses shared access guard:
  - `app/settings/[settingId]/[adventurePlanId]/[adventureId]/page.tsx` calls `loadAdventureWithNpc(...)`

### Phase 2: Billing/Token Integrity

- `OPEN`: token debit can fail after successful operation (upload path ignores debit failure):
  - `app/api/upload/route.ts`
- `OPEN`: join flow debits first, but has no rollback if later join work fails:
  - `app/_actions/join-adventure.ts`
- `OPEN`: AI usage charging is post-operation and not atomic with generation result:
  - `lib/ai/index.ts`
- `OPEN`: Stripe intent amount is not validated server-side:
  - `app/api/pay/intent/route.ts`

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

1. Lock `/api/user-characters` to current authenticated user (or admin).
2. Add admin/owner policy checks to setting and adventure-plan edit actions/pages.
3. Add access guard for page-based adventure load path (`loadAdventureWithNpc` usage).
4. Add token integrity rules (fail-closed debit, rollback/compensation strategy).
5. Add Stripe amount validation and server-side product/price mapping.
6. Add CI workflow after 1-5 are green locally.

