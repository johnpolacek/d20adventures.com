import { randomUUID } from "node:crypto"
import { type Content, createGmCore, type Llm } from "@d20/gm-core"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import type { RuntimeArtifacts } from "@d20/gm-core/wiki-adventures/types"
import { MOVEMENT_SYSTEM, movementIntentSchema, movementPrompt } from "@d20/stage/movement"
import { z } from "zod"
import { spatialContext } from "../src/scenes"
import { applyCharacterUpdates, characterContext, desktopPatchSchema } from "./characters"
import { partyFor } from "./heroes"
import type { LocalStore } from "./store"

export type Pack = { artifacts: RuntimeArtifacts; contentRef: Awaited<ReturnType<Content["loadWikiRuntime"]>>["contentRef"]; definition: { promptSlug: string } }
// Bundled adventures keyed by plan id.
export type Packs = Record<string, Pack>
// The bundled adventures share no encounter ids, so one list of legal transitions serves every save.
export const transitionsOf = (packs: Packs) => Object.values(packs).flatMap((p) => p.artifacts.graph.encounterTransitions)
// The heroes a new game suggests. March of Davos uses the four premades in its authored scenes.
const PARTY: Record<string, string[]> = { "march-of-davos": ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"] }
// What the new game screen offers for each adventure: its player range, premades, and the heroes it accepts.
export const adventureList = (packs: Packs) =>
  Object.entries(packs).map(([id, p]) => {
    const m = p.artifacts.manifest
    const premades = m.premadeCharacterIds.map((cid) => p.artifacts.characterSheets.premadeCharacters[cid].sheet)
    return {
      id,
      title: m.title,
      start: m.startEncounterId,
      teaser: m.teaser ?? "",
      players: [m.minPlayers ?? 1, m.maxPlayers ?? Math.max(1, premades.length)] as [number, number],
      options: m.availableCharacterOptions ?? null,
      premades: premades.map((s) => ({ id: s.id, name: s.name, race: s.race, archetype: s.archetype, gender: s.gender })),
      party: PARTY[id] ?? m.premadeCharacterIds.slice(0, m.maxPlayers),
    }
  })
export type AdventureInfo = ReturnType<typeof adventureList>[number]
// An adventure for sale, from the build's catalog.json. Locked ones have no pack yet.
export type CatalogInfo = Pick<AdventureInfo, "id" | "title" | "teaser" | "players"> & { priceCents: number; free: boolean; listPriceCents?: number }
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("load") }),
  // `replace` starts over, archiving the saved adventure.
  z.object({
    kind: z.literal("start"),
    provider: z.enum(["claude", "codex", "grok", "gemini"]),
    adventure: z.string().max(100).optional(),
    replace: z.boolean().optional(),
    // Who plays each hero. Without it, the suggested party, all played by the player.
    party: z
      .array(z.object({ id: z.string().max(100), ai: z.boolean() }))
      .min(1)
      .max(8)
      .optional(),
  }),
  z.object({
    kind: z.literal("reply"),
    turnId: z.string(),
    characterId: z.string(),
    text: z.string().trim().min(1).max(4000),
    movement: z
      .object({
        actor: z.object({ id: z.string().max(100), name: z.string().max(100), speed: z.number().min(0).max(30) }),
        action: z.string().max(4000),
        places: z.array(z.object({ id: z.string().max(100), label: z.string().max(200), distance: z.number().finite().min(0), direction: z.string().max(50) })).max(100),
        characters: z.array(z.object({ id: z.string().max(100), name: z.string().max(100), distance: z.number().finite().min(0), direction: z.string().max(50) })).max(24),
      })
      .optional(),
  }),
  // Swaps an archived adventure in as the current save.
  z.object({ kind: z.literal("resume"), archiveId: z.number().int().positive() }),
  // Removes a saved adventure for good: an archived one by id, or the current one without an id.
  z.object({ kind: z.literal("remove"), archiveId: z.number().int().positive().optional() }),
  z.object({ kind: z.literal("roll"), turnId: z.string(), characterId: z.string(), result: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("continue"), turnId: z.string() }),
  z.object({
    kind: z.literal("positions"),
    turnId: z.string(),
    appliedMovement: z.string().optional(),
    positions: z.record(z.string(), z.object({ x: z.number().finite(), z: z.number().finite(), ry: z.number().finite() })),
  }),
])
export type GameCommand = z.infer<typeof commandSchema>
export function game(store: LocalStore, packs: Packs, llm: Llm) {
  const packFor = (plan: string) => {
    const pack = packs[plan]
    if (!pack) throw new Error("This adventure is not installed.")
    return pack
  }
  const content: Content = {
    isWikiAdventure: (setting, plan) => setting === "realm-of-myr" && plan in packs,
    loadWikiRuntime: async (_setting, plan) => packFor(plan),
    loadPlan: async (_setting, plan) => buildAdventurePlanViewFromArtifacts(packFor(plan).artifacts),
    loadLegacyPlan: async () => null,
    spatialContext: async (_setting, _plan, encounter, characters) => spatialContext(encounter, characters, store.state?.positions ?? {}, store.state?.figures),
  }
  let inferenceFailure: unknown
  const tracked: Llm = {
    async generateText(args) {
      try {
        return await llm.generateText({ ...args, prompt: args.prompt + characterContext(store.current().characters) })
      } catch (error) {
        inferenceFailure = error
        throw error
      }
    },
    async generateObject(args) {
      try {
        const advancement = args.schema instanceof z.ZodObject && "adventurePatch" in args.schema.shape
        const result = await llm.generateObject({ ...args, prompt: args.prompt + characterContext(store.current().characters, advancement) })
        if (advancement) {
          const patch = desktopPatchSchema.parse((result.object as { adventurePatch?: unknown }).adventurePatch ?? {})
          applyCharacterUpdates(store.current().characters, patch.characterUpdates)
        }
        return result
      } catch (error) {
        inferenceFailure = error
        throw error
      }
    },
  }
  // Some inherited web services recover failed inference with default prose or no roll.
  // Desktop must preserve a retryable checkpoint instead of committing that fallback.
  const writes = new Set(["submitReply", "updateTurn", "patchAdventure", "createTurn", "commitWikiTurnAdvance", "createAdventureWithFirstTurn"])
  const guardedStore = new Proxy(store, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (typeof value !== "function") return value
      return (...args: unknown[]) => {
        if (writes.has(String(key)) && inferenceFailure) throw inferenceFailure
        return value.apply(target, args)
      }
    },
  })
  const core = createGmCore({ llm: tracked, store: guardedStore, content, narration: { afterTurn() {} }, identity: async () => "local-player", sleep: async () => {} })
  async function autonomous() {
    await core.processNpcTurnsAfterCurrent(store.current()._id)
    const actor = findCurrentActor(store.current().characters)
    if (actor?.type === "npc" || actor?.controlledBy === "ai") throw new Error("The GM could not finish this character's turn. Continue to retry.")
  }
  return async (input: GameCommand) => {
    inferenceFailure = undefined
    const command = commandSchema.parse(input)
    if (command.kind === "load") return store.state
    if (command.kind === "resume") {
      store.resume(command.archiveId)
      return store.state
    }
    if (command.kind === "remove") {
      store.remove(command.archiveId)
      return store.state
    }
    if (command.kind === "start") {
      if (store.state && !command.replace) throw new Error("An adventure is already saved. Continue it.")
      const plan = command.adventure ?? "march-of-davos"
      const { artifacts } = packFor(plan)
      const encounter = artifacts.encounters[artifacts.manifest.startEncounterId]
      const id = randomUUID(),
        turnId = randomUUID()
      const party = partyFor(packFor(plan), command.party ?? (PARTY[plan] ?? artifacts.manifest.premadeCharacterIds).map((id) => ({ id, ai: false })), store.heroes())
      const characters = buildLocalWikiTurnCharacters({ artifacts, encounter, players: party.players, sheetsByCharacterId: party.sheets })
      store.replace({
        version: 1,
        provider: command.provider,
        rolls: {},
        movement: {},
        positions: {},
        figures: party.figures,
        painted: party.painted,
        adventure: {
          _id: id,
          title: artifacts.manifest.title,
          settingId: "realm-of-myr",
          planId: plan,
          ownerId: "local-player",
          playerIds: ["local-player"],
          currentTurnId: turnId,
          currentEncounterId: encounter.id,
          status: "active",
          discoveries: [],
          entityUpdates: [],
          openThreads: [],
          resolvedThreadIds: [],
          adventureSummaryMarkdown: "",
        },
        turns: [{ _id: turnId, adventureId: id, encounterId: encounter.id, title: encounter.title, narrative: encounter.sections.intro ?? "", characters, order: 1 }],
      })
      return store.state
    }
    const turn = store.turn(command.turnId)
    if (command.kind === "positions") {
      store.state!.positions = command.positions
      if (command.appliedMovement && !store.state!.movement[command.appliedMovement]) throw new Error("Unknown stage movement.")
      if (command.appliedMovement) store.state!.appliedMovement = [...new Set([...(store.state!.appliedMovement ?? []), command.appliedMovement])]
      store.save()
      return store.state
    }
    if (store.state!.adventure.status === "completed") throw new Error("This adventure is complete.")
    if (command.kind === "continue") {
      const current = findCurrentActor(turn.characters)
      if (current?.type === "pc" && current.controlledBy !== "ai") throw new Error("A player character still needs to act.")
      await autonomous()
      if (!findCurrentActor(store.current().characters)) {
        await core.advanceTurn({ turnId: turn._id, settingId: "realm-of-myr", adventurePlanId: store.state!.adventure.planId })
        // Deliberately let the new encounter's intro be read before the next NPC action.
      }
    } else {
      const actor = findCurrentActor(turn.characters)
      if (actor?.id !== command.characterId || actor.type !== "pc" || actor.controlledBy === "ai") throw new Error("It is another character's turn.")
      if (command.kind === "reply") {
        if (actor.hasReplied) throw new Error("This reply is already saved. Resolve the pending roll.")
        const action = await core.formatNarrativeAction({ characterName: actor.name, gender: actor.gender, playerInput: command.text, narrativeContext: turn.narrative, characterInfo: actor })
        // Movement is interpreted only for a staged encounter. No Next server action is involved.
        if (command.movement) {
          const intent = (await llm.generateObject({ prompt: movementPrompt({ ...command.movement, action: command.text }), system: MOVEMENT_SYSTEM, schema: movementIntentSchema })).object
          store.state!.movement[`${turn._id}:${actor.id}`] = { actorId: actor.id, intent }
        }
        await core.processTurnReply({ turnId: turn._id, characterId: actor.id, narrativeAction: action, originalPlayerInput: command.text })
      } else {
        if (!actor.rollRequired || actor.rollResult !== undefined) throw new Error("There is no pending roll.")
        const key = `${turn._id}:${actor.id}`
        store.state!.rolls[key] ??= command.result
        store.save()
        await core.resolvePlayerRollResult({ turnId: turn._id, characterId: actor.id, result: store.state!.rolls[key] })
      }
    }
    return store.state
  }
}
