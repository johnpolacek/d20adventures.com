# D20Adventures Stabilization Roadmap

Last updated: 2026-03-01

## Progress Snapshot

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1: Security Hardening | Complete (Planned Items) | Core authz hardening items are implemented; legacy content without owner metadata remains admin-only until backfilled. |
| Phase 2: Billing/Token Integrity | Complete (Planned Items) | Fail-closed charging, Stripe amount validation, and rollback/refund flows are implemented for join/upload and AI non-stream paths. |
| Phase 3: Test and CI Guardrails | In Progress | New Playwright auth baseline exists; CI gates are not set up. |
| Phase 4: Dependency Upgrade Track | Complete (Planned Items) | `convex`, `next`, and AI SDK packages were upgraded in isolated steps and validated with typecheck/build/auth + targeted smoke checks. |
| Phase 5: Architecture Cleanup | In Progress | Initial `advance-turn` orchestration split is complete; larger file decomposition and log standardization remain. |

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
- `DECISION`: token/rollback validation is currently an as-needed manual smoke process documented in `TESTING.md`, not a mandatory integration suite.

### Phase 4: Dependency Upgrade Track

- `DONE (Step 1)`: upgraded `convex` from `^1.29.3` to `^1.32.0` and validated with:
  - `pnpm exec tsc --noEmit`
  - `pnpm -s build`
- `DONE (Step 2)`: upgraded `next` from `15.3.8` to `15.5.12` and validated with:
  - `pnpm exec tsc --noEmit`
  - `pnpm -s build`
  - `pnpm test:auth`
  - manual quickstart adventure entry smoke
  - Note: an attempted jump to `next@16.1.6` was deferred because current Clerk package compatibility requires a separate coordinated upgrade.
- `DONE (Step 3)`: upgraded AI SDK packages and validated AI/auth/adventure smoke:
  - `ai`: `^5.0.97` -> `^6.0.105`
  - `@ai-sdk/google`: `^2.0.39` -> `^3.0.34`
  - `@ai-sdk/openai`: `^2.0.69` -> `^3.0.37`
  - `@ai-sdk/react`: `^2.0.97` -> `^3.0.107`
  - `@ai-sdk/replicate`: `^1.0.18` -> `^2.0.21`
  - Validation:
    - `pnpm exec tsc --noEmit`
    - `pnpm -s build`
    - `pnpm test:auth`
    - signed-in smoke for `/api/ai/generate/text`, `/api/ai/generate/object`, AI demo text generation UI, and quickstart adventure entry route.

### Phase 5: Architecture Cleanup

- `DONE (Slice 1)`: extracted encounter/prompt context construction from `advance-turn` action into a dedicated service module:
  - `app/_actions/advance-turn.ts`
  - `lib/services/advance-turn-prompt-service.ts`
  - Outcome: reduced inline orchestration complexity while preserving behavior.
- `DONE (Slice 2)`: extracted turn-building and encounter transition branch logic from `advance-turn` into a dedicated service module:
  - `app/_actions/advance-turn.ts`
  - `lib/services/advance-turn-builder-service.ts`
  - Outcome: isolated state mutation/transition assembly from orchestration and persistence steps.
- `DONE (Slice 3)`: extracted turn persistence/finalization and NPC follow-up orchestration from `advance-turn` into a dedicated service module:
  - `app/_actions/advance-turn.ts`
  - `lib/services/advance-turn-finalization-service.ts`
  - Outcome: removed inline create/patch/finalize/NPC branches from the action and centralized those side effects for safer iteration.
- `DONE (Slice 4)`: started `npc-turn-service` decomposition by splitting intent/context and effect patching concerns into focused modules:
  - `lib/services/npc-turn-service.ts`
  - `lib/services/npc-turn-intent-service.ts`
  - `lib/services/npc-turn-effects-service.ts`
  - Outcome: initiative/context derivation and turn/dead-character patch construction are now isolated from orchestration flow.
- `DONE (Slice 5)`: extracted `processNpcTurnWithLLM` prompt/action generation branching into focused helpers:
  - `lib/services/npc-turn-service.ts`
  - `lib/services/npc-turn-generation-service.ts`
  - Outcome: action context, prompt construction, and model generation are isolated from branch side-effects and persistence orchestration.
- `DONE (Slice 6)`: extracted effect-application and AI roll reconciliation branches from `processNpcTurnWithLLM`:
  - `lib/services/npc-turn-service.ts`
  - `lib/services/npc-turn-resolution-service.ts`
  - Outcome: character effect mutation and AI reconciliation/merge are isolated from generation and orchestration branches.
- `DONE (Slice 7)`: extracted skip/pass handling and roll/no-roll branch orchestration wrappers from `processNpcTurnWithLLM`:
  - `lib/services/npc-turn-service.ts`
  - `lib/services/npc-turn-branch-service.ts`
  - Outcome: `processNpcTurnWithLLM` now primarily composes modular branch helpers instead of owning branch internals.
- `OPEN`: finalize `npc-turn-service` cleanup by extracting spell/post-processing + final response assembly and then removing `max-lines` suppression.
- `OPEN`: begin similar decomposition for `app/_actions/adventure.ts`.
- `OPEN`: reduce logging noise and standardize structured production logs across turn orchestration paths.

## Completed Milestones (Relevant Commits)

- `71f2b8b`: Centralized adventure access and character control checks.
- `b6e30f2`: Rebuilt Playwright auth tests from scratch.
- `1675b9b`: Added `test:auth` and an as-needed release checklist.

## Current Next Checklist

1. Finalize `npc-turn-service` decomposition by extracting spell/post-processing + final response assembly and removing `max-lines` suppression.
2. Split `app/_actions/adventure.ts` orchestration into focused service layers.
3. Reduce logging noise and standardize structured production logs on turn/adventure paths.
4. Keep auth, AI, and billing validation as as-needed local smoke runs when touching those paths.
