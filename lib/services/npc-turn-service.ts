import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { buildDeadCharacterCompletion, buildNpcTurnUpdatePatch } from "@/lib/services/npc-turn-effects-service"
import {
  buildNpcActionContext,
  buildNpcActionPrompt,
  generateNpcAction,
} from "@/lib/services/npc-turn-generation-service"
import {
  handleSkipPassNpcTurn,
  resolveNpcTurnRollOrDirectBranch,
  type NpcTurnBranchResult,
} from "@/lib/services/npc-turn-branch-service"
import { buildNpcInitiativeOrder, findEncounterInPlan, resolvePlanContextForEncounter } from "@/lib/services/npc-turn-intent-service"
import { applyNpcSpellPostProcessing, finalizeNpcTurnResponse } from "@/lib/services/npc-turn-postprocess-service"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

export async function processNpcTurnWithLLM({
  turn,
  npcId,
  encounterContext,
  sectionContext,
  sceneContext,
  adventureOverview,
}: {
  turn: Turn
  npcId: string
  encounterContext?: { intro?: string; instructions?: string }
  sectionContext?: { title?: string; summary?: string }
  sceneContext?: { title?: string; summary?: string }
  adventureOverview?: string
}): Promise<{
  updatedNarrative: string
  updatedCharacters: TurnCharacter[]
  actionSummary: string
  rollInfo?: { rollType: string; difficulty: number; baseRoll: number; modifier: number; result: number; success: boolean }
  effects?: Array<{ targetId: string; healthPercentDelta?: number; status?: string; equipmentToAdd?: Array<{ name: string; description?: string }> }>
  shortcode?: string
  narrativeToAppend: string
}> {
  console.log("[LLM] Starting NPC turn:", {
    npc: npcId,
    encounter: turn.encounterId,
  })

  // 1. LLM decides NPC action
  const npc = turn.characters.find((c) => c.id === npcId)
  if (!npc) throw new Error("NPC not found")

  // NPC turn processing

  const npcActionContext = buildNpcActionContext({
    turn,
    npc,
    encounterContext,
    sectionContext,
    sceneContext,
    adventureOverview,
  })
  const prompt1 = buildNpcActionPrompt({
    contextString: npcActionContext.contextString,
    npcDetails: npcActionContext.npcDetails,
    npc,
    alivePlayerCharacters: npcActionContext.alivePlayerCharacters,
    deadPlayerCharacters: npcActionContext.deadPlayerCharacters,
  })

  console.log("[LLM] NPC action prompt:", JSON.stringify({
    promptLength: prompt1.length,
    npc: npc.name,
    npcEquipment: npcActionContext.npcEquipmentList,
    targetPlayers: npcActionContext.playerCharacters.length,
  }, null, 2))

  const actionResult = await generateNpcAction(prompt1)

  console.log("[LLM] NPC action response:", {
    actionType: actionResult.actionType,
    narrativeLength: actionResult.narrative.length,
    quality: actionResult.narrative && actionResult.actionSummary ? "complete" : "incomplete",
    hasDialogue: actionResult.narrative.includes('"'),
    hasEffects: !!actionResult.effects?.length,
  })

  // HANDLE SKIP/PASS FIRST to avoid unnecessary API calls
  if (actionResult.actionType === "skip" || actionResult.actionType === "pass") {
    return handleSkipPassNpcTurn({
      turn,
      npc,
      actionResult,
    })
  }

  const branchResult: Omit<NpcTurnBranchResult, "actionSummary"> = await resolveNpcTurnRollOrDirectBranch({
    turn,
    npc,
    actionResult,
    encounterContext,
    npcActionContext: {
      contextString: npcActionContext.contextString,
      npcDetails: npcActionContext.npcDetails,
      playerCharacters: npcActionContext.playerCharacters,
    },
  })

  let updatedNarrative = branchResult.updatedNarrative
  let updatedCharacters = branchResult.updatedCharacters
  const rollInfo = branchResult.rollInfo
  const effects = branchResult.effects
  const shortcode = branchResult.shortcode
  const narrativeToAppend = branchResult.narrativeToAppend

  updatedCharacters = applyNpcSpellPostProcessing({
    updatedCharacters,
    rollInfo,
    npcId: npc.id,
  })

  return finalizeNpcTurnResponse({
    actionSummary: actionResult.actionSummary,
    updatedNarrative,
    updatedCharacters,
    rollInfo,
    effects,
    shortcode,
    narrativeToAppend,
    npcId: npc.id,
  })
}

