# D20 Adventures — Project Wiki

**Home** · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

A narrative RPG platform blending play-by-post adventure turns, realtime updates, authored adventure plans, and an AI Game Master. This wiki was initialized from the existing Next.js, Convex, Clerk, S3, Stripe, SendGrid, and AI SDK codebase.

| | |
|---|---|
| **Lifecycle** | Existing product prototype, post-MVP import |
| **Current priority** | Post-merge wiki-adventure hardening |
| **Planning shape** | Review findings and hardening plans under [plans/](plans/index.md) |
| **Automation** | Commit when confident; ask before pushes and long-running operations |

**Reader goal:** after two minutes, know where project context lives and what hardening risk to prioritize after the wiki-adventure merge.

## Runtime at a glance

Player UI → Next.js server actions → Convex (state) and wiki source (S3 or repo-local) → AI Game Master. Convex pins the content ref and commits guarded turn writes; the AI GM reads a bounded wiki context packet.

## Core pages

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
