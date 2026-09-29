# D20 Adventures — Project Wiki

**Home** · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

A narrative RPG platform blending play-by-post adventure turns, realtime updates, authored adventure plans, and an AI Game Master. Adventures can be experienced as text-driven play (Gameview), a narrated paragraph-by-paragraph audiobook mode (Storyview), or with a 2D battle-map backdrop (Mapview). A painted 3D encounter stage is proposed as Stageview; the old 3D stack was removed on 2026-09-29 to make room for it — all sharing the same game state and switchable mid-adventure. This wiki was initialized from the existing Next.js, Convex, Clerk, S3, Stripe, SendGrid, and AI SDK codebase.

| | |
|---|---|
| **Lifecycle** | Existing product prototype, post-MVP import |
| **Current priority** | Post-merge wiki-adventure hardening |
| **Latest validation** | Homepage now builds static and bypasses Clerk middleware; private APIs load the signed-in welcome and token balance. Production build, TypeScript, lint, 15 production-mode Playwright cases, and live isolated-adventure browser checks pass (2026-09-15). |
| **Planning shape** | Review findings and hardening plans under [plans/](plans/index.md) |
| **Automation** | Commit when confident; ask before pushes and long-running operations |

**Reader goal:** after two minutes, know where project context lives and what hardening risk to prioritize after the wiki-adventure merge.

## Runtime at a glance

Player UI → Next.js server actions → Convex (state) and wiki source (S3 or repo-local) → AI Game Master. Convex pins the content ref and commits guarded turn writes; the AI GM reads a bounded wiki context packet.

## Core pages

- **[Stageview](plans/stageview.md)** — the painted procedural 3D direction chosen 2026-09-29. Covers the demo assessment, measurements, the replacement architecture, and the removal inventory.
- **[Stageview engine](plans/feature-stageview-engine.md)** — phase 2: the `lib/stage/` runtime, set spec v1 (declarative JSON sets), the Kordavos gate set, `/dev/stage`, and DPR 2 verification results.
- **[Remove 3D stack](plans/zzz-completed/feature-remove-3d-stack.md)** — what the clean-slate removal deleted, the map-only panel that replaced the encounter overlay, validation, and leftovers (S3 prefixes, branches).
- **[Static homepage](plans/zzz-completed/feature-static-homepage.md)** — rendering boundary, Clerk cache-action behavior, authenticated API migration, and validation evidence.
- **[Wiki Agent Guide](AGENTS.md)** — maintenance contract for this wiki directory.
- **[Project Log](log.md)** — durable context changes and validation notes.
- **[Sources](Sources.md)** — source evidence, confidence, and unknowns.
- **[Plans](plans/index.md)** — planning dashboard and active plan slots.
- **[Implementation Review](plans/wiki-adventure-implementation-review.md)** — post-merge findings, validation evidence, and hardening actions.
- **[Roadmap](roadmap.md)** — next useful project direction.
- **[Architecture](Architecture.md)** — runtime boundaries, data flow, and risk map.

## Source briefs

- **[Product brief](sources/prd.md)** — AI-led narrative RPG intent and workflows.
- **[Technical brief](sources/technical-brief.md)** — stack, runtime surfaces, wiki source bridge, and validation posture.
- **[Design brief](sources/design-brief.md)** — durable UI and interaction direction.
- **[Marketing brief](sources/marketing-brief.md)** — public-entry and waitlist/community surfaces.
