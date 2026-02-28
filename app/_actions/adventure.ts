"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateText } from "@/lib/ai"
import { assertAdventureAccess, assertAdventureAccessByTurn, assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { appendNarrative, getRollRequirementHelper } from "@/lib/services/narrative-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { detectSpellFromRollType, markSpellAsUsed } from "@/lib/services/spell-tracking-service"
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

  const { turn, adventure } = await assertAdventureAccessByTurn(userId, turnId)

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

  const characterPerformingAction = assertPlayerCharacterControl(userId, turn, characterId)

  // Fetch recent turns for context (same pattern as advanceTurn)
  const allTurns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId: turn.adventureId })
  const currentTurnOrder = turn.order || 1

  const recentTurnNarratives = allTurns
    .filter((t) => t.order <= currentTurnOrder)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(-3) // Last 3 turns including current
    .map((t) => t.narrative || "")
    .join("\n\n---\n\n")

  // Use originalPlayerInput if available to preserve player intent, fallback to narrativeAction
  const actionToAnalyze = originalPlayerInput?.trim() ? originalPlayerInput : narrativeAction

  // Log LLM analysis start
  console.log("[LLM] Analyzing action for roll requirement:", {
    action: actionToAnalyze,
    isOriginalInput: !!originalPlayerInput?.trim(),
    character: characterPerformingAction.name,
    encounter: encounter.id,
    recentTurnsCount: allTurns.filter((t) => t.order <= currentTurnOrder).length,
  })

  // Call roll requirement service (returns RollRequirement | null)
  const assessment = await getRollRequirementForAction(actionToAnalyze, characterPerformingAction as import("@/types/character").Character, {
    encounterInstructions: encounter.instructions || "",
    narrativeContext: recentTurnNarratives || turn.narrative || "",
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

  // Build list of NPCs actually present in this turn
  const presentNpcs = turn.characters
    .filter((c) => c.type === "npc")
    .map((c) => c.name)
    .join(", ")

  const rollOutcomePrompt = `
Context:
${narrativeContext}

Encounter Instructions:
${encounterInstructions}

CRITICAL: The encounter instructions may contain conditional statements (e.g., "If X is present..."). Only reference characters, objects, or events mentioned in conditionals if those conditions are actually met in the current scene. Do NOT assume conditional elements are present unless explicitly confirmed.

NPCs ACTUALLY PRESENT in this encounter:
${presentNpcs || "None"}

IMPORTANT: Only reference NPCs listed above. Do NOT reference characters mentioned in conditional statements unless they are confirmed to be present.

Player action (verbatim): """${playerActionText}"""
  
A dice roll was made for ${character.name}: ${rollType} (Result: ${totalResult}, Difficulty: ${difficulty}, Margin: ${margin}).

  Guidelines:
  - ALWAYS generate narrative if NPCs are present and the action relates to them (attacking, hiding from, avoiding, reacting to, interacting with, etc.). Actions that respond to NPC threats or presence should be narrated.
  - Generate narrative for successful rolls that affect or respond to NPCs (e.g., successfully hiding from a monster, avoiding an attack, etc.).
  - Do not narrate speech or actions for player characters.
  - Only output nothing if the action is EXCLUSIVELY between player characters with no NPC involvement AND no environmental consequences.
  - Do not invent new objects, people, events, or details. Use only the encounter instructions/intro and established narrative.
  - Only reference NPCs that are actually present (listed above).

Write a single, concise, immersive third-person PRESENT-tense narrative paragraph (exactly two sentences, max 60 words) describing the immediate outcome of the roll. Focus on how the NPC(s) react, perceive, or are affected by the action, or describe the environmental/atmospheric result of the successful roll.

Write in third person PRESENT tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons. Never mention game mechanics, dice, or rules.

Output only the narrative paragraph.`.trim()

  let rollOutcome = ""
  try {
    const { text } = await generateText({ prompt: rollOutcomePrompt })
    rollOutcome = (text || "").trim()
    
    // Filter out meta-commentary messages that the LLM sometimes outputs instead of nothing
    const metaCommentaryPatterns = [
      /\[No output provided.*?\]/i,
      /\[No narrative.*?\]/i,
      /\[Nothing to output.*?\]/i,
      /No output provided/i,
      /No narrative applies/i,
    ]
    
    const isMetaCommentary = metaCommentaryPatterns.some(pattern => pattern.test(rollOutcome))
    if (isMetaCommentary) {
      rollOutcome = ""
    }
    
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
  let updatedCharacters = updatedTurn.characters.map((c) =>
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

  // Check if a spell was cast and mark it as used
  const spellName = detectSpellFromRollType(rollType)
  if (spellName) {
    console.log(`[resolvePlayerRollResult] Spell detected: "${spellName}" - marking as used for character ${characterId}`)
    updatedCharacters = markSpellAsUsed(updatedCharacters, characterId, spellName)
  }

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
  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.adventure.getAdventureLobbyData, { adventureId })
}
