# Runtime and implementation surface

[Home](../index.md) · [Sources](../Sources.md) · [Plans](../plans/index.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

**Technical source brief.** The executable stack is a Next.js App Router app with Convex, Clerk, S3/CloudFront, AI SDK, Stripe, SendGrid, Playwright, Biome, TypeScript, and the merged wiki-adventure runtime bridge.

**Status:** Last reviewed 2026-08-31. Evidence basis: `package.json`, repo tree, production S3 and rendering audits, production builds, and browser verification. Confidence: high for the setting adventure listing, merged code shape, static public-route modes, and audited production S3 state.

## Current versions

`package.json` lists Next 16.1.6, React 19.2.4, Convex 1.32.0, AI SDK 6.0.116, Clerk Next.js 7.0.1, and TypeScript 5.9.3.

## Version contradiction

`TECHNICAL_DOCUMENTATION.md` names older versions. Treat `package.json` as authoritative for installed dependency versions.

## Validation posture

After merge, focused wiki-adventure test batches, admin-authoring and bridge checks, `pnpm exec tsc --noEmit --pretty false`, and `pnpm build` pass. On 2026-08-25, the setting adventure listing additionally passed its public-flow check, TypeScript, touched-file Biome check, focused production build, and browser verification. The play-route server trace now explicitly carries the 201 dynamically-read Realm of Myr fallback source files. On 2026-08-31, the public rendering audit made content-only routes static, removed request-wide visit tracking, and passed build, TypeScript, lint, and all eight Playwright tests.

## Runtime Boundaries

| Boundary | Primary files | Notes |
| --- | --- | --- |
| UI and routes | `app/`, `components/` | App Router pages, client components, adventure UI, admin/content surfaces. |
| Server actions and API routes | `app/_actions/`, `app/api/` | Game orchestration, uploads, AI generation, payments, streams, auth-sensitive mutations. |
| Realtime persistence | `convex/`, `lib/convex/` | Game state, turns, chat, token ledger, realtime data layer. |
| AI gameplay services | `lib/ai/`, `lib/services/` | Roll requirements, NPC turns, narrative generation, turn updates, prompt/finalization services. |
| Content storage | `lib/s3-utils.ts`, `lib/wiki-adventures/`, `content/settings/realm-of-myr/`, `next.config.ts` | Legacy settings and non-migrated plan data remain in S3 JSON. Registered Realm of Myr adventures use complete S3 source when available and otherwise use repo-local wiki source, which must be explicitly included in Next.js server traces because it is read through dynamic filesystem paths. |
| Wiki adventure bridge | `app/_actions/create-adventure.ts`, `app/_actions/start-adventure.ts`, `app/_actions/advance-turn.ts`, `convex/adventure.ts` | Create/start/advance can pin wiki content refs, load compiled wiki artifacts, validate transition targets, and commit guarded Convex turn advances for registered local wiki adventures. |

## Current Architecture Shift

The merged implementation moves registered Realm of Myr runtime content toward markdown/JSON wiki source with required frontmatter, JSON character sheets, paired markdown profiles, compiled runtime indexes, content hashes, and Convex-pinned current encounters. The cutover is incomplete by design: legacy S3 AdventurePlan JSON still participates in listing, titles, party size, public selection, and compatibility routes. Admin authoring can write canonical S3 wiki source directly, so pre-write validation and remote-source completeness checks are the next hardening needs.
