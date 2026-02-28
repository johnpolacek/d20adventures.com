# Playwright Auth Test Setup

## 1) Environment

Create `.env.test` from `.env.test.example` and set real values.

Required variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CONVEX_URL`
- `TEST_USER_EMAIL`
- `TEST_USER_PASSWORD`
- `TEST_USER_ID`
- `ADMIN_USER_IDS`

`ADMIN_USER_IDS` must include `TEST_USER_ID`.

## 2) Install browser binaries

```bash
pnpm exec playwright install chromium
```

## 3) Start app

Run the app in another terminal:

```bash
pnpm dev
```

## 4) Run tests

Run all Playwright tests:

```bash
pnpm exec playwright test
```

Run only auth tests:

```bash
pnpm test:auth
```

## As-Needed Release Checklist

Use this checklist before deploys that touch auth, routing, middleware, or adventure actions.

1. Start local stack:

```bash
pnpm dev
```

2. Run auth guardrails:

```bash
pnpm test:auth
```

3. Run typecheck:

```bash
pnpm exec tsc --noEmit
```

4. Manual smoke in browser:

- Signed-out: `/admin` shows `Access Denied`.
- Signed-out: `/api/adventure/{id}` returns `401`.
- Signed-in admin: `/admin` loads dashboard.
- Signed-in player: active adventure page loads and turn submit still works.

## As-Needed Billing Smoke Checklist

Run this checklist when changing token logic, upload/join paid flows, AI generation wrappers, or Stripe payment intent logic.

1. Start local stack:

```bash
pnpm dev
```

2. Verify token-backed join success and failure:

- Success path: user with sufficient tokens can join an adventure.
- Failure path: force a join failure after debit (e.g., invalid/taken character) and verify tokens are refunded.

3. Verify token-backed upload success and rollback:

- Success path: upload returns `200` and token balance decreases.
- Failure path: force upload failure after debit (e.g., temporary S3 misconfig) and verify tokens are refunded.

4. Verify AI generation fail-closed charging:

- Success path: text/object generation works and token balance decreases.
- Failure path: simulate token decrement failure and verify generation does not return success.

5. Verify Stripe amount validation:

- POST `/api/pay/intent` with allowed amount returns client secret.
- POST `/api/pay/intent` with invalid/unsupported amount returns `400`.
