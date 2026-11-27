# Explicit State Machines — Multi-Step Refactor Plan

Goal: replace the codebase's highest-risk implicit state machines (clustered booleans, nullable phase fields, coordinated refs, unguarded string statuses, and overlapping timers/polls) with explicit discriminated unions, pure transition functions, `useReducer` hooks, and `AbortController`-backed controllers.

## Design Principles & Constraints

- **Match existing house style, zero new dependencies.** Use plain TypeScript discriminated unions, exhaustive `switch` statements, pure `transition(state, event)` functions, React `useReducer`, and `AbortController`. Follow existing repo templates (`CardMode`, `Moment`, `TransitionValidationResult`, `AccountState`, `HostEvent`, `Standing`). Do not introduce XState or another state-machine library.
- **Keep persisted data backwards-compatible.** Production Convex tables and local desktop SQLite saves (`apps/desktop/runtime/store.ts`) hold live records. **Never bump the desktop save `version` from `1`**—normalize older save and Convex document shapes on read, and keep new persisted fields optional.
- **One machine per commit.** Land small, isolated commits on `main` (never bundle multiple machines together), keeping typechecks and tests green after each commit to minimize merge friction with concurrent edits on `main`.
- **Respect package boundaries.**
  - `packages/gm-core`: imports nothing from Next, Clerk, or Convex; reaches outside only through `src/ports.ts`. No regex on player/model prose (`scripts/regex-check.ts`).
  - `packages/ui`: imports nothing from Next, Clerk, Convex, or site code (`node packages/ui/scripts/check-imports.mjs`). Preserve the `animationend` exit contract and reversible exits (`plans/stage-motion.md`).
  - Never edit `convex/_generated/`. Any Convex function/schema change requires John to run `! pnpm convex:deploy --yes` before shipping site changes that rely on it.
- **Coordinate on active files.** Check `git status` and `git pull --rebase --autostash` before starting any phase—especially Phase 4 (`packages/stage/src/stage.ts` frequently has concurrent edits).

---

## Phase 0: Verified Bug Fixes & Guard Rails (Fast Wins)

Land targeted fixes (with regression tests) for live bugs already exposed by implicit state, before touching broader architecture. Each item is small and independently verifiable.

