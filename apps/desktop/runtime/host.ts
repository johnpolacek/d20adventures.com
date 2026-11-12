import { type AdventureRecord, type Content, createGmCore, type Llm, type Store } from "@d20/gm-core"
import { type Arrival, writeArrival } from "@d20/gm-core/character/hero-draft"
import { withCityContext } from "@d20/gm-core/citymap"
import { type ActionSuggestion, suggestActions } from "@d20/gm-core/services/ai-pc-turn-service"
import { characterScript } from "@d20/gm-core/story/turn"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import type { PCTemplate } from "@d20/gm-core/types/character"
import { findCurrentActor, isDown, isDying } from "@d20/gm-core/utils/turn-actors"
import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import { scenePlaces } from "../src/scenes"
import { encounterFloor } from "./floor"
import type { Packs } from "./game"
import { heroAdventure } from "./heroes"
import type { Art } from "./paint"

// Host mode: the game lives on the website, and this app runs its GM. Guests' actions and the host's own wait on the
// website as jobs. The worker claims one at a time, runs it through the host's CLI, and reports it done or failed.
// A suggest job changes nothing in the game: it writes replies a player could send, which finish the job with it.
// A react job is a player's answer to a reaction offered to their hero, and plays the turn on as Continue does.

export type HostJob = {
  _id: string
  adventureId: string
  // None for an arrival job, which is written before the first turn.
  turnId?: string
  kind: "reply" | "roll" | "continue" | "suggest" | "skip" | "arrival" | "paint" | "react"
  userId: string
  characterId?: string
  // A reply's text, or the hook a created hero's player chose for an arrival job.
  text?: string
  result?: number
  // The other d20 of a roll with Advantage or Disadvantage.
  second?: number
  // A react job's answer: take the reaction or let it pass.
  take?: boolean
  // An arrival or paint job's hero, as the website sends it.
  sheet?: PCTemplate | null
}
// One request to the website's host routes, with the device token added by the caller.
export type HostPost = (path: string, body: unknown) => Promise<unknown>

/** The GM core's store, kept on the website. Every operation is checked there against the games this account hosts. */
export function remoteStore(post: HostPost): Store {
  const op = (name: keyof Store) => async (args: unknown) => ((await post("/api/desktop/host/store", { op: name, args })) as { result: unknown }).result
  return {
    getTurn: op("getTurn") as Store["getTurn"],
    getAdventure: op("getAdventure") as Store["getAdventure"],
    getTurns: op("getTurns") as Store["getTurns"],
    getTurnByOrder: op("getTurnByOrder") as Store["getTurnByOrder"],
    submitReply: op("submitReply") as Store["submitReply"],
    updateTurn: op("updateTurn") as Store["updateTurn"],
    patchAdventure: op("patchAdventure") as Store["patchAdventure"],
    commitWikiTurnAdvance: op("commitWikiTurnAdvance") as Store["commitWikiTurnAdvance"],
    keepHero: op("keepHero") as Store["keepHero"],
    createTurn: async () => {
      throw new Error("Hosted games play authored adventures only.")
    },
    createAdventureWithFirstTurn: async () => {
      throw new Error("Hosted games are created on the website.")
    },
  }
}

function hostContent(packs: Packs): Content {
  const packFor = (plan: string) => {
    const pack = packs[plan]
    if (!pack) throw new Error("This adventure is not installed in the host's app.")
    return pack
  }
  return {
    isWikiAdventure: (setting, plan) => setting === "realm-of-myr" && plan in packs,
    loadWikiRuntime: async (_setting, plan) => packFor(plan),
    loadPlan: async (_setting, plan) => buildAdventurePlanViewFromArtifacts(packFor(plan).artifacts),
    loadLegacyPlan: async () => null,
    spatialContext: async (_setting, plan, encounter, staging) => withCityContext(staging, packFor(plan).cityMap, packFor(plan).artifacts.encounters, encounter),
    places: async (encounter) => scenePlaces(encounter),
    floor: encounterFloor,
  }
}

// Website turns carry who plays each hero, which the core's character type leaves out.
type Actor = TurnCharacter & { controlledBy?: "ai"; userId?: string }

