# Stage 5 - LLM Context And Gameplay Flow
[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 5.** Redesign the AI Game Master around retrieved wiki context and Convex session state instead of rigid AdventurePlan JSON fields. Reader goal: after a couple of minutes, know which prompt and gameplay contracts need to change for wiki-first sessions.

## Stage Units

### Unit 01 - Context assembly
Specify the prompt packet: current encounter markdown, encounter summary, linked encounters, relevant NPC/location profiles, character sheet snapshots, recent turns, current character state, active rolls, and adventure-wide summary.

**Verification:** Prompt packet has token-budget rules and deterministic source ordering.

### Unit 02 - Transition model
Define how the LLM proposes encounter transitions, how the app validates them against the encounter graph, and how Convex records movement as part of the evolving Adventure wiki record.

**Verification:** Transitions work without old JSON AdventurePlan encounter arrays or a separate event-sourcing model.

### Unit 03 - Dice and narrative compatibility
Preserve simple D20 roll semantics, narrative markers, shortcodes, NPC turns, health/status effects, reports, and readable turn history.

**Verification:** Existing gameplay affordances are either retained, deliberately replaced, or explicitly deferred.

### Unit 04 - Realtime session model
Define Convex tables/functions for live adventure state in the new model: session, participants, current encounter, turns, chat, mutable character state, roll state, and generated history.

**Verification:** Convex owns sync, not authored adventure source content.

## Unit 01 Decision - Context Assembly Contract

The LLM gameplay prompt should be assembled from a typed context packet, not directly from source markdown files and not from the old nested `AdventurePlan.sections[].scenes[].encounters[]` shape. The packet combines pinned published content artifacts from Stage 4 with mutable Convex session state. Source markdown remains author-facing; runtime prompt assembly uses compiled sections, graph data, entity records, and session snapshots.

**Context packet sources:**

- **Content reference.** Always include `settingId`, `adventureId`, `contentVersion`, `contentHash`, and `currentEncounterId`. This prevents a live session from accidentally mixing content from different published versions.
- **Compiled adventure source.** Read `manifest.json` for adventure title, summary, tone, start encounter, and global constraints; `encounters.json` for the active encounter; `entities.json` for linked NPC, location, item, faction, and asset profiles; `character-sheets.json` for relevant baseline sheets; `graph.json` for legal transition targets; and `retrieval-index.json` for deterministic linked-context selection.
- **Live session source.** Read Convex for the current adventure instance, current turn order, current encounter turn count, recent turns, narrative summary, most recent action or narrative block, active roll, participant list, and mutable `TurnCharacter` records.
- **Output contract.** The model must return player-facing `narrative`, a candidate `nextEncounterId`, and an `adventurePatch` that updates the live Adventure wiki record. The patch is backend state, not a player-visible wiki UI.

## Deterministic Source Order

1. Content/version guard: setting, adventure, content version, hash, and current encounter.
2. Adventure summary from `manifest.json`.
3. Current encounter title, summary, intro, GM notes, checks, transition rules, rewards, map notes, and image references from `encounters.json`.
4. Legal transitions from `graph.json`, ordered exactly as authored.
5. Directly linked location, NPC, item, faction, premade profile, and asset records from `entities.json`.
6. Relevant baseline PC/NPC sheets from `character-sheets.json`, limited to characters present or referenced in the active encounter.
7. Live `TurnCharacter` state, active roll state, current turn order, encounter turn count, recent turns, and narrative summary from Convex.
8. Model rules and response schema.

## Token Budget Rules

- Always include the current encounter intro, instructions or GM notes, checks, transition rules, and legal target IDs.
- Include one-hop linked records first. Avoid broad setting lore unless the active encounter links to it or the retrieval index marks it as required.
- Include recent turn history using the current behavior as the baseline: last five turns, plus a summarized older history when available.
- Include live character state before baseline character sheets. Baselines provide rules and defaults; Convex provides the truth for damage, spell use, effects, inventory changes, and temporary state.
- Include GM-only secrets in the private model packet only. Never expose those sections directly to player-visible UI or generated player-facing context.
- Do not include raw markdown in runtime prompts by default. Use extracted compiled sections so validation, redaction, and token budgeting remain predictable.

## Packet Shape

```ts
type LlmGameplayContextPacket = {
  contentRef: {
    settingId: string
    adventureId: string
    contentVersion: string
    contentHash: string
    currentEncounterId: string
  }
  adventure: {
    title: string
    summary: string
    tone?: string
    startEncounterId: string
  }
  currentEncounter: {
    id: string
    title: string
    summary?: string
    intro: string
    gmNotes?: string
    secrets?: string
    checks?: EncounterCheck[]
    transitions: EncounterTransition[]
    rewards?: string[]
    mapNotes?: string
    locationId?: string
    npcRefs: string[]
    imageRefs: string[]
  }
  linkedContext: {
    locations: RuntimeLocation[]
    npcProfiles: RuntimeNpcProfile[]
    characterProfiles: RuntimeCharacterProfile[]
    items: RuntimeItem[]
    factions: RuntimeFaction[]
    assets: RuntimeAsset[]
  }
  characters: {
    live: TurnCharacter[]
    baselines: CharacterSheetBaseline[]
    activeCharacterId?: string
  }
  session: {
    adventureInstanceId: string
    currentTurnOrder: number
    currentEncounterTurnNumber: number
    recentTurns: RuntimeTurnSummary[]
    narrativeSummary?: string
    mostRecentAction?: string
    activeRoll?: RuntimeRollState
  }
  graph: {
    legalTransitions: EncounterTransition[]
    currentEncounterLinks: RuntimeLink[]
  }
  outputContract: {
    allowedNextEncounterIds: string[]
    responseShape: "nextEncounterId+narrative+adventurePatch"
    playerCharacterNames: string[]
  }
}
```

## Adventure As Evolving Wiki Instance

**Runtime clarification.** The relaunch has two distinct wiki models. An **Adventure Plan** is the authored template: S3 source files, compiled published artifacts, and validation reports. An **Adventure** is a live playthrough instance of an Adventure Plan, controlled by the AI GM and updated by player chat/actions, rolls, and generated consequences. The Adventure Plan stays pinned and read-only during play. The live Adventure evolves its own backend wiki-like record in Convex.

**Adventure wiki runtime model:**

- **Plan wiki.** S3-authored source and published artifacts define the starting world, encounters, entities, character baselines, legal graph, and retrieval records. They are reusable across many Adventures and do not mutate because players act.
- **Adventure wiki.** Convex stores the live playthrough record: current encounter, turn snapshots, mutable character state, discovered facts, changed locations/NPCs/items, open threads, generated lore, summaries, and transition decisions. This is the evolving truth for one Adventure instance.
- **Player surface.** Players continue using chat/action/reply and dice surfaces. They should not need to know wiki pages, files, or graph structures exist. Their responses cause backend state updates through AI GM interpretation and guarded mutations.
- **Forking later.** A completed Adventure wiki is a playthrough record. A future authoring feature may review one or more playthroughs and fork/revise the Adventure Plan, but that is explicit authoring work, not automatic plan mutation.

## AI GM Adventure Patch Contract

Turn advancement should evolve more than a chat log. The AI GM response should include a structured patch that the application validates and applies to the live Adventure record after transition and stale-session guards pass.

```ts
type AiGmTurnResult = {
  nextEncounterId: string
  narrative: string
  adventurePatch: {
    summaryDelta?: string
    discoveries?: Array<{
      id: string
      type: "fact" | "location" | "npc" | "item" | "faction" | "quest" | "lore"
      title: string
      text: string
      visibility: "player" | "gm"
      sourceEncounterId?: string
    }>
    entityUpdates?: Array<{
      entityType: "location" | "npc" | "item" | "faction" | "quest" | "lore"
      entityId: string
      patchText: string
      visibility: "player" | "gm"
    }>
    characterUpdates?: Array<{
      characterId: string
      healthPercent?: number
      status?: string
      effectChanges?: string[]
      inventoryChanges?: string[]
      spellUseChanges?: string[]
    }>
    openThreads?: Array<{ id: string; title: string; text: string }>
    resolvedThreadIds?: string[]
    transition?: {
      fromEncounterId: string
      toEncounterId: string
      reason: string
    }
  }
}
```

The patch is not applied blindly. Application code validates transition target, expected current turn, expected current encounter, content reference, player authorization, and allowed mutation fields. Character mechanics remain bounded by existing lightweight D20 rules and `TurnCharacter` compatibility.

## State Precedence

| Question | Rule |
| --- | --- |
| Which character state wins? | `TurnCharacter` in Convex wins over pinned published JSON sheet baselines, and sheet baselines win over markdown profile prose. |
| Can source sheets reset live session state? | No. Published character JSON sheets are copied into session state when a character enters play. During play, damage, spell slots, effects, prepared state, inventory mutations, death saves, and temporary flags mutate only Convex session records. |
| Can the LLM invent transition targets? | No. `nextEncounterId` must be the current encounter ID or one of the legal transition IDs supplied by `graph.json`. |
| Can the LLM write player choices? | No. Preserve the current guardrail: generated narrative can describe NPC actions, environment changes, and consequences of past player actions, but not new player decisions, dialogue, or internal thoughts. |
| Should chat be included? | Default no for Unit 01. Include explicit gameplay turns and a curated narrative summary. Raw chat can be considered in Unit 04 if it becomes part of the realtime session model. |
| Should embeddings be required? | Default no for v1. Use deterministic graph and typed-link retrieval first. Embeddings can be added later for authoring help or broad lore recall, but should not be necessary for core turn advancement. |

## Current Prompt Compatibility

The existing `advance-turn-prompt-service.ts` behavior should be preserved while changing its inputs and extending its output. The current service already establishes several good contracts: last-five-turn context, dice roll extraction, transition options as the definitive guide, encounter turn counts, player-character guardrails, classic fantasy prose constraints, and JSON output containing `nextEncounterId` and `narrative`. Stage 5 should replace the old section/scene/encounter lookup with the context packet above, then add `adventurePatch` so each turn can evolve the live Adventure wiki record.

**Verification:** Unit 01 is complete when a future implementation can build a packet from pinned Stage 4 artifacts plus Convex Adventure state, feed it to the AI SDK turn advancement call, verify that the model can only continue the current encounter or choose a legal transition target, and validate a structured patch for the evolving playthrough record.

## Unit 02 Decision - Transition Validation Contract

The LLM may propose a transition, but it does not directly move the session. Application code validates the proposed `nextEncounterId` against the pinned `graph.json`, the current encounter ID stored in Convex, and the session's pinned content reference. Only a valid transition can update the live session's current encounter.

**Transition authority model:**

- **Authoritative graph.** `graph.json` is the source of truth for legal encounter-to-encounter movement at runtime. Published gameplay bundles should never contain unresolved transition targets. Draft preview playthroughs may contain unresolved nodes, but preview transition attempts into unresolved targets must be blocked with an editor-facing validation message.
- **Authoritative Adventure.** Convex stores the current encounter, current turn order, current content reference, and evolving Adventure wiki record. The transition validator must compare the LLM packet's `currentEncounterId` with the live Adventure before applying a result.
- **Model role.** The model evaluates whether a transition condition appears satisfied and returns a candidate `nextEncounterId` plus bridge or continuation narrative. It should also preserve the current encounter ID when no legal transition condition is met.
- **Application role.** The application parses the model response, rejects malformed JSON, validates the target, decides whether the transition commits, records the decision, and emits the resulting turn state to subscribed clients.

## Runtime Flow

1. Load the live session from Convex and confirm the session is pinned to a content version or preview draft ID.
2. Load `graph.json` from that pinned content reference and derive `allowedNextEncounterIds` for the live `currentEncounterId`.
3. Assemble the Unit 01 context packet using the live current encounter and legal transition list.
4. Call the AI SDK turn advancement flow and request structured JSON containing `nextEncounterId`, `narrative`, and `adventurePatch`.
5. Parse and validate the response. If JSON parsing fails, retry once with a repair prompt or fail the turn with a recoverable error.
6. If `nextEncounterId` equals the current encounter ID, record a non-transition turn and keep the session location unchanged.
7. If `nextEncounterId` is in `allowedNextEncounterIds`, commit the transition inside the turn's adventure patch and set the Adventure's current encounter to the target.
8. If `nextEncounterId` is not allowed, reject the transition target. Default to the current encounter only if the narrative can be safely treated as a continuation; otherwise surface a recoverable GM generation error.

## Transition Validation Rules

| Case | Runtime behavior |
| --- | --- |
| Target is current encounter | Allowed. Record no transition and continue the encounter. |
| Target is a graph edge from current encounter | Allowed. Commit transition after recording the generated turn. |
| Target exists elsewhere but is not an outgoing edge | Reject. Do not jump across the graph unless an admin/debug override exists outside normal gameplay. |
| Target does not exist in published bundle | Reject. This should be impossible after publish validation, so record telemetry and generation failure context. |
| Target is unresolved in preview bundle | Reject for playthrough movement and show an editor-facing warning that the transition target needs a stub or real encounter. |
| Response omits `nextEncounterId` | Recoverable generation failure. Retry with explicit schema repair, then fail without mutating state if still invalid. |
| Session changed while LLM was running | Reject stale result by comparing current encounter, turn order, and content reference. Rebuild context and retry only if the caller still owns the turn. |

## Compiled Transition Shape

Stage 4 can keep richer authoring metadata in `graph.json` than the model receives. The prompt should get concise options, while application code gets enough data to validate and record the movement.

```ts
type RuntimeEncounterTransition = {
  id: string
  fromEncounterId: string
  toEncounterId: string
  label?: string
  condition: string
  priority: number
  kind: "normal" | "success" | "failure" | "timeout" | "fallback"
  requiresRoll?: {
    ability?: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"
    skill?: string
    result?: "success" | "failure"
  }
  previewResolved: boolean
  publishResolved: boolean
}
```

The LLM should see `toEncounterId`, `label`, `condition`, `kind`, and any relevant roll outcome. It should not need source paths, validation internals, or unresolved draft metadata during published gameplay.

## Convex Transition Records

Transition history should be part of the Adventure's evolving wiki-like playthrough record, not a separate event-sourcing subsystem in v1. Store transition decisions on the turn that caused them and summarize them into the Adventure record. This keeps movement auditable and replayable while preserving the readable chronicle model.

```ts
type RuntimeTransitionPatch = {
  adventureInstanceId: Id<"adventureInstances">
  fromEncounterId: string
  toEncounterId: string
  contentVersion: string
  contentHash: string
  transitionId?: string
  condition?: string
  reason: "llm_selected" | "system_forced" | "admin_override"
  modelOutput?: {
    nextEncounterId: string
    narrative: string
  }
  validation: {
    allowed: boolean
    rejectedReason?: string
  }
}
```

| State update | Rule |
| --- | --- |
| Turn narrative | Record the accepted narrative on the turn, whether the encounter changes or not. |
| Current encounter | Update only after the transition target passes graph validation and the write confirms the Adventure has not advanced. |
| Encounter turn count | Reset or start a new count for the target encounter after transition. Preserve the old encounter's completed count in turn history. |
| Character state | Do not reset damage or ongoing effects solely because the encounter changes. Per-encounter fields, such as encounter-scoped spell usage if retained, are handled by Unit 03. |
| Subscriptions | Clients observe the committed Convex state. They should not optimistically move to a model-proposed encounter before validation commits. |

## Unit 02 Defaults And Open Questions

| Question | Default for the plan |
| --- | --- |
| Can multiple transitions fire at once? | The LLM returns one `nextEncounterId`. If multiple conditions are satisfied, prefer roll outcome transitions first, then authored `priority`, then source order. |
| Should fallback transitions be allowed? | Yes, if authored as explicit graph edges. A fallback is still a normal validated transition, not a free-form jump. |
| Should authors be able to force a transition without the LLM? | Yes for system/admin actions such as session repair, debug tools, or scripted future mechanics, but normal gameplay should use the same graph validator and record `reason`. |
| Should the LLM return a transition reason? | Not required for v1 because the selected transition ID and narrative are enough. A later structured output can add `transitionReason` if debugging needs it. |
| Should transition validation inspect narrative text? | No for v1. Validate the structured target, not prose. Prose quality and consistency are generation concerns handled by prompt rules and review telemetry. |

**Verification:** Unit 02 is complete when a future implementation can prove three paths: continuing the current encounter, committing a legal graph transition, and rejecting an illegal or stale model-proposed target without mutating session state.

## Unit 03 Decision - Dice And Narrative Compatibility Contract

The relaunch should preserve the current lightweight D20 gameplay semantics while moving authored encounter content to the wiki runtime projection. Unit 03 is not a full D&D rules engine. It keeps the existing turn loop understandable: players act, the app may request a D20 roll, the roll outcome updates narrative and mutable character state, then the AI Game Master advances or continues the encounter using the Unit 01 and Unit 02 contracts.

**Compatibility surfaces:**

- **Roll state.** Keep `rollRequired` and `rollResult` on live `TurnCharacter` records. Roll requirements remain runtime/session state, not authored source truth.
- **Narrative markers.** Keep existing narrative shortcodes for display and history parsing, especially `[DiceRoll:...]` and `[OriginalReply:...]`. They are persisted in turn narrative for now because current UI and prompt context already know how to parse them.
- **Character mutation.** Keep `healthPercent`, `status`, `effects`, `spells[].isUsed`, `hasReplied`, `isComplete`, and `initiative` as Convex session state copied from character baselines and mutated during play.
- **Reports.** Practice reports should continue to read turn snapshots, encounter IDs, narrative, and findings. The report source changes from old JSON plan context to pinned wiki runtime artifacts plus Convex turn history.

## Roll Flow

1. Player submits an action for a live character.
2. The app analyzes the action against current encounter context and decides whether a roll is required.
3. If no roll is required, the app appends the player action narrative and marks the character complete as today.
4. If a roll is required, store `rollRequired` on that character with `rollType`, `difficulty`, and optional `modifier`.
5. When the player rolls, calculate `baseRoll + modifier`, store `rollResult`, append a `[DiceRoll:...]` marker, and generate player-safe outcome prose.
6. Apply bounded state changes: clear `rollRequired`, mark the character complete, mark matching spells as used, and update health/status/effects only through explicit runtime mutation logic.
7. After all active characters are complete, the AI Game Master advances the encounter using the Stage 5 Unit 01 context packet and Unit 02 transition validator.

## Roll Data Shape

```ts
type RuntimeRollState = {
  characterId: string
  rollType: string
  difficulty: number
  modifier?: number
  baseRoll?: number
  result?: number
  success?: boolean
  source: "player_action" | "npc_action" | "system"
  createdAt: number
  resolvedAt?: number
}
```

The current `RollRequirement` shape remains the minimum contract. The richer shape above is the planning target if a future implementation separates active roll state from character records.

## Narrative Shortcodes

| Marker | Status | Rule |
| --- | --- | --- |
| `[DiceRoll:rollType=...;baseRoll=...;modifier=...;result=...;difficulty=...;character=...;image=...;success=...]` | Preserve | Continue using this marker for inline roll display, prompt history, and practice report context. The marker is metadata, not player-facing prose. |
| `[OriginalReply: ...]` | Preserve | Continue storing the original player reply when useful for traceability. UI can render or hide it depending on the current display pattern. |
| Future structured events | Allowed later | A future implementation may move roll and reply metadata into structured Convex event records, but should keep rendering compatibility for existing turn narratives or migrate them deliberately. |

Generated prose should remain clean narrative text: no dice mechanics, no raw rules explanation, no markdown lists, and no player-character decisions, dialogue, or internal thoughts written by the model.

## Mutable Character State

| Field | Compatibility rule |
| --- | --- |
| `healthPercent` | Keep as the v1 health abstraction. Do not require hit-point-accurate combat in the relaunch baseline. Health changes come from explicit roll-result analysis, NPC turn logic, admin repair, or future structured damage events. |
| `status` | Keep as a simple string for current behavior such as `dead` and `fled`. Later schema work can constrain values if product behavior needs stricter status rules. |
| `effects` | Keep `{ name, description, duration }` as session state. Decrementing duration and applying effect consequences should be runtime logic, not source markdown mutation. |
| `spells[].isUsed` | Keep for lightweight spell availability. The current rule resets spells on encounter transition; preserve this as the v1 default unless Stage 8 explicitly changes rest/resource semantics. |
| `initiative` | Keep per-turn initiative. Continuing an encounter rerolls active characters; transitioning creates the next encounter's active PC/NPC list and initiatives. |
| `hasReplied` and `isComplete` | Keep as turn-completion flags. They are realtime session coordination fields, not character-sheet fields. |
| `rollRequired` and `rollResult` | Keep on live turn characters for compatibility. A future event-sourced model may move them into a dedicated roll table, but the visible behavior should remain the same. |

## Transition Effects On Gameplay State

| Transition effect | Default for v1 |
| --- | --- |
| Damage | Carry forward. Do not heal characters solely because the encounter changes. |
| Dead or fled characters | Preserve existing behavior: exclude dead/fled characters from active turn order unless an explicit revive/return action changes state. |
| Spells | Reset `spells[].isUsed` on encounter transition for v1 compatibility. This is intentionally a simplified encounter-scoped resource model. |
| Effects | Carry forward by default. Duration should decrement through runtime turn/effect handling, not through authored content changes. |
| NPC roster | Build from the target encounter's compiled NPC refs and copied NPC baselines, then mutate only the live session copy. |
| Health reset flags | Do not carry forward old ad hoc `resetHealth` as a hidden behavior without an authored runtime field. If retained, expose it as an explicit encounter transition effect in the compiled model. |

## Readable Turn History And Reports

Turn history remains the durable record players and tools understand. The relaunch should preserve readable narrative while letting structured runtime data grow around it.

| Consumer | Requirement |
| --- | --- |
| LLM context assembler | Use recent turns, parsed roll markers, current encounter ID, and narrative summary. Continue the current last-five-turn baseline from Unit 01. |
| Player UI | Render prose and roll markers cleanly. Mechanics metadata should appear as roll UI, not raw shortcode text. |
| Practice reports | Read pinned content metadata, encounter IDs, turn snapshots, parsed rolls, adventure patch data, transition patches, and validation findings. Reports should not depend on old AdventurePlan section/scene paths. |
| Debug/admin tools | Show raw model output, parsed shortcodes, character state diffs, and transition validation results when troubleshooting generation or session state. |

## Unit 03 Defaults And Open Questions

| Question | Default for the plan |
| --- | --- |
| Are we implementing full SRD combat math now? | No. Use standard ability names and existing character fields, but keep v1 gameplay lightweight and narrative-first. |
| Should roll types become enum values? | Not yet. Keep `rollType` as a string for compatibility with custom checks and spell names. Validation can warn on obvious malformed values later. |
| Should spell use reset on encounter transition? | Yes for v1 compatibility. Revisit only if the final implementation plan chooses rest-based resources. |
| Should health be percentage or HP? | Keep `healthPercent` for existing UI and schema compatibility. Add true HP only as a future rules upgrade with migration planning. |
| Should shortcodes be replaced immediately? | No. Preserve them for compatibility, then optionally mirror them into structured events during implementation. |

**Verification:** Unit 03 is complete when a future implementation can demonstrate: a no-roll player action, a required player roll with a rendered `[DiceRoll]` marker, spell-use tracking, health/status/effect persistence across an encounter transition, and a practice report that reads wiki runtime context instead of old JSON plan sections.

## Unit 04 Decision - Realtime Session Model Contract

Convex should remain the realtime authority for live gameplay state. The relaunch should not move authored Adventure Plan truth into Convex; it should store references to pinned S3 runtime artifacts plus the evolving Adventure wiki record created during play. This preserves the current product shape while making the wiki-first boundary explicit.

**Realtime session ownership:**

- **Authored content.** S3 published artifacts own adventure prose, encounter definitions, graph edges, NPC/location profiles, character-sheet baselines, image references, and validation reports.
- **Live Adventure.** Convex owns Adventure instances, participants, selected characters, current encounter, current turn, mutable character snapshots, roll state, chat, generated narrative, Adventure wiki patches, accumulated summaries, discoveries, changed entities, open threads, and practice reports.
- **Realtime UI.** Clients subscribe to Convex queries for current adventure, current turn, chat, lobby state, and turn navigation. Clients should not subscribe directly to S3; server-side loaders assemble pinned content context as needed.
- **AI boundary.** AI SDK calls may read Convex state and pinned S3 artifacts through server actions/API routes, then write only validated results back through Convex mutations.

## Target Convex Tables

Names can stay close to the current schema, but the relaunch should make content pinning and the evolving Adventure wiki record first-class. This is a planning target, not an immediate schema migration.

| Table | Purpose | Key fields |
| --- | --- | --- |
| `adventures` | Live Adventure playthrough container created from an Adventure Plan. | `settingId`, `planId`, `ownerId`, `runType`, `status`, `playerIds`, `currentTurnId`, `currentEncounterId`, `contentRef`, `adventureSummaryMarkdown`, `discoveredEntityIds`, `openThreadIds`. |
| `adventure_participants` or embedded `players` | Player-to-character assignment and lobby state. | `adventureId`, `userId`, `characterId`, `characterSource`, `joinedAt`, `ready`. Embedded players are acceptable for v1 if query patterns stay simple. |
| `turns` | Ordered narrative history, live turn snapshots, and per-turn Adventure wiki patch. | `adventureId`, `encounterId`, `order`, `title`, `narrative`, `characters`, `adventurePatch`, `transition`, `isFinalEncounter`, `createdAt`, `updatedAt`. |
| `adventure_entities` | Optional normalized live records for generated/discovered/changed entities. | `adventureId`, `entityType`, `entityId`, `title`, `markdown`, `visibility`, `sourcePlanEntityId`, `lastTurnId`, `updatedAt`. Can be deferred if v1 stores these in `adventures`/`turns`. |
| `roll_events` | Optional structured mirror of roll shortcodes and active roll resolution. | `adventureId`, `turnId`, `characterId`, `rollType`, `difficulty`, `modifier`, `baseRoll`, `result`, `success`, `createdAt`, `resolvedAt`. Optional for v1 if turn characters and shortcodes remain sufficient. |
| `chat_messages` | Out-of-band table talk. | `adventureId`, `userId` or `username`, `characterName`, `content`, `createdAt`. Chat does not automatically become game truth. |
| `adventure_reports` | Practice/campaign diagnostics. | `adventureId`, `ownerId`, `runType`, `status`, `report`, `error`, `createdAt`, `updatedAt`. |

## Realtime Queries

- `getAdventureSession(adventureId)`: returns Adventure metadata, source Adventure Plan ID, pinned content reference, status, participants, current turn ID, and summary state.
- `getCurrentTurn(adventureId)`: returns the current turn snapshot with characters and narrative.
- `getTurnsByAdventure(adventureId)`: returns ordered turn history for navigation, reports, and context assembly.
- `getTurnNavigationInfo(adventureId)`: returns current order and total turns without transferring all turn payloads.
- `getChatMessages(adventureId)`: returns chat ordered by creation time.
- `getAdventureWikiState(adventureId)`: returns the backend playthrough record for reports/admin/debug context, not a player-facing wiki UI.
- `getPracticeReports(adventureId)`: returns generated report metadata and findings.

## Mutations And Actions

- `createAdventureWithFirstTurn`: pins content version/hash, copies selected PC and initial NPC baselines into the first turn, and starts the session.
- `joinAdventure`: validates run type, character ownership/availability, and participant limits before assigning a character.
- `submitReply`: appends player narrative, stores optional roll requirement, and updates only that character's turn state.
- `resolveRoll`: records roll result, appends shortcode-compatible metadata, applies bounded character mutations, and clears active roll state.
- `advanceTurn`: server-side action assembles context, calls the AI SDK, validates transitions and `adventurePatch`, then writes through Convex mutations.
- `commitTurnAdvance`: validates stale Adventure guards and graph target, writes the next turn with embedded patch/transition data, updates accumulated Adventure summary/entity/thread state, and updates current encounter/turn atomically as much as Convex mutation boundaries allow.
- `sendChatMessage`: writes chat only; does not mutate gameplay state.

## Session Shape

```ts
type WikiAdventureSession = {
  _id: Id<"adventures">
  settingId: string
  planId: string
  ownerId: string
  runType: "campaign" | "practice"
  status: "waitingForPlayers" | "active" | "completed"
  contentRef: {
    source: "published" | "preview"
    contentVersion?: string
    contentHash?: string
    previewDraftId?: string
    schemaVersion: string
  }
  currentEncounterId: string
  currentTurnId?: Id<"turns">
  adventureSummaryMarkdown?: string
  discoveredEntityIds?: string[]
  openThreadIds?: string[]
  playerIds: string[]
  players: Array<{
    userId: string
    characterId: string
    characterSource: "user" | "premade"
  }>
  startedAt: number
  endedAt?: number
  updatedAt: number
}
```

Keep the current naming distinction: `planId` identifies the authored Adventure Plan; the Convex document ID identifies the live Adventure playthrough. Published content references hang from `planId` and `contentRef`, while playthrough state belongs to the Adventure document.

## Turn Snapshot Shape

```ts
type WikiAdventureTurn = {
  _id: Id<"turns">
  adventureId: Id<"adventures">
  encounterId: string
  title: string
  order: number
  narrative: string
  characters: TurnCharacter[]
  adventurePatch?: AiGmTurnResult["adventurePatch"]
  transition?: RuntimeTransitionPatch
  generatedBy?: {
    model?: string
    promptVersion?: string
    contextHash?: string
  }
  createdAt: number
  updatedAt: number
}
```

Embedding live `TurnCharacter` arrays in turns remains acceptable for v1 because it matches the current UI and makes each turn replayable. If sessions later need long-running campaign state independent of turn snapshots, introduce a separate `session_characters` table rather than mutating published source sheets.

## Realtime Boundaries

| Boundary | Rule |
| --- | --- |
| Published content updates | Existing sessions keep their pinned version. New sessions read `latest.json` and then pin to a concrete version. |
| Preview playthroughs | Mark as `runType: practice` or a preview-specific content source. Never mix preview draft IDs with published campaign sessions. |
| Chat | Realtime and visible, but not game truth unless a player submits an explicit action. Unit 01's default of excluding raw chat from LLM context remains correct. |
| AI generation | Actions can call AI and read S3 context; mutations write validated results. Avoid model calls inside Convex mutations. |
| Concurrency | Every mutation that advances turn or commits transition should verify expected `currentTurnId`, `currentEncounterId`, and current order before writing. |
| Authorization | Mutations must verify owner/player/admin rights server-side. Client-visible state is realtime, but writes still require control of the relevant adventure or character. |
| Generated history | Store enough model/context metadata to debug and report behavior, but do not store raw private prompt packets unless a later privacy policy allows it. |

## Session Lifecycle

1. Start session: load `latest.json` or preview bundle, pin content ref, copy selected PC sheets and initial encounter NPC sheets into live turn state.
2. Lobby/join: update participants and selected character assignments in Convex; do not mutate S3 character sheets.
3. Player turn: append reply, optionally require roll, update only that live turn character.
4. Roll resolution: append shortcode-compatible roll metadata, apply bounded character mutations, mark the actor complete.
5. NPC/system turns: generate and apply NPC actions against live session state, not source NPC baselines.
6. Turn advancement: assemble context from pinned S3 artifacts plus Convex Adventure state, call AI, validate transition and `adventurePatch`, create the next turn, update accumulated Adventure wiki state, and update current pointers.
7. Completion: mark Adventure completed, retain pinned content ref, turn history, accumulated Adventure wiki state, and summaries for replay/reporting.

## Unit 04 Defaults And Open Questions

| Question | Default for the plan |
| --- | --- |
| Should live character state be embedded in turns or normalized? | Embed for v1 compatibility. Consider `session_characters` only if campaign-length state becomes hard to manage or query. |
| Should transition events be a separate table? | No for v1. Store transition decisions on turns and summarize them into the Adventure wiki record. Roll events may still be mirrored later if shortcodes become hard to query. |
| Should chat enter AI context? | No by default. Chat is table talk unless promoted into an explicit player action or report note. |
| Should AI prompts be stored? | Store model name, prompt version, context hash, and result. Avoid storing full private prompt packets by default. |
| Should Convex store compiled encounter records? | No. Store content references and session state. Read compiled artifacts from S3/server cache when assembling context. |

**Verification:** Unit 04 is complete when the final implementation plan can map current `adventures`, `turns`, `chat_messages`, and `adventure_reports` behavior to a wiki-first schema with pinned content refs, server-side authorization, stale-write guards, realtime subscriptions, and no Convex ownership of authored adventure source content.