| # | Target | Bug / Hazard | Concrete Fix |
| :--- | :--- | :--- | :--- |
| 0.1 | `packages/gm-core/src/services/advance-turn-finalization-service.ts:7-12` | *(Legacy-path only; wiki adventures use `commitWikiTurnAdvance`.)* `markAdventureCompleteWithoutNextEncounter` patches `endedAt` without `status: "completed"`. | Include `status: "completed"` in the patch, matching `persistTurnAndFinalizeAdventure` (L54). |
| 0.2 | `convex/adventure.ts:81-155` | The UI already guards joins, but the server mutation `joinAdventure` never checks `adventure.status === "waitingForPlayers"` or `!adventure.currentTurnId`. | Mirror the exact guard pattern from `convex/hosting.ts:74`: reject when `adventure.status !== "waitingForPlayers" \|\| adventure.currentTurnId`. |
| 0.3 | `convex/turnAudio.ts:31-127`, `convex/schema.ts` | Inside the 300s (`STALE_GENERATION_MS`) reclaim window race, `finalizeTurnAudio` / `failTurnAudio` check `storyHash` only—not `status === "generating"` or a claim token—so a timed-out worker can overwrite `"ready"` with `"error"`. | Add optional `attempt: v.optional(v.number())` to `turnAudio` (incremented on claim), return it from `claimTurnAudioGeneration`, and verify `existing.status === "generating"` (and `attempt` match when passed) in finalize/fail. Clear `segments`/`usage` on fail. |
| 0.4 | `apps/desktop/runtime/host.ts:247-265`, `host-main.ts:17-97` | `follow()` clears `offerUntil = null` before `try` (stalling permanently on transient network error at reaction expiry) AND sets `followed = key` before `await opts.post(jobs, { op: "queue", ... })` (suppressing retries if the `"queue"` post fails). `host-main.ts` shares one `wake` closure overwritten by concurrent `paintHero` retries and deletes `scratch` while `paintHero` may still run. | Keep `offerUntil` intact when `follow()` fails, and set `followed = key` only after the `"queue"` post succeeds (or clear it in `catch`). Replace `wake` with an `AbortController` passed to `wait(ms, signal)`, and **abort** active `paintHero` tasks on shutdown before `rmSync(scratch)`. |
| 0.5 | `apps/desktop/runtime/cli.mjs:183,250-258`, `sessions.mjs:188,263`, `llm.ts:19-67` | `ClaudeSession.fail(reason)` calls `close()`, whose `child.on("close")` overwrites `this.failure` with `"process_exited"`; `AntigravitySession.close()` mid-init leaks a child; `localLlm` retries can spawn after `close()`. | Add `this.closed` guard + `this.failure ??= reason` in `ClaudeSession`; track closed state before/after `await antigravityModel()` in `AntigravitySession`; track `closed` flag in `localLlm`. |
| 0.6 | `components/adventure/turn-advance-button.tsx:13-33` | `hasClicked` is never reset when `advancing` flips back to `false` on error, permanently bricking the button on `"Advancing..."`. | Remove `hasClicked` and drive disabled/label state purely from `advancing` (or an explicit `advanceState` prop from `useTurnActions`). |
| 0.7 | `packages/ui/src/stage/narration.tsx:149-325` | Stepping back sets `stayed = true` while `paused` stays `false`; clicking Play/Pause only toggles `paused` and never clears `stayed`, leaving auto-advance stuck while showing the Pause icon. | Keep `paused` and `stayed` separate (constraints: `paused` may be controlled via `pausedProp`/`onPause` and pauses voice narration too; stepping back deliberately holds auto-Continue while letting voice narration read on). Make clicking Play/Pause clear `stayed` when held (and reflect the held state on the Play/Pause control). |
| 0.8a | `components/adventure/dice-roll.tsx:33-52` | Re-entering `handleRoll` while `rolling === true` (e.g. via keyboard Enter/Space) overwrites `intervalRef.current` without clearing the prior `setInterval`, leaking an uncancellable interval and double-firing `onRoll`. | Guard `handleRoll` with an explicit `"idle" \| "rolling" \| "landed"` state (early return unless `"idle"`) and clear any existing interval defensively. |
| 0.8b | `packages/stage/src/effects.ts:184-296` | `Effects.clear()`/`dispose()` resolves `missile()`'s flight promise, causing `.then()` to emit `"land"` and spawn `burst()`/`impact()` post-dispose. | Resolve `Effects.add()` with `"completed" \| "cancelled"` and bail out of `missile()`'s `.then()` on `"cancelled"`. |

**Verification for Phase 0:**
- `pnpm test:gm-core && pnpm --filter @d20/gm-core test && pnpm --filter @d20/gm-core check`
- `pnpm --filter @d20/desktop test && pnpm --filter @d20/desktop check`
- `pnpm --filter @d20/ui check && pnpm --filter @d20/stage check`
- `pnpm build` (or root `npx tsc --noEmit` after clearing stale `.next/types` if needed) to typecheck the `components/` fixes (`0.6`, `0.8a`).
- Add unit tests for 0.1, 0.4, 0.5, 0.8b. Note: 0.2 and 0.3 touch `convex/` and need `! pnpm convex:deploy --yes` before prod relies on them.

---

## Phase 1: Core Gameplay State Machines (`packages/gm-core` + `convex/`)

Make the domain state machines explicit first so desktop and web clients can rely on clean invariants downstream.

### 1A. Per-Character Turn-Slot Lifecycle (Locked: Option b — Lossless Union)
- **Context:** Today, a hero who completed their turn and a hero skipped because they were down/incapacitated/fled/unaddressed are persisted identically (`isComplete === true`). Any redesign must account for **all** writers and readers across the repo:
  - **Core writers:** `wiki-adventures/characters.ts`, `sheet/summoned.ts`, `sheet/death.ts`, `sheet/classes/barbarian.ts`, `services/adventure-roll-result-service.ts`, `services/npc-turn-service.ts`, `services/npc-turn-effects-service.ts`, `services/npc-turn-branch-service.ts`, `services/advance-turn-builder-service.ts`.
  - **Extra writers outside `gm-core`:** `convex/adventure.ts` (`createAdventureWithFirstTurn`, `submitReply`), `lib/wiki-adventures/start.ts`, `apps/desktop/runtime/characters.ts` (fled hero written as `hasReplied: false, isComplete: true`), `apps/desktop/runtime/host.ts` (skip), `apps/desktop/runtime/game.ts` (skip), `apps/desktop/runtime/store.ts` (local `submitReply`), `components/adventure/character-selection.tsx`, `components/adventure/turn-narrative-reply.tsx` (demo reply).
  - **Key readers:** `utils/turn-actors.ts`, `services/npc-turn-intent-service.ts`, `sheet/stat-block-actions.ts:401` (`!!now.isComplete`), `components/adventure/turn-narrative*.tsx`.
