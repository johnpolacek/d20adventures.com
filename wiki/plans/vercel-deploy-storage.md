# Vercel deployment storage

[Plans](index.md) · [Wiki Home](../index.md) · [Maintenance](maintenance.md)

Owner, 2026-10-23: the project was using all of the Hobby account's deployment storage.

## Findings

- Each deploy carries about 136 MB of `public/`: `stage` 67 MB, `images` 48 MB, `stage-lab` 21 MB.
- Every push to `main` deploys, and nine production deploys had piled up in five hours.
- Retention is previews 1 day, production 30 days. The API rejects `deploymentExpiration` on `PATCH /v9/projects`, and the Hobby settings do not show it.

## Done

- 2026-10-23: removed seven older production deploys. The live deploy and one rollback remain.
- 2026-10-23: `vercel.json` `ignoreCommand` skips a build when nothing outside `wiki/` changed since `VERCEL_GIT_PREVIOUS_SHA`. A missing or unknown previous SHA builds.
- 2026-10-23: stage art moved off the deploy. `.vercelignore` leaves out `public/stage` and `public/stage-lab`, about 88 MB. `next.config.ts` rewrites `/stage/*` and `/stage-lab/*` to `CLOUDFRONT_DOMAIN`, which already serves the `d20-public` bucket. Rewrites fall back only when no local file exists, so dev serves `public/` as before. `pnpm stage:sync` uploads changed files under `stage/` and `stage-lab/` with a 5 minute cache. The desktop app copies `public/stage` into its own bundle at build, so it is unaffected.
- Checked on the local dev server: a local file is served locally, and a missing one is answered by CloudFront.

- Checked on production after `82a7d3e`: `/stage/` and `/stage-lab/` files return 200 through CloudFront.

## Next

- Consider `public/images/app/backgrounds`, 27 MB, the same way.
- Convert the largest PNG and MP4 files.
