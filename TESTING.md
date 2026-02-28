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