- **Design (Option b):**
  ```ts
  export type TurnSlot =
    | { phase: "pending" }
    | { phase: "awaiting_roll"; required: RollRequirement }
    | { phase: "complete"; rollResult?: number }
  ```
  `slotOf(character)` and `withSlot(character, slot)` in `packages/gm-core/src/sheet/turn-slot.ts` are lossless over the 4 persisted flags (`hasReplied`, `isComplete`, `rollRequired`, `rollResult`) with zero schema changes. Route all core guards, writers, and `submitReply` / `resolvePlayerRollResult` phase checks through `slotOf` / `transitionTurnSlot` / `withSlot`, fixing `playsForMaster` in `buildNpcInitiativeOrder` and preventing `submitReply` overwrites on completed or mid-roll slots.

### 1B. Legacy Turn Advance Banished-Character Fix (Scoped)
- **Files:** `packages/gm-core/src/services/advance-turn-builder-service.ts:47, 79`, `packages/gm-core/src/utils/turn-actors.ts`.
- **Design:** Scope strictly to `buildNextTurnFromProgression` (`buildContinuingEncounterTurn` L47 and `buildTransitionEncounterTurn` L79): distinguish temporary `isAway(c)` (Banishment/Maze) from permanent `c.fled === true` (matching `orchestration/advance-turn.ts:210`) so banished/mazed characters are not dropped on legacy round advance.

### 1C. Adventure Lifecycle & Reaction Suspend/Replay
- **Files:** new `convex/lib/adventure-transitions.ts`, `convex/adventure.ts`, `convex/turns.ts`, `convex/schema.ts`, `packages/gm-core/src/sheet/reactions.ts`, `packages/gm-core/src/services/npc-turn-service.ts`, `packages/gm-core/src/orchestration/adventure.ts`, `lib/host/server.ts`.
- **Design:**
  - Centralize adventure status transitions behind an `ALLOWED` table (`waitingForPlayers → active`, `active → active | completed`, `completed → []`), and reject `commitWikiTurnAdvance` on `"completed"` adventures.
  - Delete unused duplicate `convex/adventure.ts:updateTurn`. Merge `createTurn` and `patchAdventure` between `convex/adventure.ts` and `convex/turns.ts` **only while preserving their extra fields** (`isFinalEncounter` in `turns.ts:createTurn`; `voiceAssignments` and `arrivals` in `adventure.ts:patchAdventure`).
  - Type `turns.reaction` as a union that **still accepts the existing untagged shape** (with `status` optional on read) so in-flight turns stay readable.
  - Merge the three reaction-answer guards (`orchestration/adventure.ts:answerReaction`, `lib/host/server.ts:queueAction`, and `npc-turn-service.ts`) into one pure helper in `gm-core` checking `offer.to === characterId && answer === undefined && now < expiresAt`, and clear `reaction: null` whenever the offering NPC becomes ineligible or `exitMet` closes the round.

### 1D. `TurnReading` Primary Outcome Union
- **Files:** `packages/gm-core/src/services/roll-requirement-service.ts`, `packages/gm-core/src/validations/roll-requirement-schema.ts`, `packages/gm-core/src/sheet/attack-roll.ts`, `orchestration/adventure.ts`, `services/npc-turn-branch-service.ts`, `services/ai-pc-turn-service.ts`, `services/adventure-turn-reply-service.ts`.
- **Design:** Replace the 6 mutually-exclusive optional fields on `TurnReading` (`roll`, `cast`, `feature`, `action`, `rest`, `ruling`) with `primary: PrimaryReading` discriminated by `kind` (`none | roll | cast | feature | action | rest | ruling`) so human PC, AI PC, and NPC orchestrators share one exhaustive `switch`. Replace `.catchall(z.unknown())` on `RollRequirement.after` with a closed typed structure.

