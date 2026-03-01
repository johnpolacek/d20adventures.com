"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateObject } from "@/lib/ai"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import {
  buildNextTurnFromProgression,
  isFinalEncounterById,
} from "@/lib/services/advance-turn-builder-service"
import {
  buildEncounterProgressionPrompt,
  buildRecentTurnHistory,
  buildRollInfo,
  buildTransitionsText,
  findEncounterInPlan,
  getEncounterTurnStatus,
  getRecentTurnsForContext,
  getSectionAndSceneContext,
} from "@/lib/services/advance-turn-prompt-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { mapConvexTurnToTurn } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import { auth } from "@clerk/nextjs/server"
import wait from "waait"
import { z } from "zod"

const encounterProgressionSchema = z.object({
  nextEncounterId: z.string(),
  narrative: z.string(),
})

export async function advanceTurn({ turnId, settingId, adventurePlanId }: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  // Generate unique request ID for debugging
  const requestId = Math.random().toString(36).substring(7)
  console.log(`[advanceTurn:${requestId}] Starting advance turn for turnId:`, turnId)

  let shouldProcessNpcTurns = true // Initialize to true by default

  // 1. Fetch the turn from Convex and ensure the caller can access the adventure
  console.log(`[advanceTurn:${requestId}] Fetching turn data from Convex`)
  const { turn: turnData } = await assertAdventureAccessByTurn(userId, turnId)

  // Check if turn already exists to prevent duplicate processing
  const existingNextTurn = await convex.query(api.adventure.getTurnByOrder, {
    adventureId: turnData.adventureId,
    order: (turnData.order || 0) + 1
  })

  if (existingNextTurn) {
    console.log(`[advanceTurn:${requestId}] Turn already exists for next order, skipping duplicate processing`)
    return { status: "already_advanced", turn: existingNextTurn }
  }
  const turn = mapConvexTurnToTurn({ ...turnData, adventureId: turnData.adventureId.toString() })
  if (!turn) throw new Error("Turn not found")

  console.log(`[advanceTurn:${requestId}] Turn loaded:`, {
    turnId: turn.id,
    encounterId: turn.encounterId,
    order: turnData.order,
    narrativeLength: turn.narrative?.length || 0
  })

  // 2. Load the plan from S3
  console.log("[advanceTurn] settingId:", settingId, "adventurePlanId:", adventurePlanId)
  const plan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan
  if (!plan || !plan.id || !plan.sections || !plan.title) {
    throw new Error("Adventure plan is missing required fields")
  }

  // 2.5. Fetch recent turn history for better context
  const allTurns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId: turnData.adventureId })
  const currentTurnOrder = turnData.order || 1

  const { completedEncounterTurnCount, encounterTurnDisplay, currentEncounterTurnNumber } = getEncounterTurnStatus(allTurns, turn.encounterId, currentTurnOrder)

  console.log("[advanceTurn] Providing last 5 turns as context for LLM to analyze:", {
    encounterId: turn.encounterId,
    currentTurnOrder,
    completedEncounterTurnCount,
    encounterTurnDisplay,
    currentEncounterTurnNumber,
  })

  // Get the last 5 turns from any encounter for broader context
  const recentTurns = getRecentTurnsForContext(allTurns, currentTurnOrder, turnData.adventureId.toString())

  console.log("[advanceTurn] Current turn order:", currentTurnOrder)
  console.log("[advanceTurn] Recent turns for context:", recentTurns.length)
  if (recentTurns.length > 0) {
    console.log(
      "[advanceTurn] Recent turn narratives:",
      recentTurns.map((item) => ({
        order: item.order,
        encounterId: item.encounterId,
        narrative: `${item.turn.narrative?.substring(0, 100)}...`,
      }))
    )
  }

  // 3. Find current encounter
  const currentEncounter = findEncounterInPlan(plan, turn.encounterId)
  if (!currentEncounter) throw new Error("Current encounter not found in plan")

  const encounterIntro = currentEncounter.intro ?? ""
  const encounterInstructions = currentEncounter.instructions ?? ""
  const narrativeContext = turn.narrative ?? ""

  console.log("[advanceTurn] Encounter intro:", JSON.stringify(encounterIntro, null, 2))
  console.log("[advanceTurn] Encounter instructions:", JSON.stringify(encounterInstructions, null, 2))

  // Extract the player's most recent action from the narrative
  const mostRecentNarrativeBlock = (turn.narrative ?? "").split(/\n\n/).filter(Boolean).at(-1) ?? ""

  const rollInfo = buildRollInfo(turn)

  // Identify player characters
  const playerCharacters = (turn.characters as TurnCharacter[]).filter((c) => c.type === "pc")
  const playerCharacterNames = playerCharacters.map((c) => c.name).join(", ")

  // 4. Ask LLM if encounter is resolved
  const transitionsText = buildTransitionsText(currentEncounter)

  console.log("[advanceTurn] Current encounter transitions:", JSON.stringify(currentEncounter.transitions, null, 2))
  console.log("[advanceTurn] Transitions text for LLM:", JSON.stringify(transitionsText, null, 2))
  console.log("[advanceTurn] Most recent narrative block:", JSON.stringify(mostRecentNarrativeBlock, null, 2))
  console.log("[advanceTurn] Roll info:", JSON.stringify(rollInfo, null, 2))

  const { sectionContext, sceneContext } = getSectionAndSceneContext(plan, turn.encounterId)
  const adventureOverview = plan.overview ? `Adventure Overview: ${plan.overview}` : ""

  // Build recent turn history context with encounter information
  const recentTurnHistory = buildRecentTurnHistory(recentTurns)

  // --- DETAILED LOGGING FOR LLM PROMPT INPUTS ---
  console.log("\n[advanceTurn] --- LLM PROMPT INPUTS ---")
  console.log("--- END LLM PROMPT INPUTS ---\n")
  // --- END DETAILED LOGGING ---

  const prompt = buildEncounterProgressionPrompt({
    adventureOverview,
    sectionContext,
    sceneContext,
    currentEncounterTitle: currentEncounter.title,
    currentEncounterId: currentEncounter.id,
    encounterIntro,
    encounterInstructions,
    recentTurnHistory,
    narrativeContext,
    mostRecentNarrativeBlock,
    rollInfo,
    transitionsText,
    encounterTurnDisplay,
    currentEncounterTurnNumber,
    playerCharacterNames,
  })

  console.log(`[advanceTurn:${requestId}] Making LLM call for encounter progression`)
  await wait(1000)
  const llmResult = (await generateObject({ prompt, schema: encounterProgressionSchema })).object

  // Log the LLM's raw response with request ID
  console.log(`[advanceTurn:${requestId}] LLM result:`, JSON.stringify(llmResult, null, 2))
  console.log(`[advanceTurn:${requestId}] Narrative length:`, llmResult.narrative?.length || 0)
    console.log(`[advanceTurn:${requestId}] Narrative preview:`, `${llmResult.narrative?.substring(0, 200)}...`)

  // Log what the LLM decided about encounter progression
  console.log("[advanceTurn] Next encounterId:", llmResult.nextEncounterId)
  console.log("[advanceTurn] Current encounterId:", turn.encounterId)
  console.log("[advanceTurn] Will transition?", llmResult.nextEncounterId !== turn.encounterId)

  // 6. Build the new turn object
  const buildResult = buildNextTurnFromProgression({
    turn,
    plan,
    allTurns,
    adventureId: turnData.adventureId.toString(),
    currentEncounterTitle: currentEncounter.title,
    llmResult,
  })
  shouldProcessNpcTurns = buildResult.shouldProcessNpcTurns

  if (buildResult.status === "adventure_complete") {
    await convex.mutation(api.turns.patchAdventure, {
      adventureId: turnData.adventureId,
      patch: { endedAt: Date.now(), updatedAt: Date.now() },
    })
    return { status: "adventure_complete" }
  }

  const newTurn = buildResult.turn
  const isFinalEncounter = isFinalEncounterById(plan, newTurn.encounterId)

  // 7. Create the new turn in Convex
  console.log(`[advanceTurn:${requestId}] Creating new turn in Convex:`, {
    adventureId: turnData.adventureId.toString(),
    encounterId: newTurn.encounterId,
    title: newTurn.title,
    narrativeLength: newTurn.narrative.length,
    characterCount: newTurn.characters.length,
    order: (turnData.order || 0) + 1,
    isFinalEncounter
  })

  const newTurnId = await convex.mutation(api.turns.createTurn, {
    adventureId: turnData.adventureId,
    encounterId: newTurn.encounterId,
    title: newTurn.title,
    narrative: newTurn.narrative,
    characters: newTurn.characters,
    order: (turnData.order || 0) + 1,
    isFinalEncounter: isFinalEncounter,
  })

  console.log(`[advanceTurn:${requestId}] Created new turn with ID:`, newTurnId)

  // 8. Patch adventure with new currentTurnId, and if final, end the adventure immediately
  if (isFinalEncounter) {
    shouldProcessNpcTurns = false // do not process any NPC turns on the final encounter
    await convex.mutation(api.turns.patchAdventure, {
      adventureId: turnData.adventureId,
      patch: { currentTurnId: newTurnId, endedAt: Date.now(), updatedAt: Date.now(), status: "completed" },
    })
  } else {
    await convex.mutation(api.turns.patchAdventure, {
      adventureId: turnData.adventureId,
      patch: { currentTurnId: newTurnId },
    })
  }

  // 9. After creating the new turn, process NPC turn if needed
  if (shouldProcessNpcTurns) {
    console.log(`[advanceTurn:${requestId}] Starting NPC turn processing for turnId:`, newTurnId)
    await processNpcTurnsAfterCurrent(newTurnId)
    console.log(`[advanceTurn:${requestId}] NPC turn processing completed`)
  } else {
    console.log(`[advanceTurn:${requestId}] NPC turns processing was skipped for turnId:`, newTurnId)
  }

  // 10. Return the new turn/adventure state
  console.log(`[advanceTurn:${requestId}] Function completed successfully`)
  return { status: "turn_advanced", turn: newTurn }
}
