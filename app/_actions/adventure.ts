"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateText } from "@/lib/ai"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { appendNarrative, getRollRequirementHelper } from "@/lib/services/narrative-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"
import type { TurnCharacter } from "@/types/adventure"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC } from "@/types/character"
import { auth } from "@clerk/nextjs/server"
import wait from "waait"

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

  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) {
    console.error("[processTurnReply] Turn not found for turnId:", turnId)
    throw new Error("Turn not found")
  }

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) {
    console.error("[processTurnReply] Adventure not found for adventureId:", turn.adventureId)
    throw new Error("Adventure not found")
  }

  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan) {
    console.error("[processTurnReply] Adventure plan not found at path:", planPath)
    throw new Error("Adventure plan not found")
  }

  const encounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((e) => e.id === turn.encounterId)
  if (!encounter) {
    console.error("[processTurnReply] Encounter not found for encounterId:", turn.encounterId)
    throw new Error("Encounter not found")
  }

  const characterPerformingAction = turn.characters.find((c) => c.id === characterId)
  if (!characterPerformingAction) {
    console.error("[processTurnReply] Character performing action not found for characterId:", characterId)
    throw new Error("Character performing action not found in turn data")
  }

  // Use originalPlayerInput if available to preserve player intent, fallback to narrativeAction
  const actionToAnalyze = originalPlayerInput?.trim() ? originalPlayerInput : narrativeAction

  // Log LLM analysis start
  console.log("[LLM] Analyzing action for roll requirement:", {
    action: actionToAnalyze,
    isOriginalInput: !!originalPlayerInput?.trim(),
    character: characterPerformingAction.name,
    encounter: encounter.id,
  })

  // Call roll requirement service (returns RollRequirement | null)
  const assessment = await getRollRequirementForAction(actionToAnalyze, characterPerformingAction as import("@/types/character").Character, {
    encounterInstructions: encounter.instructions || "",
    narrativeContext: turn.narrative || "",
    encounterIntro: encounter.intro || "",
  })

  // If assessment is null, no roll required; otherwise we have roll details

  // If plausible, proceed with existing logic
  const rollRequirementDetails: RollRequirement = assessment

  console.log("[LLM] Roll requirement analysis result:", {
    requiresRoll: !!rollRequirementDetails,
    rollType: rollRequirementDetails?.rollType,
    difficulty: rollRequirementDetails?.difficulty,
  })

  if (rollRequirementDetails?.rollType && typeof rollRequirementDetails.difficulty === "number") {
    console.log("[LLM] Calculating roll modifier for:", rollRequirementDetails.rollType)

    // Calculate modifier using the enhanced getRollModifier function
    const modifierContext = {
      scenario: {
        encounterIntro: encounter.instructions || "",
        encounterInstructions: encounter.instructions || "",
        narrativeContext: turn.narrative || "",
      },
      rollRequirement: rollRequirementDetails,
      character: characterPerformingAction,
    }

    const calculatedModifier = await getRollModifier(modifierContext)
    rollRequirementDetails.modifier = calculatedModifier

    console.log("[LLM] Roll configuration:", {
      rollType: rollRequirementDetails.rollType,
      difficulty: rollRequirementDetails.difficulty,
      modifier: calculatedModifier,
    })

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

  // Read the adventure plan to get the encounter title
  const plan = (await readJsonFromS3(`settings/${payload.settingId}/${payload.planId}.json`)) as AdventurePlan
  if (!plan || !plan.sections) {
    throw new Error("Adventure plan not found or is invalid")
  }
  const firstEncounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((encounter) => encounter.id === payload.turn.encounterId)

  if (!firstEncounter || !firstEncounter.title) {
    throw new Error(`First encounter (ID: ${payload.turn.encounterId}) not found in plan or is missing a title.`)
  }

  const turnWithTitle = {
    ...payload.turn,
    title: firstEncounter.title,
  }

  // Prepare context for AI
  const paragraphs = (payload.turn.narrative || "").split(/\n\n+/).filter(Boolean)
  const lastAction = paragraphs[paragraphs.length - 1] || ""
  const encounterIntro = ""
  const encounterInstructions = ""
  const narrativeContext = paragraphs.slice(-2).join("\n\n")
  let rollRequirement = null
  if (payload.playerInput && payload.playerInput.trim().length > 0) {
    rollRequirement = await getRollRequirementHelper(payload.playerInput, {
      encounterIntro,
      encounterInstructions,
      narrativeContext,
    })
    if (rollRequirement) {
      const actor = payload.turn.characters[0]
      const modifier = await getRollModifier({
        scenario: { encounterIntro, encounterInstructions, narrativeContext },
        rollRequirement,
        character: actor,
      })
      if (typeof modifier === "number") {
        rollRequirement.modifier = modifier
      }
    }
  }
  if (!rollRequirement && lastAction && lastAction.trim().length > 0) {
    rollRequirement = await getRollRequirementHelper(lastAction, {
      encounterIntro,
      encounterInstructions,
      narrativeContext,
    })
    if (rollRequirement) {
      const actor = payload.turn.characters[0]
      const modifier = await getRollModifier({
        scenario: { encounterIntro, encounterInstructions, narrativeContext },
        rollRequirement,
        character: actor,
      })
      if (typeof modifier === "number") {
        rollRequirement.modifier = modifier
      }
    }
  }

  // Overwrite ownerId with the authenticated user
  return convex.mutation(api.adventure.createAdventureWithFirstTurn, {
    ...payload,
    settingId: payload.settingId,
    ownerId: userId,
    turn: turnWithTitle, // Pass the turn object with the title
    rollRequirement,
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

  // 1. Fetch the turn
  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")
  const character = turn.characters.find((c) => c.id === characterId)
  if (!character) throw new Error("Character not found")
  if (!character.rollRequired) throw new Error("No roll required for this character")
  if (typeof character.rollResult === "number") throw new Error("Roll already completed")

  // 2. Fetch the adventure and plan
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) throw new Error("Adventure not found")
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan || !Array.isArray(plan.sections)) throw new Error("Adventure plan not found or invalid")

  // 3. Extract encounter instructions
  let encounterInstructions = ""
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((e: { id: string }) => e.id === turn.encounterId)
      if (encounter) {
        encounterInstructions = encounter.instructions || ""
        break
      }
    }
    if (encounterInstructions) break
  }

  // 4. Build the prompt and call the LLM
  const { rollType, difficulty, modifier = 0 } = character.rollRequired
  const baseRoll = result
  const totalResult = baseRoll + modifier
  const success = totalResult >= difficulty
  const margin = totalResult - difficulty
  const shortcode = `[DiceRoll:rollType=${rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? `+${modifier}` : modifier};result=${totalResult};difficulty=${difficulty};character=${character.name};image=${character.image};success=${success}]\n`

  let newNarrative = appendNarrative(turn.narrative || "", shortcode)

  // Build stricter prompt context and capture the actual player action text
  const paragraphs = (turn.narrative || "").split(/\n\n+/).filter(Boolean)
  const playerActionText = paragraphs[paragraphs.length - 1] || ""
  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-2).join("\n\n")
  // Note: we let the LLM decide whether to respond, based on clear instructions

  const rollOutcomePrompt = `
Context:
${narrativeContext}

Encounter Instructions:
${encounterInstructions}

Player action (verbatim): """${playerActionText}"""
  
A dice roll was made for ${character.name}: ${rollType} (Result: ${totalResult}, Difficulty: ${difficulty}, Margin: ${margin}).

  Guidelines:
  - Prefer restraint. Only bring an NPC into the outcome if the player action clearly engages them now.
  - Do not narrate speech or actions for player characters.
  - If the action is exclusively between player characters or naturally requires no DM narration, output nothing.
  - Do not invent new objects, people, events, or details. Use only the encounter instructions/intro and established narrative.

Write a single, concise, immersive third-person PRESENT-tense narrative paragraph (exactly two sentences, max 60 words) describing only the immediate outcome of the roll as it pertains to the engaged NPC (if any). If no NPC is engaged, output nothing.

Write in third person PRESENT tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons. Never mention game mechanics, dice, or rules.

Output only the narrative paragraph, or output nothing if no DM narration applies.`.trim()

  let rollOutcome = ""
  try {
    const { text } = await generateText({ prompt: rollOutcomePrompt })
    rollOutcome = (text || "").trim()
    if (rollOutcome) {
      newNarrative = appendNarrative(newNarrative, rollOutcome)
    }
  } catch (err) {
    console.error("[resolvePlayerRollResult] Error generating roll outcome:", err)
  }

  // 5. Use analyzeAndApplyDiceRoll to update healthPercent/status if needed
  const diceRoll = {
    rollType,
    baseRoll,
    modifier,
    result: totalResult,
    difficulty,
    character: character.name,
    success,
  }
  await wait(500)

  // Only analyze for health changes on roll types that could affect health
  const healthAffectingRolls = ["Attack", "Constitution", "Strength", "Dexterity"]
  const shouldAnalyzeHealth = rollOutcome && healthAffectingRolls.includes(rollType)

  console.log(`[resolvePlayerRollResult] Roll analysis: rollType=${rollType}, hasOutcome=${!!rollOutcome}, shouldAnalyzeHealth=${shouldAnalyzeHealth}`)

  const updatedTurn = shouldAnalyzeHealth
    ? await analyzeAndApplyDiceRoll({
        turn: {
          ...turn,
          id: turn._id,
          characters: turn.characters.map(
            (c) =>
              ({
                ...c,
                healthPercent: typeof c.healthPercent === "number" ? c.healthPercent : 100,
              }) as TurnCharacter
          ),
        },
        diceRoll,
        narrative: newNarrative,
      })
    : {
        ...turn,
        id: turn._id,
        characters: turn.characters.map(
          (c) =>
            ({
              ...c,
              healthPercent: typeof c.healthPercent === "number" ? c.healthPercent : 100,
            }) as TurnCharacter
        ),
      }

  // Ensure the rolling character is marked complete and roll fields are set
  const updatedCharacters = updatedTurn.characters.map((c) =>
    c.id === characterId
      ? {
          ...c,
          rollRequired: undefined,
          rollResult: totalResult,
          isComplete: true,
          hasReplied: true,
        }
      : c
  )

  // 6. Patch the turn with the new narrative and character state
  await convex.mutation(api.turns.updateTurn, {
    turnId,
    patch: {
      narrative: newNarrative,
      characters: updatedCharacters,
      updatedAt: Date.now(),
    },
  })

  // After marking player complete, process NPCs
  await processNpcTurnsAfterCurrent(turnId)

  // 7. Return the updated turn
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
  // Prioritize active, then waitingForPlayers
  const adventure = activeAdventures?.[0] || waitingAdventures?.[0]

  if (!adventure) return null

  // Load the adventure plan for party info
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const adventurePlan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!adventurePlan) return null

  // Map players to full PC objects from adventure plan
  const party: PC[] = (adventure.players || [])
    .map((player: { userId: string; characterId: string }) => {
      if (Array.isArray(adventurePlan.premadePlayerCharacters)) {
        const character = adventurePlan.premadePlayerCharacters.find((pc) => pc.id === player.characterId)
        if (character) {
          return { ...character, userId: player.userId }
        }
      }
      return null
    })
    .filter((char): char is PC => char !== null)

  // Return a shape compatible with Adventure type
  return {
    id: adventure._id,
    title: adventure.title,
    adventurePlanId: adventure.planId,
    settingId: adventure.settingId,
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
  return convex.query(api.adventure.getAdventureLobbyData, { adventureId })
}
