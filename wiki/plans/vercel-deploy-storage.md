# Vercel deployment storage

[Plans](index.md) · [Wiki Home](../index.md) · [Maintenance](maintenance.md)

Status: done, 2026-10-23. Kept for reference.

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
- 2026-10-23: `public/images/app/backgrounds`, 27 MB, moved the same way. Same sync, rewrite and ignore list. The desktop app copies it at build, so it is unaffected.

- 2026-10-23: the large images in use, re-encoded. `d20-hero` (7.5 MB PNG) and `parchment-texture` (2.5 MB PNG) became WebP at 0.33 and 0.29 MB, and their references moved. The old PNG URLs still answer from CloudFront. `characters/default.png`, `avatar/npc.png` and `screenshot.png` keep their paths, since content, saved records and shared links use them, and are resized to 0.4, 0.2 and 0.66 MB. The deploy's `public/images` went from 20.6 to 10.2 MB, and the desktop bundle lost 10 MB.
- There are no MP4 files in `public/`. The two in `lab/stage-art/results/` are under 1 MB and not deployed.

- 2026-10-23, owner decision: unused images from the first commit, referenced nowhere in code or content, left the repo after upload to the bucket. `images/app/screenshots/` (3.9 MB), `avatar/npc-0.png` (3.5 MB), `avatar/bot.png` (1.2 MB) and `d20-transparent.png` left the deploy, and `backgrounds/genre/` (13.8 MB) and `backgrounds/background-texture.jpg` (2.7 MB) the desktop bundle. The rewrite now covers all of `/images/`, so any image a deploy lacks answers from CloudFront and old links keep working. The deploy's `public/images` is 1.3 MB.
- Through the local dev server the CloudFront fallback is slow, 15 to 40 s for a 1 MB file. Fetched directly, the same files come back at once.
- Checked on production after `3e90347`: removed images, old PNG URLs and the new WebP files all return 200 in about 1 to 5 s.
