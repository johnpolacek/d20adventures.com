# GM core

[Home](index.md) · [Architecture](Architecture.md) · [Gameplay](gameplay-flows.md) · [Desktop plan](plans/desktop-local-play.md)

Extracted in `feature/gm-core` on 2026-10-02. This branch preserves the web game's existing behavior. Integration and deployment are separate steps.

`packages/gm-core` is the shared TypeScript runtime. It owns turn prompts, schemas, character generation, player replies and rolls, NPC and AI companion processing, encounter progression, access rules, and pure wiki runtime helpers. Its only runtime dependency is Zod. It has no Next, Clerk, Convex, AWS, Node, or environment imports.

Call `createGmCore(ports)` to create a runtime. Each instance retains its own dependencies. Injected adapter methods retain their receiver, so adapters may use class instance state. There is no global provider configuration. Package subpaths expose shared types, schemas, and pure helpers without importing the server.

| Interface | Host responsibility |
|---|---|
| `Llm` | Generate typed objects or text. Own transport, retries, output cleanup, and usage accounting. The adapter must honor the supplied schema. |
| `Store` | Read game records and write replies, rolls, and new turns. `commitWikiTurnAdvance` must atomically reject stale turns, stale encounters, and duplicate orders. |
| `Content` | Load runtime artifacts and legacy plans. Supply optional map staging text. |
| `Billing` | Charge model usage. The server model adapter consumes this interface. Local CLI adapters can supply their own accounting policy. |
| `Narration` | Schedule work after a turn changes. The current server delegates to Storyview through Next's `after`. |
| `identity` | Return the current authenticated user ID, or null. Core access checks still enforce adventure membership and human character control. |
| `sleep` | Optional delay implementation. Tests replace delays. Production keeps the existing timing. |

Records and IDs crossing the core boundary are plain TypeScript values. The server store converts string IDs to Convex's branded IDs. It preserves full documents for existing host callers. The store does not add new authorization rules or change the existing Convex mutation contract.

`lib/gm-server` implements the current host. Content reads still use S3 and repo fallback. Clerk supplies identity. The existing model and style prompt remain in `lib/ai`. Text-model charging now lives in `lib/gm-server/billing.ts`. Storyview's transport, caching, and speech charging remain in their existing server services.

Existing `app/_actions`, `lib/services`, `lib/validations`, and shared type paths are compatibility entrypoints. Client-callable actions retain `use server`. Pages and components keep their existing imports and behavior.

The pnpm workspace includes the root app and `packages/*`. Next transpiles `@d20/gm-core` from TypeScript source. `apps/desktop-spike` remains a standalone historical experiment. Its source-inspection harness belongs to the phase 0 commit recorded in its results. Run it from the spike branch, rather than treating it as the package API.

## Verification

- `pnpm --filter @d20/gm-core check` checks the package without Node ambient types or web aliases.
- `pnpm test:gm-core` checks dependency boundaries and browser bundling, replays recorded prompts and state, checks character-generation prompts, and exercises authorization, companions, transitions, and billing errors without external services.
- Golden fixtures under `scripts/gm-core-fixtures` came from unmodified services at `7ff0b2d`. The turn fixture is the phase 0 seven-call Claude sample. The fixtures establish extraction parity, not model reliability.
- The [extraction plan](plans/feature-gm-core.md) records builds, existing checks, browser results, and the authenticated playthrough.

The spike's strict patch contract and combined pre-roll request remain experimental. Core extraction does not apply character patches that the original code only stored, change prompt quality, add SQLite saves, or implement a desktop host.

The subsequent [desktop integration](plans/zzz-completed/feature-desktop-stage-play.md#character-state-follow-up-2026-10-03) adds a SQLite host that applies typed character operations. `wiki-adventures/character-updates.ts` defines item add/remove, effect set/remove, and named spell-use updates. The shared adventure patch remains compatible with historical descriptive notes. Desktop requires explicit operations, preserves live character values across encounters, and rejects malformed or unknown references before persistence. These host semantics do not change the existing Convex commit behavior.
