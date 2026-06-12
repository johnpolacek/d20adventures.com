# Gameplay Flows

[Home](index.md) · [Architecture](Architecture.md) · [Roadmap](roadmap.md)

Core runtime flows for adventure creation, join, start, and turn progression.

## Adventure Creation and Lobby

1. User selects characters and calls `createAdventure` (`app/_actions/create-adventure.ts`).
2. Adventure is created in Convex with lobby status; `contentRef` is pinned at this point.
3. For single-player eligible plans, `startAdventure` may auto-run immediately.
4. Lobby UI subscribes via Convex realtime and offers join/start controls.

## Join Adventure

1. `joinAdventure` resolves/creates user character template.
2. Convex `adventure.joinAdventure` mutation appends player assignment.
3. Route redirects to adventure view.

## Start Adventure

1. `startAdventure` loads the adventure plan via `loadAdventurePlanForRuntime` (wiki runtime for registered adventures, legacy S3 JSON otherwise).
2. Builds first-turn character roster (PCs + encounter NPCs from the start encounter).
3. Writes initial turn via `api.adventure.createTurn`.
4. User is redirected into the play route.

## Turn Loop

1. Player submits narrative reply through `processTurnReply` (`app/_actions/adventure.ts`).
2. `getRollRequirementForAction` evaluates whether a dice roll is required.
3. If a roll is needed, turn state stores roll requirements and waits.
4. Player resolves the roll through `resolvePlayerRollResult`.
5. Narrative and health/status updates are applied (including optional AI health analysis via `turn-update-service.ts`).
6. NPC turns are processed through `processNpcTurnsAfterCurrent`.
7. When the turn is complete, `advanceTurn` computes encounter progression and creates the next turn.

## Narrative Format

Narrative strings include machine-readable shortcodes:

- `[DiceRoll:...]` — preserves roll context in text history.
- Original-reply markers used in some narrative display flows.

Parser/helpers: `lib/utils/parse-narrative.ts`.

## AI Subsystem

### Entry Points

- `lib/ai/index.ts` — wrappers around `generateText`, `generateObject`, `streamObject`.
- `lib/ai/llm.ts` — current model selection.

### Token Metering

1. Most generation functions require authenticated user context.
2. Token usage is read from AI response usage metadata.
3. Debits recorded through `decrementUserTokensAction` and Convex ledger mutations.

### AI-Driven Gameplay Services

- `roll-requirement-service.ts` — infer if a check is needed and which attribute.
- `roll-modifier-service.ts` — infer/compute modifier.
- `npc-turn-service.ts` — NPC action and outcome generation.
- `turn-update-service.ts` — optional AI analysis of health/status outcomes.
- `narrative-service.ts` — narrative append/normalization logic.

## Frontend Contexts

- `AdventureContext` — setting/plan/adventure metadata.
- `TurnContext` — current turn and SSE lifecycle.
- `TokenContext` — token balance and refresh behavior.
