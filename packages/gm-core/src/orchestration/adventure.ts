import { assertPlayerCharacterControl, createAdventureAccess } from "../access"
import type { GmPorts } from "../ports"
import { createAdventureFirstTurnService } from "../services/adventure-first-turn-service"
import { createAdventureRollResultService, getEncounterInstructionsFromPlan } from "../services/adventure-roll-result-service"
import { createAdventureTurnReplyService } from "../services/adventure-turn-reply-service"
import { createNarrativeGenerationService } from "../services/narrative-generation-service"
import { createNpcTurnService } from "../services/npc-turn-service"
import { type StandingOrders, standingOrdersSchema } from "../sheet/turn-effect"
import type { StoryBeat } from "../story/beats"
import { storyProse } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { RequiredCast, RequiredRoll, RollRequirement } from "../validations/roll-requirement-schema"

export function createAdventure(ports: GmPorts) {
  const { assertAdventureAccessByTurn } = createAdventureAccess(ports)
  const { buildFirstTurnSetup } = createAdventureFirstTurnService(ports)
  const { resolvePlayerRollNarrativeAndCharacters } = createAdventureRollResultService(ports)
  const { readTurnReply, applyReading } = createAdventureTurnReplyService(ports)
  const { processNpcTurnsAfterCurrent } = createNpcTurnService(ports)
  const { writeReply } = createNarrativeGenerationService(ports)
  const loadAdventurePlanForRuntime = ports.content.loadPlan.bind(ports.content)
  // `story` is the reply as the hero's beats, from writeReply. The player's own words go before it.
  async function processTurnReply({ turnId, characterId, originalPlayerInput, story }: { turnId: string; characterId: string; originalPlayerInput?: string; story: StoryBeat[] }) {
    const userId = await ports.identity()
    if (!userId) {
      console.error("[processTurnReply] Unauthorized access attempt.")
      throw new Error("Unauthorized")
    }

    const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)

    const characterPerformingAction = assertPlayerCharacterControl(userId, turn, characterId)
    const narrativeAction = storyProse(story)
    const reply: StoryBeat[] = [
      ...(originalPlayerInput ? [{ kind: "reply" as const, by: { step: "reply" as const, character: characterId }, character: characterId, text: originalPlayerInput }] : []),
      ...story,
    ]
    const reading = await readTurnReply({
      turn,
      adventure,
      characterPerformingAction,
      narrativeAction,
      originalPlayerInput,
    })
    const rollRequirementDetails: RollRequirement = reading.roll

    if (rollRequirementDetails) {
      await ports.store.submitReply({
        turnId,
        characterId,
        story: reply,
        rollRequirement: rollRequirementDetails,
      })
      // A Bonus Action used beside the roll is applied now, before the die is thrown. A hero dropped as they moved
      // throws nothing: their turn is over, and the others play on.
      const { fell } = await applyReading({ turnId, characterId, reading })
      if (fell && ports.npcTurnsPerCall === undefined) await processNpcTurnsAfterCurrent(turnId)
      ports.narration.afterTurn(turnId)
      return { rollRequired: fell ? null : rollRequirementDetails }
    }
    await ports.store.submitReply({
      turnId,
      characterId,
      story: reply,
      rollRequirement: undefined,
    })
    // An action with no roll (Dodge, Help) is the hero's whole turn: what it leaves is written before anyone else acts.
    const { fell } = await applyReading({ turnId, characterId, reading })
    // A spell that asks for no throw is resolved now: the engine rolls it, and the GM tells it.
    if (reading.cast && !fell) await resolveCast({ turnId, characterId, cast: reading.cast })
    if (ports.npcTurnsPerCall === undefined) await processNpcTurnsAfterCurrent(turnId)
    ports.narration.afterTurn(turnId)
    return { rollRequired: null }
  }

  // A player's reply in their own words: written into the story as their hero's beats, then taken as the hero's turn.
  async function processPlayerReply({ turnId, characterId, playerInput }: { turnId: string; characterId: string; playerInput: string }) {
    const userId = await ports.identity()
    if (!userId) throw new Error("Unauthorized")
    const { turn } = await assertAdventureAccessByTurn(userId, turnId)
    const character = assertPlayerCharacterControl(userId, turn, characterId) as TurnCharacter
    const story = await writeReply({ character, playerInput, turn: { ...turn, characters: turn.characters as TurnCharacter[] } })
    return processTurnReply({ turnId, characterId, originalPlayerInput: playerInput, story })
  }

  async function createAdventureWithFirstTurn(payload: {
    planId: string
    settingId: string
    ownerId: string
    playerIds: string[]
    title: string
    startedAt: number
    playerInput: string
    turn: {
      encounterId: string
      story: StoryBeat[]
      characters: TurnCharacter[]
      order: number
    }
  }) {
    const userId = await ports.identity()
    if (!userId) throw new Error("Unauthorized")

    const firstTurnSetup = await buildFirstTurnSetup({
      settingId: payload.settingId,
      planId: payload.planId,
      encounterId: payload.turn.encounterId,
      story: payload.turn.story,
      playerInput: payload.playerInput,
      characters: payload.turn.characters,
    })

    // The player's first words, written into the story as their hero's beats.
    const hero = payload.turn.characters.find((c) => c.type === "pc")
    const reply: StoryBeat[] =
      hero && payload.playerInput.trim()
        ? [
            { kind: "reply", by: { step: "reply", character: hero.id }, character: hero.id, text: payload.playerInput },
            ...(await writeReply({ character: hero, playerInput: payload.playerInput, turn: payload.turn })),
          ]
        : []
    const turnWithTitle = {
      ...payload.turn,
      story: [...payload.turn.story, ...reply],
      title: firstTurnSetup.turnTitle,
    }

    // Overwrite ownerId with the authenticated user
    const result = await ports.store.createAdventureWithFirstTurn({
      ...payload,
      settingId: payload.settingId,
      ownerId: userId,
      turn: turnWithTitle, // Pass the turn object with the title
      rollRequirement: firstTurnSetup.rollRequirement,
    })
    ports.narration.afterTurn(result.turnId)
    return result
  }

  // A spell cast that takes no d20 of the caster's: resolved as the reply is read, with the turn as it then stands.
  async function resolveCast({ turnId, characterId, cast }: { turnId: string; characterId: string; cast: RequiredCast }) {
    const turn = await ports.store.getTurn({ turnId })
    if (!turn) throw new Error("Turn not found")
    const adventure = await ports.store.getAdventure({ adventureId: turn.adventureId })
    if (!adventure) throw new Error("Adventure not found")
    const character = (turn.characters as TurnCharacter[]).find((entry) => entry.id === characterId)
    if (!character) throw new Error("Character not found")
    const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
    if (!plan || !Array.isArray(plan.sections)) throw new Error("Adventure plan not found or invalid")
    const resolution = await resolvePlayerRollNarrativeAndCharacters({
      turn: {
        _id: turn._id,
        encounterId: turn.encounterId,
        title: turn.title,
        story: turn.story,
        characters: turn.characters as TurnCharacter[],
        adventureId: turn.adventureId,
        isFinalEncounter: turn.isFinalEncounter,
      },
      character: { ...character, rollRequired: cast },
      characterId,
      encounterInstructions: getEncounterInstructionsFromPlan(plan, turn.encounterId),
      playerDeath: plan.playerDeath,
      premise: plan.premise,
      knowledge: adventure.knowledge,
      strangers: plan.strangers,
    })
    await ports.store.updateTurn({ turnId, patch: { story: resolution.story, characters: resolution.characters, updatedAt: Date.now() } })
  }

  // `result` is the d20 the player rolled, and `second` the other one of a roll with Advantage or Disadvantage.
  async function resolvePlayerRollResult({ turnId, characterId, result, second }: { turnId: string; characterId: string; result: number; second?: number }) {
    const userId = await ports.identity()
    if (!userId) throw new Error("Unauthorized")

    // 1. Fetch and authorize turn access + character control
    const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)
    const character = assertPlayerCharacterControl(userId, turn, characterId)
    if (!character.rollRequired) throw new Error("No roll required for this character")
    if (typeof character.rollResult === "number") throw new Error("Roll already completed")

    // 2. Fetch the adventure plan (wiki runtime for migrated adventures, legacy S3 JSON otherwise)
    const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
    if (!plan || !Array.isArray(plan.sections)) throw new Error("Adventure plan not found or invalid")

    // 3. Extract encounter instructions
    const encounterInstructions = getEncounterInstructionsFromPlan(plan, turn.encounterId)

    // 4. Resolve narrative + character updates for the roll
    const rollResolution = await resolvePlayerRollNarrativeAndCharacters({
      turn: {
        _id: turn._id,
        encounterId: turn.encounterId,
        title: turn.title,
        story: turn.story,
        characters: turn.characters as TurnCharacter[],
        adventureId: turn.adventureId,
        isFinalEncounter: turn.isFinalEncounter,
      },
      character: character as TurnCharacter & { rollRequired: RequiredRoll },
      characterId,
      dice: second === undefined ? [result] : [result, second],
      encounterInstructions,
      playerDeath: plan.playerDeath,
      premise: plan.premise,
      knowledge: adventure.knowledge,
      strangers: plan.strangers,
    })

    // 5. Patch the turn with the new narrative and character state
    await ports.store.updateTurn({
      turnId,
      patch: {
        story: rollResolution.story,
        characters: rollResolution.characters,
        updatedAt: Date.now(),
      },
    })

    // After marking player complete, process NPCs
    if (ports.npcTurnsPerCall === undefined) await processNpcTurnsAfterCurrent(turnId)

    ports.narration.afterTurn(turnId)

    // 6. Return the updated turn
    return await ports.store.getTurn({ turnId })
  }
  // A player's answer to a reaction offered to their hero: take it or let it pass. The NPC's turn that waited on it is
  // then played on. An answer for an offer that is gone, or for someone else's hero, is refused.
  async function answerReaction({ turnId, characterId, take }: { turnId: string; characterId: string; take: boolean }) {
    const userId = await ports.identity()
    if (!userId) throw new Error("Unauthorized")
    const { turn } = await assertAdventureAccessByTurn(userId, turnId)
    assertPlayerCharacterControl(userId, turn, characterId)
    const waiting = turn.reaction
    if (!waiting || waiting.offer.to !== characterId) throw new Error("No reaction is offered to this character.")
    await ports.store.updateTurn({ turnId, patch: { reaction: { ...waiting, answer: take }, updatedAt: Date.now() } })
    if (ports.npcTurnsPerCall === undefined) await processNpcTurnsAfterCurrent(turnId)
    return { answered: true }
  }

  // A player's standing orders for their hero's reactions: what the hero does when an offer goes unanswered.
  async function setStandingOrders({ turnId, characterId, orders }: { turnId: string; characterId: string; orders: StandingOrders }) {
    const userId = await ports.identity()
    if (!userId) throw new Error("Unauthorized")
    const { turn } = await assertAdventureAccessByTurn(userId, turnId)
    assertPlayerCharacterControl(userId, turn, characterId)
    const standingOrders = standingOrdersSchema.parse(orders)
    await ports.store.updateTurn({
      turnId,
      patch: { characters: (turn.characters as TurnCharacter[]).map((character) => (character.id === characterId ? { ...character, standingOrders } : character)), updatedAt: Date.now() },
    })
    return { standingOrders }
  }

  return { processTurnReply, processPlayerReply, createAdventureWithFirstTurn, resolvePlayerRollResult, answerReaction, setStandingOrders }
}