/**
 * What the GM carries on with by itself: the NPC or AI hero whose turn it is, or "round" once everyone has acted.
 * Null while a player's hero is up, or when no player has a hero left who can act or is dying, so a game never plays itself.
 */
export function selfRunning(characters: Actor[]): string | null {
  const actor = findCurrentActor(characters)
  if (actor?.type === "pc" && actor.controlledBy !== "ai") return null
  if (!characters.some((c) => c.type === "pc" && c.controlledBy !== "ai" && (!isDown(c) || isDying(c)))) return null
  return actor?.id ?? "round"
}

/** Whether a turn's reaction offer still holds the round: unanswered and not run out by `now`. */
export const offerWaits = (turn: { reaction?: { answer?: boolean; expiresAt: number } | null } | null | undefined, now: number) =>
  Boolean(turn?.reaction && turn.reaction.answer === undefined && now < turn.reaction.expiresAt)

/** Runs one job against the hosted game. Throws with a message players can read when it cannot. A suggest job returns its replies. */
export async function runHostJob(job: HostJob, store: Store, packs: Packs, llm: Llm): Promise<ActionSuggestion[] | undefined> {
  // Some inherited web services recover failed inference with default prose or no roll. A hosted game must keep
  // its last good state instead, so a failed job can simply be retried.
  let inferenceFailure: unknown
  const tracked: Llm = {
    generateText: (args) =>
      llm.generateText(args).catch((error) => {
        inferenceFailure = error
        throw error
      }),
    generateObject: (args) =>
      llm.generateObject(args).catch((error) => {
        inferenceFailure = error
        throw error
      }),
  }
  const writes = new Set(["submitReply", "updateTurn", "patchAdventure", "commitWikiTurnAdvance"])
  const guarded = new Proxy(store, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (typeof value !== "function") return value
      return (...args: unknown[]) => {
        if (writes.has(String(key)) && inferenceFailure) throw inferenceFailure
        return value.apply(target, args)
      }
    },
  })
  const core = createGmCore({ llm: tracked, store: guarded, content: hostContent(packs), narration: { afterTurn() {} }, identity: async () => job.userId, sleep: async () => {} })
  const adventure = (await store.getAdventure({ adventureId: job.adventureId })) as (AdventureRecord & { currentTurnId?: string; status?: string }) | null
  if (!adventure) throw new Error("The hosted game is missing.")
  if (!job.turnId || adventure.currentTurnId !== job.turnId) throw new Error("This turn has already advanced.")
  if (adventure.status === "completed") throw new Error("This adventure is complete.")
  const turn = await store.getTurn({ turnId: job.turnId })
  if (!turn) throw new Error("The turn is missing.")
  const actor = findCurrentActor(turn.characters) as Actor | undefined
  // A player's answer to a reaction: kept, and the NPC's turn that waited on it is played on.
  if (job.kind === "react") {
    if (typeof job.take !== "boolean" || !job.characterId) throw new Error("An answer is to take the reaction or not.")
    if (turn.reaction?.offer.to !== job.characterId || turn.reaction.answer !== undefined) throw new Error("No reaction is offered to this character.")
    await core.answerReaction({ turnId: turn._id, characterId: job.characterId, take: job.take })
  }
  if (job.kind === "continue" || job.kind === "react") {
    if (actor?.type === "pc" && actor.controlledBy !== "ai") throw new Error("A player character still needs to act.")
    let next = actor
    if (actor) {
      // The answer already played the turns on, as the host's GM plays every turn that needs no player at once.
      if (job.kind === "continue") await core.processNpcTurnsAfterCurrent(turn._id)
      const after = await store.getTurn({ turnId: turn._id })
      // A turn that stopped to offer a hero a reaction is not a failure: the round waits on the answer.
      if (after?.reaction) return
      next = after ? (findCurrentActor(after.characters) as Actor | undefined) : undefined
      if (next?.type === "npc" || next?.controlledBy === "ai") throw inferenceFailure ?? new Error("The GM could not finish this character's turn. Continue to retry.")
    }
    // With everyone done the round ends in the same job. Local play ends it on a Continue of its own, once the last
    // turns are read.
    if (!next) await core.advanceTurn({ turnId: turn._id, settingId: adventure.settingId, adventurePlanId: adventure.planId })
    return
  }
  if (!actor || actor.id !== job.characterId || actor.type !== "pc" || actor.controlledBy === "ai" || actor.userId !== job.userId) throw new Error("It is another character's turn.")
  if (job.kind !== "roll" && actor.hasReplied) throw new Error("This reply is already saved. Resolve the pending roll.")
  if (job.kind === "suggest") {
    const manifest = packs[adventure.planId]?.artifacts.manifest
    return suggestActions(llm, actor, characterScript(turn, actor.id), turn.characters, "", manifest?.premise, adventure.knowledge, manifest?.strangers ? { story: turn.story } : undefined)
  }
  // A skip ends the hero's turn with nothing written and no AI.
  if (job.kind === "skip") {
    await store.updateTurn({ turnId: turn._id, patch: { characters: turn.characters.map((c) => (c.id === actor.id ? { ...c, hasReplied: true, isComplete: true } : c)), updatedAt: Date.now() } })
    return
  }
  if (job.kind === "reply") {
    const text = job.text?.trim()
    if (!text) throw new Error("The action is empty.")
    const beats = await core.writeReply({ character: actor, playerInput: text, turn })
    await core.processTurnReply({ turnId: turn._id, characterId: actor.id, originalPlayerInput: text, story: beats })
    return
  }
  if (!actor.rollRequired || actor.rollResult !== undefined) throw new Error("There is no pending roll.")
  const d20 = (n: number | undefined) => Number.isInteger(n) && n! >= 1 && n! <= 20
  if (!d20(job.result) || (job.second !== undefined && !d20(job.second))) throw new Error("A roll is a whole number from 1 to 20.")
  await core.resolvePlayerRollResult({ turnId: turn._id, characterId: actor.id, result: job.result!, second: job.second })
}