**Verification for Phase 1:**
- `pnpm test:gm-core && pnpm --filter @d20/gm-core test && pnpm --filter @d20/gm-core check`
- `pnpm --filter @d20/desktop test && pnpm --filter @d20/desktop check`
- `pnpm test:store`
- Wiki bridge checks (`pnpm test:wiki-adventures:midnight-bridge`, etc.).
- New unit tests in `packages/gm-core/test/sheet/` covering 1A guards/transitions, 1B banished round advance, and 1C reaction-answer guard.

---

## Phase 2: Hosted Multiplayer Protocol & Desktop Runtime (`convex/hosting.ts`, `lib/host/`, `apps/desktop/runtime/`)

### 2A. Unified Table Seating Policy Machine
- **Files:** new `packages/gm-core/src/host/seating.ts` (imported via relative paths from `convex/` and workspace import from `lib/host/`), `convex/hosting.ts`, `convex/adventure.ts`, `lib/host/seats.ts`, `lib/host/server.ts`.
- **Design:**
  - Define pure `TableSeating` (`mode: "fixed" | "flex" | "pick_first"`) and pure seat transition helpers (`joinHeldSeat`, `requestOpenSeat`, `answerSeatRequest`, `removeGuest`, `seatHostAtStart`) normalized on read from existing `adventures.host` records.
  - Eliminate the 4-way duplication of `openLeft`, `brought`, and limit checks across `convex/hosting.ts`, `convex/adventure.ts`, `lib/host/seats.ts`, and `lib/host/server.ts`.
  - Add `lib/host/*.test.ts` to `test:store` in root `package.json`.

### 2B. Hosted GM Job Scheduler & Paint Upload Protocol
- **Files:** `convex/hosting.ts`, `convex/schema.ts`, `lib/host/server.ts`.
- **Design:**
  - Extract a pure `selectNextJob(running, queued, now)` scheduler for the 3 priority lanes (`actions > suggest > paint`, max 1 non-paint + 1 paint running).
  - Replace `.take(20)` dedupe scan in `queueJob` with an indexed query on active (`queued` / `running`) jobs.
  - Track uploaded `ArtKind`s (`"front" | "back" | "portrait"`) on running `paint` jobs and verify all 3 exist before `paintedArt` writes S3 paths to the hero sheet.
  - Return a status indicator from `finishJob` so callers know when a job was already abandoned.

### 2C. Desktop Runtime Host Worker & Per-Call Inference Guard
*(Cut: shared `SessionMachine` across the 4 CLI providers—Phase 0.5 fixes the actual failure/close/zombie bugs without rewriting working provider transports.)*
- **Files:** `apps/desktop/runtime/host.ts`, `apps/desktop/runtime/host-main.ts`, `apps/desktop/runtime/game.ts`.
- **Design:**
  - Formalize `host.ts`'s worker loop around `HostWorkerPhase` (`starting | idle | working | offline | stopping`) with explicit reaction-expiry retry state.
  - Scope `inferenceFailure` per command invocation in `game.ts` (matching `host.ts`).

**Verification for Phase 2:**
- `pnpm --filter @d20/desktop test && pnpm --filter @d20/desktop check`
- `pnpm test:gm-core && pnpm test:store`
- Add runtime unit tests in `apps/desktop/runtime/` for `host.ts` reaction-expiry recovery (including failed `"queue"` post) and `selectNextJob` priority/concurrency rules.

---

## Phase 3: Desktop App UI Orchestration (`apps/desktop/src/`)

Run **3A**, **3B**, and **3C** as separate efforts, landing **one small machine per commit**.

- **Test runner prerequisite:** Widen `@d20/desktop`'s `test` script in `apps/desktop/package.json` from `tsx --test runtime/*.test.ts runtime/*.test.mjs` to also run `src/*.test.ts`.

