"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateObject } from "@/lib/ai"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { readJsonFromS3 } from "@/lib/s3-utils"
import {
  buildNextTurnFromProgression,
  isFinalEncounterById,
} from "@/lib/services/advance-turn-builder-service"
import {
  markAdventureCompleteWithoutNextEncounter,
  persistTurnAndFinalizeAdventure,
} from "@/lib/services/advance-turn-finalization-service"
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
import { mapConvexTurnToTurn } from "@/lib/utils"
import { validateAdventurePatch } from "@/lib/wiki-adventures/adventure-patch"
import { assembleGameplayContextPacket, buildWikiEncounterProgressionPrompt } from "@/lib/wiki-adventures/runtime-context"
import { buildMidnightTurnCharacters, isMidnightFinalEncounter, isMidnightSummons, loadMidnightSummonsRuntime } from "@/lib/wiki-adventures/midnight-summons-runtime"
import { validatePacketTransition } from "@/lib/wiki-adventures/transition-validator"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import { auth } from "@clerk/nextjs/server"
import wait from "waait"
import { z } from "zod"

const encounterProgressionSchema = z.object({
  nextEncounterId: z.string(),
  narrative: z.string(),
})

const wikiEncounterProgressionSchema = z.object({
  nextEncounterId: z.string(),
  narrative: z.string(),
  adventurePatch: z.unknown().optional(),
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

  if (isMidnightSummons(settingId, adventurePlanId)) {
    const { artifacts, contentRef } = loadMidnightSummonsRuntime()
    const allTurns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId: turnData.adventureId })
    const currentTurnOrder = turnData.order || 1
    const packet = assembleGameplayContextPacket({
      artifacts,
      contentRef,
      session: {
        adventureInstanceId: turnData.adventureId.toString(),
        currentTurnOrder,
        narrativeSummary: undefined,
        currentTurn: turn,
        allTurns: allTurns.map((row) => ({
          encounterId: row.encounterId,
          narrative: row.narrative,
          order: row.order,
          characters: row.characters as TurnCharacter[],
        })),
      },
    })
    const prompt = buildWikiEncounterProgressionPrompt(packet)
    await wait(1000)
    const llmResult = (await generateObject({ prompt, schema: wikiEncounterProgressionSchema })).object
    const transition = validatePacketTransition(packet, llmResult.nextEncounterId)
    if (!transition.allowed) {
      throw new Error(`Wiki transition rejected: ${transition.rejectedReason} (${turn.encounterId} -> ${transition.nextEncounterId})`)
    }
    let adventurePatch
    try {
      adventurePatch = validateAdventurePatch(llmResult.adventurePatch, transition)
    } catch (error) {
      console.warn(`[advanceTurn:${requestId}] Invalid wiki adventurePatch returned by AI; falling back to summary-only patch`, error)
      adventurePatch = validateAdventurePatch(
        {
          summaryDelta: llmResult.narrative,
        },
        transition
      )
    }
    const nextEncounter = artifacts.encounters[transition.nextEncounterId]
    if (!nextEncounter) throw new Error(`Next encounter ${transition.nextEncounterId} missing from wiki artifacts`)
    const isTransition = transition.nextEncounterId !== turn.encounterId
    const characters = isTransition
      ? buildMidnightTurnCharacters({
          artifacts,
          encounter: nextEncounter,
          players: (turn.characters as TurnCharacter[]).filter((character) => character.type === "pc").map((character) => ({ userId: character.userId ?? userId, characterId: character.id })),
        })
      : (turn.characters as TurnCharacter[])
          .filter((character) => character.status !== "dead" && character.status !== "fled")
          .map((character) => ({
            ...character,
            hasReplied: false,
            isComplete: false,
            initiative: Math.floor(Math.random() * 20) + 1,
          }))
          .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
    const narrative = isTransition ? appendNarrative(normalizeNarrative(llmResult.narrative), normalizeNarrative(nextEncounter.sections.intro ?? "")) : normalizeNarrative(llmResult.narrative)
    const isFinalEncounter = isMidnightFinalEncounter(artifacts, nextEncounter.id)
    await convex.mutation(api.adventure.commitWikiTurnAdvance, {
      adventureId: turnData.adventureId,
      expectedCurrentTurnId: turnId,
      expectedCurrentEncounterId: turn.encounterId,
      expectedContentHash: contentRef.contentHash,
      nextEncounterId: nextEncounter.id,
      title: nextEncounter.title,
      narrative,
      characters,
      order: currentTurnOrder + 1,
      adventurePatch,
      transition: adventurePatch.transition,
      generatedBy: { promptVersion: "wiki-midnight-advance-v1", contextHash: contentRef.contentHash },
      isFinalEncounter,
    })
    return { status: "turn_advanced", turn: { ...turn, encounterId: nextEncounter.id, title: nextEncounter.title, narrative, characters, isFinalEncounter } }
  }

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
    await markAdventureCompleteWithoutNextEncounter(turnData.adventureId)
    return { status: "adventure_complete" }
  }

  const newTurn = buildResult.turn
  const isFinalEncounter = isFinalEncounterById(plan, newTurn.encounterId)
  await persistTurnAndFinalizeAdventure({
    requestId,
    adventureId: turnData.adventureId,
    currentOrder: turnData.order || 0,
    newTurn,
    isFinalEncounter,
    shouldProcessNpcTurns,
  })

  // 8. Return the new turn/adventure state
  console.log(`[advanceTurn:${requestId}] Function completed successfully`)
  return { status: "turn_advanced", turn: newTurn }
}
