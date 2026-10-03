import { randomUUID } from "node:crypto"
import { type Content, createGmCore, type Llm } from "@d20/gm-core"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import type { RuntimeArtifacts } from "@d20/gm-core/wiki-adventures/types"
import { MOVEMENT_SYSTEM, movementIntentSchema, movementPrompt } from "@d20/stage/movement"
import { z } from "zod"
import { applyCharacterUpdates, characterContext, desktopPatchSchema } from "./characters"
import type { LocalStore } from "./store"

export type Pack = { artifacts: RuntimeArtifacts; contentRef: Awaited<ReturnType<Content["loadWikiRuntime"]>>["contentRef"]; definition: { promptSlug: string } }
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("load") }),
  z.object({ kind: z.literal("start"), provider: z.enum(["claude", "codex", "grok", "gemini"]) }),
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
export function game(store: LocalStore, pack: Pack, llm: Llm) {
  const { artifacts } = pack
  const content: Content = {
    isWikiAdventure: (setting, plan) => setting === "realm-of-myr" && plan === "march-of-davos",
    loadWikiRuntime: async () => pack,
    loadPlan: async () => buildAdventurePlanViewFromArtifacts(artifacts),
    loadLegacyPlan: async () => null,
    spatialContext: async (_setting, _plan, encounter) =>
      encounter === "the-gates-of-kordavos" ? `The party stands at Garlan's checkpoint. Saved stage positions in metres: ${JSON.stringify(store.state?.positions ?? {})}` : undefined,
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
    if (command.kind === "start") {
      if (store.state) throw new Error("An adventure is already saved. Continue it.")
      const encounter = artifacts.encounters[artifacts.manifest.startEncounterId]
      const id = randomUUID(),
        turnId = randomUUID()
      const characters = buildLocalWikiTurnCharacters({
        artifacts,
        encounter,
        players: ["branka-stoneveil", "cassia-verane", "yeva-softstep", "milos-radan"].map((characterId) => ({ characterId, userId: "local-player" })),
      })
      store.state = {
        version: 1,
        provider: command.provider,
        rolls: {},
        movement: {},
        positions: {},
        adventure: {
          _id: id,
          title: "March of Davos",
          settingId: "realm-of-myr",
          planId: "march-of-davos",
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
      }
      store.save()
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
      if (findCurrentActor(turn.characters)?.type === "pc") throw new Error("A player character still needs to act.")
      await autonomous()
      if (!findCurrentActor(store.current().characters)) {
        await core.advanceTurn({ turnId: turn._id, settingId: "realm-of-myr", adventurePlanId: "march-of-davos" })
        // Deliberately let the new encounter's intro be read before the next NPC action.
      }
    } else {
      const actor = findCurrentActor(turn.characters)
      if (actor?.id !== command.characterId || actor.type !== "pc") throw new Error("It is another character's turn.")
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
