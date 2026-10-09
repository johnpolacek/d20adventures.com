import { type AdventureRecord, type Content, createGmCore, type Llm, type Store } from "@d20/gm-core"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import { spatialContext } from "../src/scenes"
import type { Packs } from "./game"

// Host mode: the game lives on the website, and this app runs its GM. Guests' actions and the host's own wait on the
// website as jobs. The worker claims one at a time, runs it through the host's CLI, and reports it done or failed.

export type HostJob = {
  _id: string
  adventureId: string
  turnId: string
  kind: "reply" | "roll" | "continue"
  userId: string
  characterId?: string
  text?: string
  result?: number
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
    // Hosted games keep no stage positions yet, so places are read from the staging alone.
    spatialContext: async (_setting, _plan, encounter, characters) => spatialContext(encounter, characters, {}),
  }
}

/** Runs one job against the hosted game. Throws with a message players can read when it cannot. */
export async function runHostJob(job: HostJob, store: Store, packs: Packs, llm: Llm) {
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
  if (adventure.currentTurnId !== job.turnId) throw new Error("This turn has already advanced.")
  if (adventure.status === "completed") throw new Error("This adventure is complete.")
  const turn = await store.getTurn({ turnId: job.turnId })
  if (!turn) throw new Error("The turn is missing.")
  // Website turns carry who plays each hero, which the core's character type leaves out.
  type Actor = TurnCharacter & { controlledBy?: "ai"; userId?: string }
  const actor = findCurrentActor(turn.characters) as Actor | undefined
  if (job.kind === "continue") {
    if (actor?.type === "pc" && actor.controlledBy !== "ai") throw new Error("A player character still needs to act.")
    if (actor) {
      await core.processNpcTurnsAfterCurrent(turn._id)
      const after = await store.getTurn({ turnId: turn._id })
      const next = after ? (findCurrentActor(after.characters) as Actor | undefined) : undefined
      if (next?.type === "npc" || next?.controlledBy === "ai") throw new Error("The GM could not finish this character's turn. Continue to retry.")
    } else {
      await core.advanceTurn({ turnId: turn._id, settingId: adventure.settingId, adventurePlanId: adventure.planId })
    }
    return
  }
  if (!actor || actor.id !== job.characterId || actor.type !== "pc" || actor.controlledBy === "ai" || actor.userId !== job.userId) throw new Error("It is another character's turn.")
  if (job.kind === "reply") {
    if (actor.hasReplied) throw new Error("This reply is already saved. Resolve the pending roll.")
    const text = job.text?.trim()
    if (!text) throw new Error("The action is empty.")
    const action = await core.formatNarrativeAction({ characterName: actor.name, gender: actor.gender, playerInput: text, narrativeContext: turn.narrative, characterInfo: actor })
    await core.processTurnReply({ turnId: turn._id, characterId: actor.id, narrativeAction: action, originalPlayerInput: text })
    return
  }
  if (!actor.rollRequired || actor.rollResult !== undefined) throw new Error("There is no pending roll.")
  if (!Number.isInteger(job.result) || job.result! < 1 || job.result! > 20) throw new Error("A roll is a whole number from 1 to 20.")
  await core.resolvePlayerRollResult({ turnId: turn._id, characterId: actor.id, result: job.result! })
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
  emit: (event: HostEvent) => void
  stopped: () => boolean
  wait: (ms: number) => Promise<void>
}) {
  const jobs = `/api/desktop/host/${opts.adventureId}/jobs`
  let idle = false
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
      if (!idle) opts.emit({ type: "idle" })
      idle = true
      await opts.wait(1500)
      continue
    }
    idle = false
    opts.emit({ type: "working", job: { _id: job._id, kind: job.kind, characterId: job.characterId } })
    try {
      await runHostJob(job, opts.store, opts.packs, opts.llm)
      await opts.post(jobs, { op: "finish", jobId: job._id })
      opts.emit({ type: "done", jobId: job._id })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The GM could not finish this action."
      await opts.post(jobs, { op: "finish", jobId: job._id, error: message }).catch(() => {})
      opts.emit({ type: "failed", jobId: job._id, error: message })
    }
  }
}
