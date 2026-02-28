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
pnpm exec playwright test tests/auth.spec.ts tests/api-auth.spec.ts
```