### 3A. `StagePlay` Playback Reducer (Effort 1)
- **Files:** new `apps/desktop/src/playback-machine.ts`, `apps/desktop/src/stage-play.tsx`.
- **Design:**
  - Replace the coupled reading/roll-hold/past-round `useState`s and refs (`previousText`, `redraw`, `land`, `resume`, `onScreen`, `viewing`, `held`, `paused`, `levelLater`, `continued`) with a pure `useReducer`:
    ```ts
    type PlaybackState =
      | { phase: "reading"; turnId: string; paragraph: number; paused: boolean; prowlingKey: string | null; seen: SeenSnapshot; returnTo?: ReturnCursor }
      | { phase: "interactive"; turnId: string; seen: SeenSnapshot; levelDeferredTurnId: string | null }
      | { phase: "roll_resolving"; turnId: string; roll: HeldRoll; seen: SeenSnapshot }
      | { phase: "roll_verdict"; turnId: string; roll: HeldRoll; resumeParagraph: number; seen: SeenSnapshot }
      | { phase: "levelling"; turnId: string; heroId: string; seen: SeenSnapshot }
    ```
  - Eliminate render-time `previousText.current` reads and forced `redraw(n => n + 1)` calls.

### 3B. `StageChoreographer` Extraction (Effort 2)
- **Files:** new `apps/desktop/src/stage-choreographer.ts`, `apps/desktop/src/stage-play.tsx`.
- **Design:**
  - Move the 14 stage refs and 7 chained `useEffect`s (entrances, exits/deaths, weapons/props/FX, strolls/walks, camera framing) into a `StageChoreographer` class owned per `Stage` instance via one `useEffect` with `dispose()`.
  - Explicit `CameraPhase` (`unframed | preview | establish_hold | paragraph | actor | manual`) and per-cast `ActorChoreographyState`, each owning an `AbortController` for timers and async walk loops.
  - Subscribe to `stage`'s active-shot changes via callback instead of the 1-second `setInterval(() => redraw(...), 1000)` poll.

### 3C. `DesktopGame` Route / Poller & Scene File Download Scheduler (Effort 3)
*(Cut: speculative rewrites of `account.tsx`, `new-game.tsx`, `hero-creator.tsx`, `pages.tsx`, and `hosted.ts`—only touch those if targeting a specific reproduced bug.)*
- **Files:** `apps/desktop/src/play.tsx`, `apps/desktop/src/files.ts`.
- **Design:**
  - `play.tsx` (1 commit): Single `AppRoute` discriminated union (`booting | gate | menu | setup | local_play | hosted`), sequential `AbortController` host poll loop active *only* in `route.kind === "hosted"` (fixes poll continuing after `acct.gated` and overlapping polls racing `act()`), plus an explicit `CommandQueue` (`idle | shown | writing | quiet`).
  - `files.ts` (1 commit): Priority download scheduler (foreground preempts background without 250ms busy-poll) + generation/`AbortSignal` check before each batch so encounter switches cancel stale batches immediately.

**Verification for Phase 3:**
- `pnpm --filter @d20/desktop check && pnpm --filter @d20/desktop test && pnpm --filter @d20/desktop build`
- Pure reducer tests in `apps/desktop/src/playback-machine.test.ts`.
- Manual / recorded check in dev app (`pnpm dev:app`; ask John before any Claude-spending playthrough).

---

## Phase 4: 3D Stage Engine (`packages/stage/src/`)

*Prerequisite: pull latest `main` and confirm no conflicting active edits in `packages/stage/src/stage.ts`. Land one machine per commit.*

- **Test runner prerequisite:** Add a `test` script (`tsx --test src/*.test.ts`) to `packages/stage/package.json`.

### 4A. `BeatPlayer` Explicit Machine
- **Files:** `packages/stage/src/beats.ts`.
- **Design:** Replace the 11 control fields with a discriminated `PlaybackState` (`idle | running | rushing | atGate | skipping | jumping`), a monotonic `runToken` checked after every `await` (including `lineSeconds`/`narrationSeconds`), a single cancellable waiter owned by `transition()`, re-entrancy cancellation on `play()`, and an explicit `setMode()` transition.

