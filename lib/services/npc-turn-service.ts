/* eslint-disable max-lines */

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { buildDeadCharacterCompletion, buildNpcTurnUpdatePatch } from "@/lib/services/npc-turn-effects-service"
import {
  buildNpcActionContext,
  buildNpcActionPrompt,
  buildNpcOutcomePrompt,
  generateNpcAction,
  generateNpcOutcome,
} from "@/lib/services/npc-turn-generation-service"
import { buildNpcInitiativeOrder, findEncounterInPlan, resolvePlanContextForEncounter } from "@/lib/services/npc-turn-intent-service"
import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { detectSpellFromRollType, markSpellAsUsed } from "@/lib/services/spell-tracking-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import { rollD20 } from "@/lib/utils"
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
    // Processing skip/pass action

    const narrativeToAppend = normalizeNarrative(actionResult.narrative)
    const updatedCharacters = turn.characters.map((c) => {
      if (c.id === npc.id) {
        return {
          ...c,
          hasReplied: true,
          isComplete: true,
          status: actionResult.actionType === "skip" ? "skipping" : "passing",
        }
      }
      return c
    })
    const updatedNarrative = appendNarrative(turn.narrative || "", narrativeToAppend)

    console.log("[LLM] NPC turn completed:", {
      action: actionResult.actionType,
      npc: npc.name,
    })

    return {
      updatedNarrative,
      updatedCharacters,
      actionSummary: actionResult.actionSummary,
      rollInfo: undefined,
      effects: undefined,
      shortcode: undefined,
      narrativeToAppend,
    }
  }

  let updatedNarrative = turn.narrative || ""
  let narrativeToAppend = ""
  let updatedCharacters = [...turn.characters]
  let rollInfo = undefined
  let effects: Array<{ targetId: string; healthPercentDelta?: number; status?: string; equipmentToAdd?: Array<{ name: string; description?: string }> }> | undefined = undefined
  let shortcode = undefined

  // Check if roll is required for NPC action

  const rollRequirement = await getRollRequirementForAction(actionResult.actionSummary, npc, {
    encounterInstructions: encounterContext?.instructions || "",
    encounterIntro: encounterContext?.intro || "",
    narrativeContext: turn.narrative || "",
  })

  console.log("[LLM] NPC roll requirement:", {
    requiresRoll: !!rollRequirement,
    rollType: rollRequirement?.rollType,
    difficulty: rollRequirement?.difficulty,
  })

  if (rollRequirement?.rollType && rollRequirement.difficulty) {
    // Getting modifier for NPC roll

    // 3. Get modifier
    const modifier = await getRollModifier({
      scenario: {
        encounterIntro: encounterContext?.intro || "",
        encounterInstructions: encounterContext?.instructions || "",
        narrativeContext: turn.narrative || "",
      },
      rollRequirement,
      character: npc,
    })

    // Roll modifier calculated

    // 4. Perform the roll
    const baseRoll = rollD20()
    const result = baseRoll + (modifier || 0)
    const success = result >= rollRequirement.difficulty
    rollInfo = {
      rollType: rollRequirement.rollType,
      difficulty: rollRequirement.difficulty,
      baseRoll,
      modifier,
      result,
      success,
    }

    console.log("[LLM] NPC dice roll:", {
      rollType: rollRequirement.rollType,
      result,
      difficulty: rollRequirement.difficulty,
      success,
    })

    // 5. Build DiceRoll shortcode
    shortcode = `[DiceRoll:rollType=${rollRequirement.rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? `+${modifier}` : modifier};result=${result};difficulty=${rollRequirement.difficulty};character=${npc.name};image=${npc.image};success=${success}]\n`

    console.log(
      "[LLM DM] Generated dice roll shortcode",
      JSON.stringify(
        {
          shortcode,
          shortcodeLength: shortcode.length,
        },
        null,
        2
      )
    )

    const prompt2 = buildNpcOutcomePrompt({
      contextString: npcActionContext.contextString,
      npcDetails: npcActionContext.npcDetails,
      playerCharacters: npcActionContext.playerCharacters,
      npcName: npc.name,
      actionSummary: actionResult.actionSummary,
      rollType: rollRequirement.rollType,
      result,
      difficulty: rollRequirement.difficulty,
      success,
    })

    console.log(
      "[LLM DM] Sending prompt to LLM for outcome generation",
      JSON.stringify(
        {
          promptLength: prompt2.length,
          actionSummary: actionResult.actionSummary,
          rollResult: result,
          success,
          playerCharacterCount: npcActionContext.playerCharacters.length,
        },
        null,
        2
      )
    )

    const outcomeResult = await generateNpcOutcome(prompt2)

    console.log(
      "[LLM DM] LLM response for outcome",
      JSON.stringify(
        {
          narrative: outcomeResult.narrative,
          effects: outcomeResult.effects,
          narrativeLength: outcomeResult.narrative.length,
          effectCount: outcomeResult.effects.length,
        },
        null,
        2
      )
    )

    narrativeToAppend = (shortcode ? shortcode : "") + normalizeNarrative(outcomeResult.narrative || "")
    effects = outcomeResult.effects

    // Applying effects to characters

    // Apply effects to characters
    updatedCharacters = updatedCharacters.map((c) => {
      const effect = effects?.find((e) => e.targetId === c.id)
      const updated = { ...c }
      if (effect) {
        // Applying effect to character

        if (effect.healthPercentDelta !== undefined) {
          const oldHealth = c.healthPercent ?? 100
          const newHealth = Math.max(0, oldHealth + effect.healthPercentDelta)
          updated.healthPercent = newHealth
          // Health updated
        }

        updated.status = effect.status || c.status
        if (effect.equipmentToAdd && effect.equipmentToAdd.length > 0) {
          const existingEquipment = Array.isArray(c.equipment) ? c.equipment : []
          updated.equipment = [...existingEquipment, ...effect.equipmentToAdd]
          // Equipment added
        }
      }
      // Mark this NPC as having acted
      if (c.id === npc.id) {
        updated.hasReplied = true
        updated.isComplete = true
      }
      return updated
    })

    // Effects applied

    // Logging for verification

    // --- AI health update: analyzeAndApplyDiceRoll ---
    const diceRoll = {
      rollType: rollRequirement.rollType,
      baseRoll,
      modifier,
      result,
      difficulty: rollRequirement.difficulty,
      character: npc.name,
      // Try to infer the target from effects (first effect targetId)
      target: outcomeResult.effects?.[0] ? outcomeResult.effects[0].targetId : undefined,
      success,
    }

    console.log("[LLM DM] Calling analyzeAndApplyDiceRoll with dice roll", JSON.stringify(diceRoll, null, 2))

    updatedCharacters.forEach((c) => {
      console.log(`  ${c.name} (${c.id}): ${c.healthPercent}%`)
    })

    const aiTurn = await analyzeAndApplyDiceRoll({
      turn: { ...turn, characters: updatedCharacters },
      diceRoll,
      narrative: appendNarrative(updatedNarrative, narrativeToAppend),
    })

    console.log(
      "[LLM DM] analyzeAndApplyDiceRoll result",
      JSON.stringify(
        {
          aiTurnCharacters: aiTurn.characters.map((c) => ({
            id: c.id,
            name: c.name,
            healthPercent: c.healthPercent,
            status: c.status,
          })),
        },
        null,
        2
      )
    )

    // Log detailed comparison of AI updates
    aiTurn.characters.forEach((aiChar) => {
      const origChar = updatedCharacters.find((c) => c.id === aiChar.id)
      if (origChar) {
        console.log(`  ${origChar.name} (${aiChar.id}):`)
        if (origChar.healthPercent !== aiChar.healthPercent) {
          console.log(`    Health: ${origChar.healthPercent}% -> ${aiChar.healthPercent}%`)
        }
        if (origChar.status !== aiChar.status) {
          console.log(`    Status: "${origChar.status}" -> "${aiChar.status}"`)
        }
      }
    })

    // Merge AI-updated fields into original TurnCharacter objects
    updatedCharacters = updatedCharacters.map((orig) => (aiTurn.characters.find((ai) => ai.id === orig.id) ? { ...orig, ...aiTurn.characters.find((ai) => ai.id === orig.id) } : orig))

    // Final character state updated
  } else {
    // Applying action directly (no roll required)

    narrativeToAppend = normalizeNarrative(actionResult.narrative)
    effects = actionResult.effects

    updatedCharacters = updatedCharacters.map((c) => {
      const effect = effects?.find((e) => e.targetId === c.id)
      const updated = { ...c }
      if (effect) {
        // Applying direct effect

        if (effect.equipmentToAdd && effect.equipmentToAdd.length > 0) {
          const existingEquipment = Array.isArray(c.equipment) ? c.equipment : []
          updated.equipment = [...existingEquipment, ...effect.equipmentToAdd]
          // Equipment added
        }
      }
      // Mark this NPC as having acted
      if (c.id === npc.id) {
        updated.hasReplied = true
        updated.isComplete = true
      }
      return updated
    })

    // Direct action completed
  }
  updatedNarrative = appendNarrative(updatedNarrative, narrativeToAppend)

  // Check if a spell was cast by the NPC and mark it as used
  if (rollInfo?.rollType) {
    const spellName = detectSpellFromRollType(rollInfo.rollType)
    if (spellName) {
      console.log(`[LLM DM] NPC spell detected: "${spellName}" - marking as used for NPC ${npc.id}`)
      updatedCharacters = markSpellAsUsed(updatedCharacters, npc.id, spellName)
    }
  }

  console.log(
    "[LLM DM] NPC turn processing completed",
    JSON.stringify(
      {
        finalNarrativeLength: updatedNarrative.length,
        narrativeToAppendLength: narrativeToAppend.length,
        characterCount: updatedCharacters.length,
        npcStatus: updatedCharacters.find((c) => c.id === npc.id)?.status,
        hasRollInfo: !!rollInfo,
        effectCount: effects?.length || 0,
      },
      null,
      2
    )
  )

  return {
    updatedNarrative,
    updatedCharacters,
    actionSummary: actionResult.actionSummary,
    rollInfo,
    effects,
    shortcode,
    narrativeToAppend,
  }
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
