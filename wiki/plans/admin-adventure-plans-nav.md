# Admin Adventure Plans Navigation

[← All plans](index.md) · **Status:** Implemented

Add top-bar admin navigation for the dashboard and Adventure Plans area, using the existing admin-only visibility check.

## Scope
- Expose `/admin` as **Admin** in the fixed header.
- Expose `/admin/adventure-plans` as **Plans** in the fixed header.
- Keep both links hidden from non-admin users through the existing `/api/check-admin` check.
- Confirm no active `/admin/wiki-adventures` app route remains to migrate.

## Validation
`pnpm generate:routes` and `pnpm exec tsc --noEmit` passed on 2026-05-27. Do not push without explicit approval.