### 4B. `CameraController` & `ScreenCurtain`
- **Files:** new `packages/stage/src/camera-controller.ts`, new `packages/stage/src/curtain.ts`, `packages/stage/src/stage.ts`, `packages/stage/src/look.ts`.
- **Design:**
  - `CameraController`: discriminated rig (`free | tripod`) and motion mode (`idle | gliding | cutting | driving | panning | userLook`). Guarantee `settleWaiters` resolution on every exit—including `OrbitControls.start`, `LookControls.start`, and `dispose()`—cancel `takeMove` on user input, and preserve director modifiers on occlusion retakes.
  - `ScreenCurtain`: explicit `lit | fadingToDark | dark | disposed` owning `canvas.style.opacity` for both `cut` and `dip`, cancelling all timers/promises on `dispose()`.
  - `LookControls` (separate small commit): explicit `idle | drag | pinch` pointer gesture union fixing the 3→2 finger pinch zoom jump.

### 4C. `StageLifecycle` & Loader Cancellation
- **Files:** `packages/stage/src/stage.ts`, `packages/stage/src/figures/cards.ts`, `packages/stage/src/figures/models.ts`, `packages/stage/src/figures/standees.ts`, `packages/stage/src/backdrop.ts`, `packages/stage/src/materials/library.ts`.
- **Design:**
  - Explicit `StageLifecycle` (`initializing | loading(abort) | warming(framesLeft) | active | suspended(reasons) | disposed`), threading `AbortSignal` into all async loaders so post-`dispose()` completions never touch WebGL resources or start rAF.
  - Replace `CardLayer.loading`/`ready` booleans with `{ kind: "idle" | "loading" | "ready" | "failed" }` (reset on error in `finally`) and await the promise directly instead of `waitForAtlas()`'s 50ms poll.
  - Add `.catch` in `Standees.load()`, dispose `Models.room` PMREM texture on `dispose()`, and settle `firstFrame` cleanly on `dispose()`.

### 4D. Targeted Bug-Backed Actor & Lighting Fixes (Split — Ship Only Named Bugs)
Ship each as its own small commit, strictly tied to a verified bug:
1. **Per-actor `HandPropMachine`** (`models.ts`, `stage.ts`): Replace global `stage.handing` counter (which lets hand-off C→D cancel A→B and corrupt `handingNow`) with per-actor generation tokens, finger-open cleanup on side switch, and `disposeProp()` GPU disposal.
2. **Weapon bow `aimed` reset** (`figures/hold.ts`): Reset `aimed = null` in `wield().show()` so subsequent shots/rests don't inherit stale bow orientation.
3. **Room-to-room lighting crossfade** (`stage.ts:1821-1845`): Explicit `outdoors | indoors(room) | transition(from, to, progress)` fixing the 1-frame lighting snap when moving directly between two rooms.
*(Defer speculative `CastState` extraction and `QueueLoop` refactors unless paired with a concrete bug.)*

**Verification for Phase 4:**
- `pnpm --filter @d20/stage check && pnpm --filter @d20/stage test`
- `pnpm stage:plans:check && pnpm stage:check && pnpm stage:director`
- `pnpm packages:check`
- Spot-check `/dev/stage` and `/dev/turn`.

---

## Phase 5: Web Frontend, Audio & Shared UI (`packages/ui/src/`, `components/`, `lib/context/`)

Land one machine per commit.

- **Test runner prerequisite:** Add a `test` script (`tsx --test src/**/*.test.ts`) to `packages/ui/package.json`.

### 5A. Shared Sound & Stage UI Primitives (`packages/ui/src/`)
*(Cut: `presence.tsx` and `leaving.tsx`—they are small and deliberate. Constraint: keep the `animationend` exit contract and reversible exits from `plans/stage-motion.md`.)*
- **Files:** `packages/ui/src/sound/narrator.ts`, `narrator-web.ts`, `ambience.ts`, `stage/use-stage.ts`, `stage/d20.tsx`, `stage/roll-result.tsx`, `stage/prompt-card.tsx`.
- **Design:**
  - `sound/narrator.ts`: explicit `speak()` phase (`buffering | playing | paused | stopped`) clearing the 60s `stalled` timeout on `stop()`.
  - `sound/narrator-web.ts`: add `worker.onerror`/`onmessageerror` transitioning to `"failed"` and rejecting pending `waiting` promises.
  - `sound/ambience.ts`: per-bed `status: "loading" | "playing" | "fading" | "disposed"` and stop the 500ms interval when `playing.length === 0`.
  - `stage/use-stage.ts`: `StageState` union (`idle | building | ready | error`) + cover controller (`none | holding | fading(timer)`).
  - `stage/d20.tsx`, `roll-result.tsx`, `prompt-card.tsx`: single rAF motion mode (`idle | tumbling | settled`) in `D20Solid`, named `RollPhase` in `RollResult`, `ContestPhase` in `ContestRoll`.

