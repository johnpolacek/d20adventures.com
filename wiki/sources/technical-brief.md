# Technical brief

[Home](../index.md) · [Sources](../Sources.md) · [Architecture](../Architecture.md) · [Testing](../plans/testing-runbook.md)

Reviewed against local main on 2026-10-01.

## Stack

`package.json` declares Next 16.1.6, React 19.2.4, Convex 1.32.0, AI SDK 6.0.116, Clerk Next.js 7.0.1, TypeScript 5.9.3, and three.js 0.183.2. Use the manifest and lockfile for dependency changes.

The app also uses S3/CloudFront, Stripe, SendGrid, Playwright, Biome, and repository-local agent skills.

## Runtime

- Next.js pages, actions, and APIs coordinate gameplay and access checks.
- Convex owns live adventures, turn history, chat, token balances, and audio manifests.
- The four registered Myr adventures use compiled wiki source. S3 source is preferred only when complete relative to the local source tree.
- Source fallback is explicitly included in Next.js output traces.
- Admin edits are compiled before canonical writes and are backed by restorable revisions.
- Live turns adopt current source and re-pin provenance. Immutable published artifacts are a separate repository capability.
- Mapview provides stored 2D maps. Storyview provides incremental audio and optional automatic narration.
- Stageview's engine is implemented in a dev preview. Its primary-play-screen integration remains planned.

See [Architecture](../Architecture.md), [Wiki adventures](../wiki-adventures.md), [Storyview](../storyview.md), and [Stage engine](../stage-engine.md).

## Rendering

Public content and the homepage are static. Personalized homepage and token reads use authenticated private APIs. Clerk middleware covers explicit authenticated route families. Request-wide visit tracking has been removed.

## Validation posture

The latest recorded engine build, TypeScript, lint, and GPU checks are dated 2026-09-29. Homepage production-mode and authenticated browser checks are dated 2026-09-15. These results were not rerun for this documentation cleanup.

The production admin sign-in path, test wrapper, repository-wide formatting baseline, and additional gameplay/narration checks remain in [maintenance](../plans/maintenance.md). Use the [testing runbook](../plans/testing-runbook.md) to select current checks.
