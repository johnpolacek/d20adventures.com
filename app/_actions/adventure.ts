"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess, assertAdventureAccessByTurn, assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { buildFirstTurnSetup } from "@/lib/services/adventure-first-turn-service"
import {
  getEncounterInstructionsFromPlan,
  resolvePlayerRollNarrativeAndCharacters,
} from "@/lib/services/adventure-roll-result-service"
import { buildTurnReplyRollRequirement } from "@/lib/services/adventure-turn-reply-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"
import type { TurnCharacter } from "@/types/adventure"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC } from "@/types/character"
import { auth } from "@clerk/nextjs/server"

// Using RollRequirement union (object | null) from validation schema

export async function processTurnReply({
  turnId,
  characterId,
  narrativeAction,
  originalPlayerInput,
}: { turnId: Id<"turns">; characterId: string; narrativeAction: string; originalPlayerInput?: string }) {
  const { userId } = await auth()
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
    await convex.mutation(api.adventure.submitReply, {
      turnId,
      characterId,
      narrativeAction,
      originalPlayerInput,
      rollRequirement: rollRequirementDetails,
    })
    return { rollRequired: rollRequirementDetails }
  }
  await convex.mutation(api.adventure.submitReply, {
    turnId,
    characterId,
    narrativeAction,
    originalPlayerInput,
    rollRequirement: undefined,
  })
  await processNpcTurnsAfterCurrent(turnId)
  return { rollRequired: null }
}

export async function createAdventureWithFirstTurn(payload: {
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
  const { userId } = await auth()
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
  return convex.mutation(api.adventure.createAdventureWithFirstTurn, {
    ...payload,
    settingId: payload.settingId,
    ownerId: userId,
    turn: turnWithTitle, // Pass the turn object with the title
    rollRequirement: firstTurnSetup.rollRequirement,
  })
}

export async function resolvePlayerRollResult({
  turnId,
  characterId,
  result,
}: {
  turnId: Id<"turns">
  characterId: string
  result: number
}) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  // 1. Fetch and authorize turn access + character control
  const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)
  const character = assertPlayerCharacterControl(userId, turn, characterId)
  if (!character.rollRequired) throw new Error("No roll required for this character")
  if (typeof character.rollResult === "number") throw new Error("Roll already completed")

  // 2. Fetch the adventure plan
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
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
  })

  // 5. Patch the turn with the new narrative and character state
  await convex.mutation(api.turns.updateTurn, {
    turnId,
    patch: {
      narrative: rollResolution.narrative,
      characters: rollResolution.characters,
      updatedAt: Date.now(),
    },
  })

  // After marking player complete, process NPCs
  await processNpcTurnsAfterCurrent(turnId)

  // 6. Return the updated turn
  return await convex.query(api.adventure.getTurnById, { turnId })
}

export async function getActiveAdventureForUser() {
  const { userId } = await auth()
  if (!userId) return null

  // Query for adventures where the user is a player and status is 'active' or 'waitingForPlayers'
  const activeAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "active",
  })
  const waitingAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "waitingForPlayers",
  })

  const getRunPriority = (adventure: { runType?: "campaign" | "practice" }) => ((adventure.runType ?? "campaign") === "campaign" ? 0 : 1)
  const prioritizedActive = [...activeAdventures].sort((a, b) => getRunPriority(a) - getRunPriority(b))
  const prioritizedWaiting = [...waitingAdventures].sort((a, b) => getRunPriority(a) - getRunPriority(b))

  // Prefer active campaign, then active practice, then waiting campaign, then waiting practice.
  const adventure = prioritizedActive[0] || prioritizedWaiting[0]

  if (!adventure) return null

  // Load the adventure plan for party info
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const adventurePlan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!adventurePlan) return null

  // Map players to full PC objects from adventure plan
  const partyResults = await Promise.all(
    (adventure.players || []).map(async (player: { userId: string; characterId: string }) => {
      if (typeof player.characterId === "string" && player.characterId.startsWith("characters/")) {
        try {
          const character = (await readJsonFromS3(player.characterId)) as PC
          return { ...character, userId: player.userId }
        } catch {
          return null
        }
      }

      if (Array.isArray(adventurePlan.premadePlayerCharacters)) {
        const character = adventurePlan.premadePlayerCharacters.find((pc) => pc.id === player.characterId)
        if (character) {
          return { ...character, userId: player.userId }
        }
      }

      return null
    })
  )
  const party = partyResults.filter((char): char is PC => char !== null)

  // Return a shape compatible with Adventure type
  return {
    id: adventure._id,
    title: adventure.title,
    adventurePlanId: adventure.planId,
    settingId: adventure.settingId,
    ownerId: adventure.ownerId,
    runType: adventure.runType ?? "campaign",
    parentAdventureId: adventure.parentAdventureId,
    parentTurnId: adventure.parentTurnId,
    status: adventure.status,
    party,
    turns: [],
    startedAt: adventure.startedAt ? new Date(adventure.startedAt).toISOString() : "",
    endedAt: adventure.endedAt ? new Date(adventure.endedAt).toISOString() : undefined,
    pausedAt: undefined,
  } as Adventure
}

export async function getAdventuresForUser() {
  const { userId } = await auth()
  if (!userId) return []

  // Fetch all adventures for this user (all statuses)
  const allStatuses: ("active" | "waitingForPlayers" | "completed")[] = ["active", "waitingForPlayers", "completed"]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adventures: any[] = []
  for (const status of allStatuses) {
    const result = await convex.query(api.adventure.getAdventuresByPlayer, {
      playerId: userId,
      status,
    })
    adventures = adventures.concat(result)
  }
  // Remove duplicates by id

  const unique = Object.values(
    adventures.reduce(
      (acc, adv) => {
        acc[adv._id] = adv
        return acc
      },
      {} as Record<string, (typeof adventures)[number]>
    )
  )
  return unique
}

export async function getNextAdventure({ settingId, adventurePlanId }: { settingId: string; adventurePlanId: string }) {
  // No auth required, this is public data
  const planPath = `settings/${settingId}/${adventurePlanId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan | null
  if (!plan) return null
  return plan.nextAdventure || null
}

export async function getAdventureLobbyData(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.adventure.getAdventureLobbyData, { adventureId })
}