### 5B. Web Adventure Play, SSE, Storyview & Lobby (`components/`, `lib/context/`, `app/`)
- **Files:** `components/adventure/turn-narrative-reply.tsx`, `use-turn-actions.ts`, `turn-narrative.tsx`, `components/views/adventure-home-content.tsx`, `lib/context/TurnContext.tsx`, `components/adventure/storyview/use-storyview-player.ts`, `storyview-overlay.tsx`, `components/adventure/adventure-lobby.tsx`, `components/hosted/hosted-play.tsx`, `components/adventure/game-chat.tsx`, `app/desktop/link/link-desktop.tsx`, `components/views/choose-character-view.tsx`.
- **Design:**
  - `TurnNarrativeReply`: keyed `useReducer` (`composing | generating | submitting | awaitingServer | awaitingRoll | submittingRoll`) rendering errors in both `composing` and `awaitingRoll`, preventing simultaneous `<CharacterDiceRoll>` + `<LoadingAnimation>`, and aborting `streamText` on submit/unmount.
  - `TurnContext`: explicit `TurnStreamState` (`historical | idle | connecting | open | backoff(attempt) | exhausted`) — always `es.close()` before scheduling backoff, always cancel backoff timer before connecting, remove `initialTurn` from SSE effect deps. Consolidate `ensureNpcProcessed` + reaction-expiry nudging into one `useTurnDriver` hook.
  - `useStoryviewPlayer`: hierarchical `useReducer` (`closed | fetching | generating(attempts) | error | ready(segments, playback)`), isolating poll vs dwell timers, bounding poll attempts, entering `playing` directly on `MANIFEST_READY`.
  - `AdventureLobby` & `HostedPlay`: derived `GuestView` + single `mutation` union + sequential `AbortController` pollers with sequence guards so slow polls never overwrite optimistic mutations.
  - `GameChat`, `LinkDesktop`, `ChooseCharacterView`: single `EventSource` in `GameChat` with explicit `history`/`sendState`; step unions in `LinkDesktop` and `ChooseCharacterView`.

**Verification for Phase 5:**
- `pnpm --filter @d20/ui check && pnpm --filter @d20/ui test`
- `pnpm --filter @d20/desktop check` (since desktop imports `@d20/ui`)
- `pnpm build` (runs `packages/ui/scripts/check-imports.mjs && next build`)
- `pnpm test:store`
- Ask John before running full Playwright suite (`pnpm test`), or run targeted Playwright specs on `/dev/dice`, `/dev/turn`, and web demo play.

---

## Validation Status & Remaining Open Decisions

- **Answered (Convex bundler import boundary):** Shared pure seating helpers (Phase 2A) belong in `packages/gm-core` using relative imports from `convex/`.
- **Answered (Intentional semantics vs. bugs in Phase 0):** Verified—0.1 is legacy-only, 0.2 mirrors `convex/hosting.ts:74`, 0.4 includes the `"queue"` post case and aborts (not awaits) `paintHero`, 0.7 preserves controlled `pausedProp` and voice-continues-on-back, and 0.8a fixes the leaked `setInterval`.
- **Answered (Commit granularity):** Promoted to a top-level rule—**one machine per commit**, with 3A/3B separated and 4D/3C/5A trimmed to bug-backed work.
- **Answered (`scripts/regex-check.ts` & `packages/ui` import checks):** No planned module introduces disallowed imports or unapproved regex patterns.
- **Answered (Phase 1A choice):** Locked on **Option (b)** — narrow lossless `TurnSlot` union (`pending | awaiting_roll | complete`) over today's 4 persisted flags.
- **Open — Missed-machines sweep:** The validation pass did not sweep for implicit state machines absent from the initial audit.