/** Writes a created hero's arrival in the adventure's opening scene, before the game starts. */
export async function runArrivalJob(job: HostJob, store: Store, packs: Packs, llm: Llm): Promise<Arrival> {
  const adventure = (await store.getAdventure({ adventureId: job.adventureId })) as (AdventureRecord & { currentTurnId?: string }) | null
  if (!adventure) throw new Error("The hosted game is missing.")
  if (adventure.currentTurnId) throw new Error("The game has started without this hero's arrival.")
  const pack = packs[adventure.planId]
  const { hooks, opening, ...about } = pack ? heroAdventure(pack) : { title: "" }
  if (!hooks?.length || !opening) throw new Error("This adventure has no arrivals.")
  if (!job.sheet?.name || !job.sheet.appearance) throw new Error("The hero's sheet could not be read.")
  return writeArrival(llm, job.sheet, { ...about, hooks, opening }, job.text)
}

export type HostEvent =
  | { type: "idle" }
  | { type: "working"; job: Pick<HostJob, "_id" | "kind" | "characterId"> }
  | { type: "done"; jobId: string }
  | { type: "failed"; jobId: string; error: string }
  | { type: "offline"; error: string }

/** Claims and runs jobs until stopped. Waits between polls while there is no work or the website cannot be reached. */
export async function hostLoop(opts: {
  adventureId: string
  post: HostPost
  store: Store
  packs: Packs
  llm: Llm
  // Paints a guest's hero through the host's image CLI. It throws where there is none.
  paint?: (hero: PCTemplate) => Promise<Art>
  emit: (event: HostEvent) => void
  stopped: () => boolean
  wait: (ms: number) => Promise<void>
}) {
  const jobs = `/api/desktop/host/${opts.adventureId}/jobs`
  let idle = false
  // A report the website missed is sent again. Finishing a job twice changes nothing, and a job left running holds
  // every later one for ten minutes.
  const finish = async (jobId: string, report: { suggestions?: ActionSuggestion[]; arrival?: Arrival; painted?: boolean; error?: string }) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await opts.post(jobs, { op: "finish", jobId, ...report })
      } catch (error) {
        if (attempt === 3) throw error
        await opts.wait(2000)
      }
    }
  }
  // A paint runs beside the GM's work and takes minutes. A hero it fails for stays on their stock figure, and the game
  // goes on, so nothing is shown to the table.
  const paintHero = async (job: HostJob) => {
    try {
      if (!opts.paint) throw new Error("This app cannot paint.")
      if (!job.sheet?.name || !job.sheet.appearance) throw new Error("The hero's sheet could not be read.")
      const art = await opts.paint(job.sheet)
      for (const picture of ["front", "back", "portrait"] as const) await opts.post(jobs, { op: "art", jobId: job._id, picture, data: art[picture].toString("base64") })
      await finish(job._id, { painted: true })
    } catch (error) {
      await finish(job._id, { error: error instanceof Error ? error.message : "The hero could not be painted." }).catch(() => {})
    }
  }
  // Turns that need no player run on their own: the worker queues a Continue for them. Each is queued once, so one
  // that fails waits for a player's Continue instead of being retried for ever. A reaction offered to a hero holds the
  // round: nothing is queued while it waits on its answer, and once it runs out unanswered a Continue is queued once,
  // which plays it by the hero's standing order. `offerUntil` is when the offer runs out, to look again then.
  let followed: string | null = null
  let offerUntil: number | null = null
  const follow = async () => {
    offerUntil = null
    try {
      const adventure = (await opts.store.getAdventure({ adventureId: opts.adventureId })) as (AdventureRecord & { currentTurnId?: string; status?: string }) | null
      if (!adventure?.currentTurnId || adventure.status === "completed") return false
      const turn = await opts.store.getTurn({ turnId: adventure.currentTurnId })
      if (turn?.reaction && offerWaits(turn, Date.now())) offerUntil = turn.reaction.expiresAt
      // An answered offer is played on by its own job.
      if (turn?.reaction && (offerUntil !== null || turn.reaction.answer !== undefined)) return false
      const who = turn && selfRunning(turn.characters)
      const key = turn && who && `${turn._id}:${who}${turn.reaction ? `:${turn.reaction.expiresAt}` : ""}`
      if (!turn || !key || followed === key) return false
      followed = key
      await opts.post(jobs, { op: "queue", turnId: turn._id, kind: "continue" })
      return true
    } catch {
      return false
    }
  }
  while (!opts.stopped()) {
    let job: HostJob | null
    try {
      job = ((await opts.post(jobs, { op: "claim" })) as { job: HostJob | null }).job
    } catch (error) {
      opts.emit({ type: "offline", error: error instanceof Error ? error.message : String(error) })
      idle = false
      await opts.wait(5000)
      continue
    }
    if (!job) {
      // Going idle, in case the game was left on such a turn: the app reopened, or a job stopped partway. And once a
      // reaction offer the round waits on runs out.
      if ((!idle || (offerUntil !== null && Date.now() >= offerUntil)) && (await follow())) continue
      if (!idle) opts.emit({ type: "idle" })
      idle = true
      await opts.wait(1500)
      continue
    }
    if (job.kind === "paint") {
      void paintHero(job)
      continue
    }
    idle = false
    opts.emit({ type: "working", job: { _id: job._id, kind: job.kind, characterId: job.characterId } })
    let result: { suggestions?: ActionSuggestion[]; arrival?: Arrival } | { error: string }
    try {
      if (job.kind === "arrival") {
        result = { arrival: await runArrivalJob(job, opts.store, opts.packs, opts.llm) }
        await finish(job._id, result).catch((error) => opts.emit({ type: "offline", error: error instanceof Error ? error.message : String(error) }))
        opts.emit({ type: "done", jobId: job._id })
        continue
      }
      const suggestions = await runHostJob(job, opts.store, opts.packs, opts.llm)
      // Queued before this job is reported done, so no screen sees the game waiting on a Continue.
      if (job.kind !== "suggest") await follow()
      result = { suggestions }
    } catch (error) {
      result = { error: error instanceof Error ? error.message : "The GM could not finish this action." }
    }
    // The game is already saved, so a missed report never turns a finished action into a failed one.
    await finish(job._id, result).catch((error) => opts.emit({ type: "offline", error: error instanceof Error ? error.message : String(error) }))
    opts.emit("error" in result ? { type: "failed", jobId: job._id, error: result.error } : { type: "done", jobId: job._id })
  }
}
