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

## Next

- Move stage art and large backgrounds to Blob or S3 so deploys stop carrying them.
- Convert the largest PNG and MP4 files.
