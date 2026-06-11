# Runtime and implementation surface

[Home](../index.md) · [Sources](../Sources.md) · [Plans](../plans/index.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

**Technical source brief.** The executable stack is a Next.js App Router app with Convex, Clerk, S3/CloudFront, AI SDK, Stripe, SendGrid, Playwright, Biome, TypeScript, and the merged wiki-adventure runtime bridge.

**Status:** Last reviewed 2026-06-11. Evidence basis: `package.json`, merge `fbd3e97`, repo tree, validation commands. Confidence: high for merged code shape; medium for production S3 state.

## Current versions

`package.json` lists Next 16.1.6, React 19.2.4, Convex 1.32.0, AI SDK 6.0.116, Clerk Next.js 7.0.1, and TypeScript 5.9.3.

## Version contradiction

`TECHNICAL_DOCUMENTATION.md` names older versions. Treat `package.json` as authoritative for installed dependency versions.

## Validation posture

After merge, focused wiki-adventure test batches, admin-authoring and bridge checks, `pnpm exec tsc --noEmit --pretty false`, and `pnpm build` pass. `pnpm check` fails on current Biome import sorting and formatting diagnostics, not the older schema/config mismatch.

## Runtime Boundaries

| Boundary | Primary files | Notes |
| --- | --- | --- |
| UI and routes | `app/`, `components/` | App Router pages, client components, adventure UI, admin/content surfaces. |
| Server actions and API routes | `app/_actions/`, `app/api/` | Game orchestration, uploads, AI generation, payments, streams, auth-sensitive mutations. |
| Realtime persistence | `convex/`, `lib/convex/` | Game state, turns, chat, visits, token ledger, realtime data layer. |
| AI gameplay services | `lib/ai/`, `lib/services/` | Roll requirements, NPC turns, narrative generation, turn updates, prompt/finalization services. |
| Content storage | `lib/s3-utils.ts`, `lib/wiki-adventures/`, `content/settings/realm-of-myr/` | Legacy settings, plan metadata, and character templates remain in S3 JSON. Registered Realm of Myr adventures now have repo-local wiki source with optional S3 canonical source override. |
| Wiki adventure bridge | `app/_actions/create-adventure.ts`, `app/_actions/start-adventure.ts`, `app/_actions/advance-turn.ts`, `convex/adventure.ts` | Create/start/advance can pin wiki content refs, load compiled wiki artifacts, validate transition targets, and commit guarded Convex turn advances for registered local wiki adventures. |

## Current Architecture Shift

The merged implementation moves registered Realm of Myr runtime content toward markdown/JSON wiki source with required frontmatter, JSON character sheets, paired markdown profiles, compiled runtime indexes, content hashes, and Convex-pinned current encounters. The cutover is incomplete by design: legacy S3 AdventurePlan JSON still participates in listing, titles, party size, public selection, and compatibility routes. Admin authoring can write canonical S3 wiki source directly, so pre-write validation and remote-source completeness checks are the next hardening needs.
