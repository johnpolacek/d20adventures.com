# Testing Runbook

[← All plans](index.md) · [Roadmap](../roadmap.md)

Canonical testing runbook for adventure plans and runtime play behavior.

1. Adventure plan authoring validation
2. Practice run validation (owner-controlled party)
3. On-demand practice report validation
4. Campaign run and multiplayer validation
5. Regression checks for auth, billing, and build integrity

## Prerequisites

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

## Fast Preflight

Run before manual plan testing:

```bash
pnpm exec tsc --noEmit
pnpm test:auth
```

Pass criteria:

- Typecheck is clean.
- Auth guardrails pass.

## Adventure Plan Authoring

Use a plan you can edit (owner/admin access). Path: `/settings/{settingId}/{adventurePlanId}/edit`

### A. Core metadata

1. Open the plan editor.
2. Change title-adjacent metadata fields (teaser, overview, party min/max, image).
3. Save and refresh.

Pass: changes persist exactly; no sections/scenes/encounters are lost.

### B. Encounter structure

1. Add a new section, scene, and two encounters.
2. Set unique encounter IDs and add a transition A → B.
3. Save and refresh.

Pass: structure and transitions persist with stable IDs.

### C. Character references

1. Add/edit NPCs and attach them to an encounter.
2. Save and refresh.

Pass: NPC refs resolve; no orphans.

### D. Draft/publish behavior

1. Toggle draft on, save, confirm it appears under draft adventures.
2. Toggle draft off and save.

Pass: draft plans are not mixed into published list; publish state persists.

## Practice Run

Entry: `/settings/{settingId}/{adventurePlanId}/practice`

### A. Access control

1. As owner/admin, open practice page — should succeed.
2. As non-owner non-admin, open same URL — should be denied.

### B. Party lineup validation

1. Try invalid party sizes (below min, above max) — should block with error.
2. Select valid lineup and start.

### C. Practice run behavior

1. Confirm run opens at `/settings/{settingId}/{adventurePlanId}/{adventureId}`.
2. Confirm owner can take actions for all selected PCs.
3. Confirm join attempts to the practice run are blocked.

Pass: playable end-to-end with owner controlling all PCs; no join exposure.

## Practice Report

Generate reports from turn UI during a practice run.

### A. Generation and persistence

1. In an active practice run, click `Generate Practice Report`.
2. Confirm report appears in the turn page report list and the player page `Practice Reports` section.

Pass: report persists in both surfaces; failed generation shows error status.

### B. Content expectations

1. Report includes a summary.
2. Findings are tagged `plan_edit` or `code_investigation`.
3. If `planPath` exists, "Open plan editor" link navigates to editor with `focus` query param.

Pass: report is diagnostic, not generic; findings are typed and linkable.

## Campaign Run + Multiplayer

Entry: `/settings/{settingId}/{adventurePlanId}/character-select`

### A. Campaign creation and lobby

1. Create campaign run (non-practice flow).
2. Confirm lobby appears for multi-party plans.
3. Confirm additional players can join with valid characters.

Pass: lobby updates as players join.

### B. Start and progression

1. Start campaign from lobby.
2. Progress through multiple turns and at least one encounter transition.

Pass: turn progression stable; no regressions in roll handling, NPC processing, or turn advance.

## Security Regression Checklist

1. Signed-out: `/admin` blocked; `/api/adventure/{id}` returns `401`/`403`.
2. Signed-in non-member: cannot access random adventure IDs.
3. Practice run: non-owner cannot access run page, chat stream, or adventure stream endpoints.

Pass: no unauthorized read/write access.

## Billing/Token Regression Checklist

Run when touching AI/report generation or paid flows.

1. Verify report generation deducts tokens.
2. Verify insufficient token path fails gracefully with user-visible error.
3. Verify campaign join charges/refunds correctly on failure.

Pass: token behavior is fail-closed; failed operations do not return false success.

## Final Release Gate

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
