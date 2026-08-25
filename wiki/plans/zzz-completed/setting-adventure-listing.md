# Setting adventure listing hardening

[Wiki Home](../../index.md) · [Plans](../index.md) · [Sources](../../Sources.md) · [Architecture](../../Architecture.md)

## Problem

`/settings/[settingId]/play` rendered an empty Realm of Myr adventure section in production. The registered wiki adventures depend on repo-local `content/settings/realm-of-myr/` as their fallback source, but those files are read through dynamic filesystem paths and were not included in the Next.js server trace. The page also treated one failed adventure load as a failure for the complete list and hard-coded Realm of Myr presentation by array position.

## Decision

- Include the Realm of Myr runtime content tree in server traces so Vercel can execute the repo-local fallback.
- Load registered adventures independently so one invalid/unavailable adventure does not remove the others.
- Render one data-driven **Adventures** grid for every setting; remove the Realm of Myr-only intro/full labels and positional card curation.
- Show a concise unavailable state if no playable adventure can be resolved.

## Validation

- `pnpm audit:wiki-adventures:prod-s3` confirmed all four adventures currently require the repo-local fallback: three have no S3 source and March of Davos has an incomplete S3 source that is rejected.
- `pnpm test:wiki-adventures:public-flow` passed and confirms the listing has no positional curation or intro/full labels.
- `pnpm exec biome check` passed for the touched TypeScript files.
- `pnpm exec tsc --noEmit --pretty false` passed.
- A focused Next.js production build passed. Its `/settings/[settingId]/play` server trace contains all 201 Realm of Myr content files.
- Browser verification against that production build rendered four adventure cards with the expected titles and links, one **Adventures** heading, and no browser console errors.

## Status

Completed — 2026-08-25.
