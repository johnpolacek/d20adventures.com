import { assertPlayerCharacterControl, createAdventureAccess } from "../access"
import type { GmPorts } from "../ports"
import { createAdventureFirstTurnService } from "../services/adventure-first-turn-service"
import { createAdventureRollResultService, getEncounterInstructionsFromPlan } from "../services/adventure-roll-result-service"
import { createAdventureTurnReplyService } from "../services/adventure-turn-reply-service"
import { createNpcTurnService } from "../services/npc-turn-service"
import type { TurnCharacter } from "../types/adventure"
import type { RollRequirement } from "../validations/roll-requirement-schema"

export function createAdventure(ports: GmPorts) {
  const { assertAdventureAccessByTurn } = createAdventureAccess(ports)
  const { buildFirstTurnSetup } = createAdventureFirstTurnService(ports)
  const { resolvePlayerRollNarrativeAndCharacters } = createAdventureRollResultService(ports)
  const { buildTurnReplyRollRequirement } = createAdventureTurnReplyService(ports)
  const { processNpcTurnsAfterCurrent } = createNpcTurnService(ports)
  const loadAdventurePlanForRuntime = ports.content.loadPlan.bind(ports.content)
  async function processTurnReply({ turnId, characterId, narrativeAction, originalPlayerInput }: { turnId: string; characterId: string; narrativeAction: string; originalPlayerInput?: string }) {
    const userId = await ports.identity()
    if (!userId) {
      console.error("[processTurnReply] Unauthorized access attempt.")
      throw new Error("Unauthorized")
    }

    const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)

    const characterPerformingAction = assertPlayerCharacterControl(userId, turn, characterId)
    const rollRequirementDetails: RollRequirement = await buildTurnReplyRollRequirement({
      turn,
      adventure,
      characterPerformingAction,
      narrativeAction,
      originalPlayerInput,
    })

    if (rollRequirementDetails?.rollType && typeof rollRequirementDetails.difficulty === "number") {
      await ports.store.submitReply({
        turnId,
        characterId,
        narrativeAction,
        originalPlayerInput,
        rollRequirement: rollRequirementDetails,
      })
      ports.narration.afterTurn(turnId)
      return { rollRequired: rollRequirementDetails }
    }
    await ports.store.submitReply({
      turnId,
      characterId,
      narrativeAction,
      originalPlayerInput,
      rollRequirement: undefined,
    })
    await processNpcTurnsAfterCurrent(turnId)
    ports.narration.afterTurn(turnId)
    return { rollRequired: null }
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
      narrative: string
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
      narrative: payload.turn.narrative,
      playerInput: payload.playerInput,
      characters: payload.turn.characters,
    })

    const turnWithTitle = {
      ...payload.turn,
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

  async function resolvePlayerRollResult({ turnId, characterId, result }: { turnId: string; characterId: string; result: number }) {
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
        narrative: turn.narrative,
        characters: turn.characters as TurnCharacter[],
        adventureId: turn.adventureId,
        isFinalEncounter: turn.isFinalEncounter,
      },
      character: character as TurnCharacter & {
        rollRequired: {
          rollType: string
          difficulty: number
          modifier?: number
        }
      },
      characterId,
      baseRollResult: result,
      encounterInstructions,
      playerDeath: plan.playerDeath,
    })

    // 5. Patch the turn with the new narrative and character state
    await ports.store.updateTurn({
      turnId,
      patch: {
        narrative: rollResolution.narrative,
        characters: rollResolution.characters,
        updatedAt: Date.now(),
      },
    })

    // After marking player complete, process NPCs
    await processNpcTurnsAfterCurrent(turnId)

    ports.narration.afterTurn(turnId)

    // 6. Return the updated turn
    return await ports.store.getTurn({ turnId })
  }
  return { processTurnReply, createAdventureWithFirstTurn, resolvePlayerRollResult }
}
