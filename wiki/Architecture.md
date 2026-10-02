# Architecture

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md)

GM core references updated in `feature/gm-core` on 2026-10-02. Other sections last reviewed against local main on 2026-10-01.

## Runtime boundaries

| Boundary | Implementation |
|---|---|
| UI | Next.js App Router, React, character/narrative rails, map and narration overlays. |
| GM runtime | [GM core](gm-core.md) owns prompts, schemas, turn rules, character generation, and orchestration in `packages/gm-core`. |
| Server adapters | `lib/gm-server` supplies Clerk, AI SDK, billing, Convex, content loaders, and narration scheduling. Existing actions remain entrypoints. |
| Live state | Convex owns adventures, turns, players, chat, character state, token ledger, narration manifests, and accumulated story state. |
| Auth | Clerk identifies users. Route/action helpers enforce ownership and membership. Direct Convex authorization remains an audit area. |
| Authored content | Wiki markdown and JSON compile into bounded gameplay context. Registered adventures prefer complete S3 source and fall back to bundled repo source. |
| Other storage | S3/CloudFront holds settings, legacy content, characters, images, maps, and narration audio. |
| Providers | AI SDK and provider-specific calls generate gameplay, images, and speech. Stripe handles payments. SendGrid handles email. |

## Content and turns

[Wiki adventures](wiki-adventures.md) documents the current source and authoring contracts. `loadAdventurePlanForRuntime` routes registered modules through compiled wiki content and keeps legacy JSON loading for other plans.

Live registered adventures load current authored source. `commitWikiTurnAdvance` checks current turn/encounter and duplicate turn order, applies validated progression, and re-pins content provenance when source changes. Immutable artifact loaders exist separately. Do not assume live adventures are frozen on the original content version.

The source editor compiles proposed changes before canonical S3 writes and records revisions. The old pre-write-validation and partial-source-fallback findings are implemented fixes, not open migration work.

## Public rendering

The homepage is a static Server Component. Personalized welcome data comes from `/api/user/active-adventure` after hydration. Token initialization/refresh uses `/api/user/tokens`. Both derive user identity on the server and return private, no-store responses.

`proxy.ts` matches account, admin, API, create, AI demo, dev, mailing-list, player, and settings routes. The homepage and content-only public routes bypass Clerk middleware. Header/footer pathname behavior is client-side, and request-wide visit tracking was removed.

Clerk's own cookie-only cache invalidation may still POST during sign-in/sign-out. September verification distinguished that SDK action from personalized application reads.

## Visuals and narration

- [Mapview](plans/mapview.md) loads per-encounter 2D maps from `maps2d/`. Missing maps hide the map surface.
- [Storyview](storyview.md) generates and caches speech per paragraph, with on-demand or automatic shared charging.
- [Stage engine](stage-engine.md) runs plain three.js under `lib/stage/`, with declarative sets, standees, instanced crowds, and painterly post-processing. It is currently used only by `/dev/stage`.
- [Stageview](plans/stageview.md) will replace the text-first layout with the stage-first turn page. This integration is not yet implemented.

The old r3f encounter renderer, scene-kit, standee/mini generation, and paid mini products were removed. Historical ledger literals and legacy 3D schema fields remain for compatibility. New Stageview fixtures are separate from those retired assets.

## Risks and unfinished work

- S3 and Clerk are shared across worktrees even though Convex projects are isolated.
- Complete but invalid remote wiki source blocks runtime compilation. Source edits can affect ongoing adventures.
- Repo-local content must remain in Next.js output traces while used as fallback.
- Storyview has an upfront balance estimate, but final debit and successful synthesis are not atomic.
- Stageview production and phone performance, integrated gameplay, and coverage remain unverified.
- Access-control, Convex validator/query, and realtime audits need current evidence.

See [maintenance](plans/maintenance.md) for concrete follow-ups and [testing](plans/testing-runbook.md) for verification.
