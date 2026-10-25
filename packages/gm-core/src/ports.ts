import type { z } from "zod"
import type { StoryBeat } from "./story/beats"
import type { StoryPlace } from "./story/clean"
import type { KnownFact } from "./story/knowledge"
import type { TurnCharacter } from "./types/adventure"
import type { AdventurePlan } from "./types/adventure-plan"
import type { RollRequirement } from "./validations/roll-requirement-schema"
import type { AdventurePatch } from "./wiki-adventures/adventure-patch"
import type { RuntimeArtifacts } from "./wiki-adventures/types"

export type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }
// `viewer` is the one character a prompt plays, when it plays one: an NPC or an AI hero. A host that adds saved state to
// prompts adds only what that character knows.
export type Prompt = { prompt: string; system?: string; viewer?: string }
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
  // The turn as labelled beats, in order.
  story: StoryBeat[]
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
  // What each character knows: see story/knowledge.ts.
  knowledge?: KnownFact[]
  // The paragraphs that show created heroes in the start encounter's intro, by hero id: see story/authored.ts.
  arrivals?: Record<string, string>
}

export type NewTurn = {
  adventureId: string
  encounterId: string
  title: string
  story: StoryBeat[]
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
  // What characters learned in the round, new facts or more knowers of listed ones, to merge into the adventure's.
  knowledge?: KnownFact[]
}

/** Atomic commit and duplicate/stale-write protection belong to the store. */
export interface Store {
  getTurn(args: { turnId: string }): Promise<TurnRecord | null>
  getAdventure(args: { adventureId: string }): Promise<AdventureRecord | null>
  getTurns(args: { adventureId: string }): Promise<TurnRecord[]>
  getTurnByOrder(args: { adventureId: string; order: number }): Promise<TurnRecord | null>
  // `story` holds the reply's beats, the player's own words first, to add to the turn's story.
  submitReply(args: { turnId: string; characterId: string; story: StoryBeat[]; rollRequirement?: RollRequirement }): Promise<unknown>
  updateTurn(args: { turnId: string; patch: { story?: StoryBeat[]; characters?: TurnCharacter[]; updatedAt?: number } }): Promise<unknown>
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
  // The named places of the encounter's 3D set, which the GM may point the camera at and walk characters to.
  places?(encounterId: string): Promise<StoryPlace[] | undefined>
  // The premise as one hero knows it, when the plan's own holds more than that hero should, such as the story so far.
  heroPremise?(settingId: string, planId: string, heroId: string): Promise<string | undefined>
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
  // How many NPC and AI hero turns one call plays. Unset, a call plays every one up to the next player, and a player's
  // reply or roll plays the turns after it. With a number, those turns wait for their own calls, so each can be read
  // as soon as it is written instead of after the whole run.
  npcTurnsPerCall?: number
}
