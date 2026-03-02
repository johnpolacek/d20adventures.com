# Testing Adventure Plans

This document is the canonical testing runbook for adventure plans and runtime play behavior.

It covers:

1. Adventure plan authoring validation.
2. Practice run validation (owner-controlled party).
3. On-demand practice report validation.
4. Campaign run and multiplayer validation.
5. Regression checks for auth, billing, and build integrity.

## 1) Prerequisites

### Environment

Set local runtime env (`.env.local`) and test env (`.env.test`) with valid keys.

Required for auth/playwright smoke:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CONVEX_URL`
- `TEST_USER_EMAIL`
- `TEST_USER_PASSWORD`
- `TEST_USER_ID`
- `ADMIN_USER_IDS`

`ADMIN_USER_IDS` must include `TEST_USER_ID` for admin-only plan authoring tests.

### Install dependencies

```bash
pnpm install
pnpm exec playwright install chromium
```

### Start local stack

```bash
pnpm dev
```

## 2) Fast Preflight

Run before manual plan testing:

```bash
pnpm exec tsc --noEmit
pnpm test:auth
```

Pass criteria:

- Typecheck is clean.
- Auth guardrails pass.

## 3) Adventure Plan Authoring Test Script

Use a plan you can edit (owner/admin access).

Path pattern:

- `/settings/{settingId}/{adventurePlanId}/edit`

### A. Core metadata

1. Open the plan editor.
2. Change title-adjacent metadata fields (teaser, overview, party min/max, image).
3. Save.
4. Refresh.

Pass criteria:

- Changes persist exactly.
- No sections/scenes/encounters are lost.

### B. Encounter structure

1. Add a new section.
2. Add a scene in that section.
3. Add two encounters in that scene.
4. Set unique encounter IDs.
5. Add transitions from encounter A -> B.
6. Save and refresh.

Pass criteria:

- New section/scene/encounters persist.
- Encounter IDs remain stable.
- Transition definitions persist.

### C. Character references

1. Add or edit NPCs in the plan.
2. Attach NPC refs to an encounter.
3. Save and refresh.

Pass criteria:

- Encounter NPC refs resolve to valid NPC entries.
- No orphan NPC references.

### D. Draft/publish behavior

1. Toggle draft on.
2. Save and confirm it appears under draft adventures in setting play page (dev view).
3. Toggle draft off and save.

Pass criteria:

- Draft plans are not mixed into normal published adventure list.
- Publish state persists after reload.

## 4) Practice Run Test Script (Plan Iteration Loop)

Practice flow entry:

- `/settings/{settingId}/{adventurePlanId}/practice`

### A. Access control

1. As owner/admin, open practice page.
2. As non-owner non-admin, open same URL.

Pass criteria:

- Owner/admin can access setup.
- Non-owner gets access denied.

### B. Party lineup validation

1. Select fewer than min party size and try start.
2. Select more than max party size and try start.
3. Select a valid lineup and start.

Pass criteria:

- Invalid lineup is blocked with clear error.
- Valid lineup starts a new run.

### C. Practice run behavior

1. Confirm run opens in normal adventure flow route:
   - `/settings/{settingId}/{adventurePlanId}/{adventureId}`
2. Confirm owner can take actions for all selected PCs through turn order.
3. Confirm run does not expose lobby join behavior for other users.

Pass criteria:

- Practice run is playable end-to-end with owner controlling all selected PCs.
- Join attempts to practice run are blocked.

## 5) Practice Report Test Script (On-Demand)

Generate reports from turn UI during a practice run.

### A. Generation and persistence

1. In an active practice run, click `Generate Practice Report`.
2. Wait for completion.
3. Confirm report appears in:
   - Turn page report list.
   - Player page `Practice Reports` section.

Pass criteria:

- Report record persists and is visible in both surfaces.
- A failed generation produces a failed status with error message.

### B. Content expectations

For a generated report, verify:

1. It includes a summary.
2. Findings include a mix of actionable items.
3. Findings are tagged with type:
   - `plan_edit`
   - `code_investigation`
4. If `planPath` exists, “Open plan editor” link navigates to editor with `focus` query parameter.

Pass criteria:

- Report is diagnostic, not generic.
- Findings are correctly typed and linkable.

## 6) Campaign Run + Multiplayer Test Script

Use a normal character-select entry flow:

- `/settings/{settingId}/{adventurePlanId}/character-select`

### A. Campaign creation and lobby

1. Create campaign run (non-practice flow).
2. Confirm lobby appears for multi-party plans.
3. Confirm additional players can join with valid characters.

Pass criteria:

- Campaign flow unchanged from prior behavior.
- Lobby updates as players join.

### B. Start and progression

1. Start campaign from lobby.
2. Confirm first turn is created and run is active.
3. Progress through multiple turns and at least one encounter transition.

Pass criteria:

- Turn progression remains stable.
- No regressions in roll handling, NPC processing, or turn advance.

## 7) Security and Access Regression Checklist

### Manual checks

1. Signed-out:
   - `/admin` blocked.
   - `/api/adventure/{id}` returns `401`/`403` for protected data.
2. Signed-in non-member:
   - Cannot access random adventure IDs.
3. Practice run:
   - Non-owner cannot access run page, chat stream, or adventure stream endpoints.

Pass criteria:

- No unauthorized read/write access.

## 8) Billing/Token Regression Checklist

Run when touching AI/report generation or paid flows.

1. Verify report generation deducts tokens (same AI metering path).
2. Verify insufficient token path fails gracefully with user-visible error.
3. Verify campaign join still charges/refunds correctly on failure.

Pass criteria:

- Token behavior is fail-closed.
- Failed operations do not return false success states.

## 9) Final Release Gate for Adventure Plan Changes

Before merging plan-related or runtime changes:

```bash
pnpm exec tsc --noEmit
pnpm test:auth
pnpm -s build
```

Then execute:

1. One full practice run from plan setup to report generation.
2. One campaign run with lobby/start/turn progression.
3. One access-control check using a non-owner account.

If any step fails, do not ship.