export async function processNpcTurnsAfterCurrent(turnId: Id<"turns">) {
  const npcRequestId = Math.random().toString(36).substring(7)
  console.log(`[NPC:${npcRequestId}] Starting NPC turns processing:`, {
    turnId: turnId.toString(),
  })

  let turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")

  console.log(
    `[NPC:${npcRequestId}] Loaded turn`,
    JSON.stringify(
      {
        turnId: turn._id.toString(),
        adventureId: turn.adventureId.toString(),
        encounterId: turn.encounterId,
        narrativeLength: turn.narrative?.length || 0,
        narrativePreview: `${turn.narrative?.substring(0, 200)}...`,
        characterCount: turn.characters.length,
        characters: turn.characters.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          hasReplied: c.hasReplied,
          isComplete: c.isComplete,
          initiative: c.initiative,
        })),
      },
      null,
      2
    )
  )

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) throw new Error(`Adventure not found for ID: ${turn.adventureId.toString()}`)

  console.log(
    "[LLM DM] Loaded adventure",
    JSON.stringify(
      {
        adventureId: adventure._id.toString(),
        settingId: adventure.settingId,
        planId: adventure.planId,
        title: adventure.title,
      },
      null,
      2
    )
  )

  const plan = (await readJsonFromS3(`settings/${adventure.settingId}/${adventure.planId}.json`)) as AdventurePlan
  if (!plan || !plan.id || !plan.sections || !plan.title) {
    throw new Error("Adventure plan is missing required fields or could not be loaded")
  }

  console.log(
    `[LLM DM] Loaded adventure plan from settings/${adventure.settingId}/${adventure.planId}.json`,
    JSON.stringify(
      {
        planId: plan.id,
        planTitle: plan.title,
        sectionCount: plan.sections.length,
        hasOverview: !!plan.overview,
      },
      null,
      2
    )
  )

  const { sectionContext, sceneContext, adventureOverview, sectionTitle, sceneTitle } = resolvePlanContextForEncounter(
    plan,
    turn.encounterId
  )

  console.log(
    "[LLM DM] Found current context",
    JSON.stringify(
      {
        hasSection: !!sectionContext,
        hasScene: !!sceneContext,
        sectionTitle,
        sceneTitle,
        encounterId: turn.encounterId,
      },
      null,
      2
    )
  )

  let characters = turn.characters as TurnCharacter[]
  // Take a snapshot of the current initiative order
  const initiativeOrder = buildNpcInitiativeOrder(characters)

  console.log(`[NPC:${npcRequestId}] Initiative order analysis:`, {
    totalCharacters: characters.length,
    incompleteCharacters: initiativeOrder.length,
    initiativeOrder: initiativeOrder.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      initiative: c.initiative,
      hasReplied: c.hasReplied,
      isComplete: c.isComplete,
      healthPercent: c.healthPercent,
      status: c.status,
    })),
  })

  let processedNpcCount = 0
  for (const char of initiativeOrder) {
    // Skip dead PCs and continue processing NPCs
    if (char.type === "pc" && (char.healthPercent === 0 || char.status === "dead")) {
      console.log("[LLM] Skipping dead player character:", char.name)
      continue // Skip dead PCs and continue with NPCs
    }
    if (char.type !== "npc") {
      console.log("[LLM] Stopping at player character:", char.name)
      break // Process NPCs in order, then stop
    }

    console.log(`[LLM] Processing NPC ${processedNpcCount + 1}:`, char.name)

    // Always reload the latest turn state before processing each NPC
    // as previous NPC actions in the same turn might have updated it.
    const currentTurnState = await convex.query(api.adventure.getTurnById, { turnId })
    if (!currentTurnState) {
      console.warn("[LLM DM] Could not reload turn state, stopping NPC processing for this turn.")
      break
    }
    turn = currentTurnState // Update local turn variable
    characters = turn.characters as TurnCharacter[] // Update local characters variable

    console.log(
      "[LLM DM] Reloaded turn state",
      JSON.stringify(
        {
          turnId: turn._id.toString(),
          narrativeLength: turn.narrative?.length || 0,
          characterCount: characters.length,
          updatedCharacters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            hasReplied: c.hasReplied,
            isComplete: c.isComplete,
            healthPercent: c.healthPercent,
          })),
        },
        null,
        2
      )
    )

    const npc = characters.find((c) => c.id === char.id && c.type === "npc" && !c.hasReplied && !c.isComplete)
    if (!npc) {
      console.log(
        "[LLM DM] NPC already processed or no longer eligible",
        JSON.stringify(
          {
            npcId: char.id,
            npcName: char.name,
            hasReplied: characters.find((c) => c.id === char.id)?.hasReplied,
            isComplete: characters.find((c) => c.id === char.id)?.isComplete,
          },
          null,
          2
        )
      )
      continue // NPC already processed or no longer eligible
    }

    const currentEncounterDetails = findEncounterInPlan(plan, turn.encounterId)
    let encounterContext: { intro?: string; instructions?: string } = {}
    if (currentEncounterDetails) {
      encounterContext = {
        intro: currentEncounterDetails.intro,
        instructions: currentEncounterDetails.instructions,
      }
      console.log(
        "[LLM DM] Found encounter details",
        JSON.stringify(
          {
            encounterId: turn.encounterId,
            hasIntro: !!currentEncounterDetails.intro,
            hasInstructions: !!currentEncounterDetails.instructions,
            introLength: currentEncounterDetails.intro?.length || 0,
            instructionsLength: currentEncounterDetails.instructions?.length || 0,
          },
          null,
          2
        )
      )
    } else {
      console.warn(`[LLM DM] Could not find details for encounter ${turn.encounterId} in the plan.`)
    }

    console.log(
      "[LLM DM] Calling processNpcTurnWithLLM",
      JSON.stringify(
        {
          npcId: npc.id,
          npcName: npc.name,
          hasEncounterContext: !!encounterContext.intro || !!encounterContext.instructions,
          hasSectionContext: !!sectionContext,
          hasSceneContext: !!sceneContext,
          hasAdventureOverview: !!adventureOverview,
        },
        null,
        2
      )
    )

    // Pass new context fields to processNpcTurnWithLLM
    const result = await processNpcTurnWithLLM({
      turn: { ...turn, id: turn._id, characters },
      npcId: npc.id,
      encounterContext,
      sectionContext,
      sceneContext,
      adventureOverview,
    })

    console.log(
      "[LLM DM] processNpcTurnWithLLM completed",
      JSON.stringify(
        {
          actionSummary: result.actionSummary,
          narrativeToAppendLength: result.narrativeToAppend?.length || 0,
          updatedCharacterCount: result.updatedCharacters.length,
          hasRollInfo: !!result.rollInfo,
          effectCount: result.effects?.length || 0,
          hasShortcode: !!result.shortcode,
        },
        null,
        2
      )
    )

    const turnPatch = buildNpcTurnUpdatePatch({
      currentNarrative: turn.narrative || "",
      narrativeToAppend: result.narrativeToAppend,
      updatedCharacters: result.updatedCharacters,
    })

    console.log(
      `[NPC:${npcRequestId}] Updating turn in database`,
      JSON.stringify(
        {
          turnId: turn._id.toString(),
          oldNarrativeLength: turn.narrative?.length || 0,
          newNarrativeLength: turnPatch.narrative.length,
          narrativeDelta: turnPatch.narrative.length - (turn.narrative?.length || 0),
          oldNarrativePreview: `${turn.narrative?.substring(0, 100)}...`,
          newNarrativePreview: `${turnPatch.narrative.substring(0, 100)}...`,
          updatedCharacterCount: result.updatedCharacters.length,
        },
        null,
        2
      )
    )

    await convex.mutation(api.turns.updateTurn, {
      turnId: turn._id,
      patch: turnPatch,
    })

    processedNpcCount++
    console.log(
      `[LLM DM] Completed processing NPC ${processedNpcCount}`,
      JSON.stringify(
        {
          npcName: npc.name,
          npcId: npc.id,
          processedNpcCount,
          totalNpcsInOrder: initiativeOrder.filter((c) => c.type === "npc").length,
        },
        null,
        2
      )
    )
  }

  // After processing NPCs, mark all dead characters as complete
  const finalTurnState = await convex.query(api.adventure.getTurnById, { turnId })
  if (finalTurnState) {
    const deadCharacterCompletion = buildDeadCharacterCompletion({
      characters: finalTurnState.characters as TurnCharacter[],
    })

    if (deadCharacterCompletion.hasChanges) {
      console.log(
        `[NPC:${npcRequestId}] Marking ${deadCharacterCompletion.deadCharacters.length} dead character(s) as complete:`,
        deadCharacterCompletion.deadCharacters.map((character) => character.name)
      )

      await convex.mutation(api.turns.updateTurn, {
        turnId: finalTurnState._id,
        patch: {
          characters: deadCharacterCompletion.updatedCharacters,
          updatedAt: Date.now(),
        },
      })
    }
  }

  console.log(`[NPC:${npcRequestId}] NPC turns processing completed:`, {
    processed: processedNpcCount,
    total: initiativeOrder.length,
  })
}
