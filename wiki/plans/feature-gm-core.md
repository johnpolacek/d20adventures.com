# GM core extraction

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop plan](desktop-local-play.md#phase-1-extract-gm-core)

Status: Completed locally, 2026-10-02. Owner approved worktree setup, dependency setup, builds/checks, dev server, Playwright, and an authenticated live playthrough. Base is the committed spike `7ff0b2d`. No push or merge is authorized.

## Scope

Extract the existing game runtime into `packages/gm-core`, consumed by the current server through adapters. Preserve prompts, schemas, game rules, retries, billing outcomes, access checks, and action signatures. Keep the spike's strict-patch and combined-call experiments out of the production extraction.

- Establish a pnpm workspace for the root web app and `packages/*`. Keep the throwaway desktop spike standalone.
- Move the 20 gameplay service modules, eight character-generation operations, reply/roll/advance orchestration, shared types/validation, and required pure wiki/game helpers into the package.
- Inject typed `Llm`, `Store`, `Content`, `Billing`, and `Narration` interfaces. Supply authenticated identity at the server action boundary. Use per-instance dependencies, without mutable global provider configuration.
- Keep platform code in server adapters. Convex persistence, S3/filesystem content loading, Clerk identity, Next background scheduling, and the existing Storyview transport/cache/billing implementation stay outside the package. Core narration calls use a `Narration` interface.
- Move text-model charging out of `lib/ai/index.ts` into the billing adapter. Preserve existing retry, sanitation, and charge timing through the server model adapter. Keep streaming provider details outside the core.
- Retain compatibility entrypoints where existing UI, actions, compiler checks, or tools import shared helpers. Server action entrypoints remain async functions.
- Package dependencies must not import Next, Convex, Clerk, AWS, Node built-ins, web app aliases, or environment state.

## Validation

- Standalone package typecheck, import/dependency boundary check, and browser bundling.
- Deterministic game-flow parity against the pre-extraction source, including prompts, schemas, writes, access denial, rolls, NPCs, and character generation. Test independent core instances and billing errors.
- Root TypeScript, scoped lint, relevant existing wiki/runtime checks, and Next production build.
- Playwright against this worktree's server and a complete authenticated adventure playthrough using the existing test account. Use placeholder images and the isolated Convex project `d20adventures-feature-gm-core`, deployment `patient-shepherd-476`. No production data changes or CLI credential access. Shared Clerk/S3 settings stay unchanged.
- Record evidence, limitations, and final package/adapter contracts in the wiki, then commit locally.

## Progress

- [x] Create isolated worktree and Convex project.
- [x] Review dependencies and extraction boundary.
- [x] Extract core and wire server adapters.
- [x] Run package and existing app checks.
- [x] Run Playwright and authenticated full playthrough.
- [x] Update wiki and commit.

Worktree: `../d20adventures.com.worktrees/feature-gm-core`. Main and the spike worktree remain separate. Delete the isolated Convex project only after this worktree is finished.

## Results, 2026-10-02

Implemented the extraction with the existing web behavior. Runtime contracts are documented in [GM core](../gm-core.md). Twenty gameplay service modules, eight character-generation operations, reply/roll/advance orchestration, shared schemas/types, and required pure helpers now live in the package. Host adapters preserve Convex, content loading, Clerk, model behavior, billing, and narration scheduling. No Convex schema or UI changes were needed.

Validation passed:

- Package TypeScript with no Node ambient types, and root TypeScript.
- Browser bundle and dependency boundary checks.
- Recorded seven-call GM turn replay with exact prompts, JSON schemas, write ordering, narration scheduling, and saved state matching the pre-extraction source at `7ff0b2d`.
- All eight character-generation operations, including both PC and NPC schemas, matched nine recorded prompt/schema cases.
- Access denial, authenticated ownership on creation, AI companion control and execution, independent runtimes and stateful adapter methods, duplicate/stale/invalid transitions, content re-pinning, and terminal status checks.
- Server model style/sanitation, token charging, retry delays, markdown JSON cleanup, and billing errors.
- Root lint, with only two existing informational suggestions in unrelated scripts. Scoped Biome checks passed. Seventeen inherited trailing-space lines remain inside prompt literals to preserve exact output. AST inspection confirmed the Git whitespace findings are confined to those literals.
- Wiki batches A through F, all four adventure bridges, and public flow checks. Source-inspection checks now follow the moved modules. Batch F also had a stale assertion requiring content-hash rejection. It now checks the existing re-pinning behavior, with the real commit handler exercised by the new core checks.
- Next production build and all 16 Playwright auth/homepage tests.

The first Playwright attempt needed the matching Chromium download and the local Portless CA. After setup, all tests passed in 28.8 seconds against `https://feature-gm-core.d20adventures.localhost:1355`. The default privileged Portless port required sudo, so this run used port 1355. The worktree dev server and browser were stopped after validation.

### Authenticated playthrough

The existing test account completed The Midnight Summons using the real `gemini-3.5-flash-lite` server adapter, placeholder image generation, and the isolated `patient-shepherd-476` deployment. Adventure ID: `jd7d873rnvc5hxs7qet4hskmqd8fgpa6`.

| Turn | Encounter | Evidence |
|---|---|---|
| 1 | Broken Silence | Player reply, failed perception roll, advancement to the owlbear. |
| 2 | Owlbear Confrontation | Failed player attack and failed NPC attack. |
| 3 | Owlbear Confrontation | Failed stealth, successful NPC attack, persisted PC health 80. |
| 4 | Owlbear Confrontation | NPC won initiative and attacked first, PC health 60, successful stealth escape. |
| 5 | Meeting at the Stones | No-roll dialogue reply and Wollandora's authored mission explanation. |
| 6 | Meeting at the Stones | NPC dialogue, player accepted the mission without a roll. |
| 7 | Preparing for the City | Ending UI, persisted completed status, end timestamp, PC health 100. |

The final Convex read confirmed seven turns, `currentEncounterId: preparing-for-the-city`, `status: completed`, and `endedAt: 1790946630720`. No saved-state shortcuts or forced dice results were used. A dev hot reload required refreshing the browser during the run. The adventure resumed from persisted state.

These checks establish extraction parity and one complete live adventure, not broad model reliability. Live multiplayer, generated-character UI, real speech generation, desktop persistence, and other ending branches were not exercised. AI companion and billing failure paths were tested deterministically. The strict-patch and combined-request experiments remain in the spike.

Next: build the desktop shell against these interfaces. Keep the measured CLI adapters and desktop state improvements in their own implementation steps. This branch remains separate from main, with no push, merge, or production deployment.
