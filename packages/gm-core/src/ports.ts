import type { z } from "zod"
import type { TurnCharacter } from "./types/adventure"
import type { AdventurePlan } from "./types/adventure-plan"
import type { RollRequirement } from "./validations/roll-requirement-schema"
import type { AdventurePatch } from "./wiki-adventures/adventure-patch"
import type { RuntimeArtifacts } from "./wiki-adventures/types"

export type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }
export type Prompt = { prompt: string; system?: string }
export type ObjectResult<T extends z.ZodTypeAny> = { object: z.infer<T>; usage?: Usage; [key: string]: unknown }

/** Providers own transport, retries, output cleanup, and usage accounting. */
export interface Llm {
  generateObject<T extends z.ZodTypeAny>(args: Prompt & { schema: T }): Promise<ObjectResult<T>>
  generateText(args: Prompt): Promise<{ text: string; usage?: Usage }>
}

export interface Billing {
  chargeUsage(totalTokens: number, transactionType: "usage_generate_object" | "usage_generate_text", context: string): Promise<void>
}

export type TurnRecord = {
  _id: string
  adventureId: string
  encounterId: string
  title: string
  narrative: string
  characters: TurnCharacter[]
  order: number
  isFinalEncounter?: boolean
}

export type AdventureRecord = {
  _id: string
  title: string
  settingId: string
  planId: string
  ownerId: string
  playerIds: string[]
  runType?: "campaign" | "practice"
}

export type NewTurn = {
  adventureId: string
  encounterId: string
  title: string
  narrative: string
  characters: TurnCharacter[]
  order: number
  isFinalEncounter?: boolean
}

export type WikiTurnCommit = Omit<NewTurn, "encounterId"> & {
  expectedCurrentTurnId: string
  expectedCurrentEncounterId: string
  expectedContentHash?: string
  currentContentVersion?: string
  currentVersionId?: string
  nextEncounterId: string
  adventurePatch?: AdventurePatch
  transition?: AdventurePatch["transition"]
  generatedBy?: { model?: string; promptVersion?: string; contextHash?: string }
}

/** Atomic commit and duplicate/stale-write protection belong to the store. */
export interface Store {
  getTurn(args: { turnId: string }): Promise<TurnRecord | null>
  getAdventure(args: { adventureId: string }): Promise<AdventureRecord | null>
  getTurns(args: { adventureId: string }): Promise<TurnRecord[]>
  getTurnByOrder(args: { adventureId: string; order: number }): Promise<TurnRecord | null>
  submitReply(args: { turnId: string; characterId: string; narrativeAction: string; originalPlayerInput?: string; rollRequirement?: RollRequirement }): Promise<unknown>
  updateTurn(args: { turnId: string; patch: { narrative?: string; characters?: TurnCharacter[]; updatedAt?: number } }): Promise<unknown>
  patchAdventure(args: {
    adventureId: string
    patch: { currentTurnId?: string; currentEncounterId?: string; endedAt?: number; updatedAt?: number; status?: "waitingForPlayers" | "active" | "completed" }
  }): Promise<unknown>
  createTurn(args: NewTurn): Promise<string>
  commitWikiTurnAdvance(args: WikiTurnCommit): Promise<{ turnId: string; adventureId: string }>
  createAdventureWithFirstTurn(args: {
    planId: string
    settingId: string
    ownerId: string
    playerIds: string[]
    title: string
    startedAt: number
    playerInput: string
    turn: Omit<NewTurn, "adventureId" | "isFinalEncounter">
    rollRequirement?: RollRequirement
  }): Promise<{ adventureId: string; turnId: string }>
}

export interface Content {
  isWikiAdventure(settingId: string, planId: string): boolean
  loadWikiRuntime(
    settingId: string,
    planId: string
  ): Promise<{
    definition: { promptSlug: string }
    artifacts: RuntimeArtifacts
    contentRef: { source: "published"; settingId: string; planId: string; contentVersion: string; contentHash: string; versionId: string; schemaVersion: "1" }
  }>
  loadPlan(settingId: string, planId: string): Promise<AdventurePlan>
  loadLegacyPlan(settingId: string, planId: string): Promise<AdventurePlan | null>
  spatialContext(settingId: string, planId: string, encounterId: string, characters: TurnCharacter[]): Promise<string | undefined>
}

export interface Narration {
  afterTurn(turnId: string): void
}

/** Each game runtime owns its ports. There is no process-wide provider state. */
export interface GmPorts {
  llm: Llm
  store: Store
  content: Content
  narration: Narration
  identity(): Promise<string | null>
  sleep?(ms: number): Promise<void>
}
