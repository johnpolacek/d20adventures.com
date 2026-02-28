"use server"
import { internal as api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateObject } from "@/lib/ai"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { resetAllSpells } from "@/lib/services/spell-tracking-service"
import { mapConvexTurnToTurn, rollD20 } from "@/lib/utils"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import wait from "waait"
import { z } from "zod"

const encounterProgressionSchema = z.object({
  nextEncounterId: z.string(),
  narrative: z.string(),
})

// Type guard for characters with rollRequired and rollResult
function hasRollFields(c: TurnCharacter): c is TurnCharacter & { rollRequired: { rollType: string; difficulty: number; modifier?: number }; rollResult: number } {
  return "rollResult" in c && typeof c.rollResult === "number" && "rollRequired" in c && typeof c.rollRequired === "object" && c.rollRequired !== null
}

export async function advanceTurn({ turnId, settingId, adventurePlanId }: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  // Generate unique request ID for debugging
  const requestId = Math.random().toString(36).substring(7)
  console.log(`[advanceTurn:${requestId}] Starting advance turn for turnId:`, turnId)

  let shouldProcessNpcTurns = true // Initialize to true by default

  // 1. Fetch the turn from Convex
  console.log(`[advanceTurn:${requestId}] Fetching turn data from Convex`)
  const turnData = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turnData) throw new Error("Turn not found")

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

  // Compute completed turns within the current encounter (do not include the current, in-progress turn)
  const completedEncounterTurnCount = allTurns.filter((t) => t.encounterId === turn.encounterId && (t.order || 0) < currentTurnOrder).length
  const encounterTurnDisplay = completedEncounterTurnCount >= 5 ? "5 or more" : String(completedEncounterTurnCount)
  const currentEncounterTurnNumber = completedEncounterTurnCount + 1

  console.log("[advanceTurn] Providing last 5 turns as context for LLM to analyze:", {
    encounterId: turn.encounterId,
    currentTurnOrder,
    completedEncounterTurnCount,
    encounterTurnDisplay,
    currentEncounterTurnNumber,
  })

  // Get the last 5 turns from any encounter for broader context
  const recentTurns = allTurns
    .filter((t) => t.order < currentTurnOrder)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(-5) // Get last 5 turns
    .map((t) => ({
      turn: mapConvexTurnToTurn({ ...t, adventureId: turnData.adventureId.toString() }),
      order: t.order,
      encounterId: t.encounterId,
    }))
    .filter((item) => item.turn !== null)

  console.log("[advanceTurn] Current turn order:", currentTurnOrder)
  console.log("[advanceTurn] Recent turns for context:", recentTurns.length)
  if (recentTurns.length > 0) {
    console.log(
      "[advanceTurn] Recent turn narratives:",
      recentTurns.map((item) => ({
        order: item.order,
        encounterId: item.encounterId,
        narrative: `${item.turn?.narrative?.substring(0, 100)}...`,
      }))
    )
  }

  // 3. Find current encounter
  const findCurrentEncounter = (plan: AdventurePlan, currentEncounterId: string) =>
    plan.sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .find((encounter) => encounter.id === currentEncounterId) ?? null

  const currentEncounter = findCurrentEncounter(plan, turn.encounterId)
  if (!currentEncounter) throw new Error("Current encounter not found in plan")

  const encounterIntro = currentEncounter.intro ?? ""
  const encounterInstructions = currentEncounter.instructions ?? ""
  const narrativeContext = turn.narrative ?? ""

  console.log("[advanceTurn] Encounter intro:", JSON.stringify(encounterIntro, null, 2))
  console.log("[advanceTurn] Encounter instructions:", JSON.stringify(encounterInstructions, null, 2))

  // Extract the player's most recent action from the narrative
  const mostRecentNarrativeBlock = (turn.narrative ?? "").split(/\n\n/).filter(Boolean).at(-1) ?? ""

  // Try to parse the last DiceRoll from the narrative to construct rollInfo
  const diceRollRegex = /\[DiceRoll:([^\]]+)\]/g
  const narrativeForRollParsing = turn.narrative ?? ""
  let matches
  let lastDiceRollParamsStr: string | null = null
  while ((matches = diceRollRegex.exec(narrativeForRollParsing)) !== null) {
    lastDiceRollParamsStr = matches[1]
  }

  let rollInfo = "No character-specific dice roll was identified as the immediate precursor to this state." // Default

  if (lastDiceRollParamsStr) {
    const params = lastDiceRollParamsStr.split(";").reduce(
      (acc, part) => {
        const [key, ...valueParts] = part.split("=")
        const value = valueParts.join("=")
        if (key && value !== undefined) acc[key.trim()] = value.trim()
        return acc
      },
      {} as Record<string, string>
    )

    const characterName = params.character
    const rollType = params.rollType
    const resultStr = params.result
    const difficultyStr = params.difficulty
    const successStr = params.success
    const modifierStr = params.modifier

    if (characterName && rollType && resultStr && difficultyStr && successStr) {
      const rollResult = Number.parseInt(resultStr, 10)
      const difficulty = Number.parseInt(difficultyStr, 10)
      const success = successStr === "true"
      let modifier: number | undefined = undefined
      let modifierText = ""

      if (modifierStr) {
        const parsedModifier = Number.parseInt(modifierStr, 10)
        if (!Number.isNaN(parsedModifier)) {
          modifier = parsedModifier
          modifierText = `, modifier: ${modifier}`
        }
      }

      if (!Number.isNaN(rollResult) && !Number.isNaN(difficulty)) {
        rollInfo = `Regarding the most recent dice roll: Character '${characterName}' attempted a '${rollType}'. The result was ${rollResult} (difficulty: ${difficulty}${modifierText}). This roll was a ${success ? "SUCCESS" : "FAILURE"}.`
      } else {
      }
    } else {
    }
  } else {
    const lastRollingCharacter = (turn.characters as TurnCharacter[]).find(hasRollFields)
    if (lastRollingCharacter) {
      const { name, rollRequired, rollResult: charRollResult } = lastRollingCharacter
      const { rollType: charRollType, difficulty: charDifficulty, modifier: charModifier = 0 } = rollRequired
      const charSuccess = charRollResult >= charDifficulty
      rollInfo = `Regarding the most recent dice roll (from character data): Character '${name}' attempted a '${charRollType}'. The result was ${charRollResult} (difficulty: ${charDifficulty}, modifier: ${charModifier}). This roll was a ${charSuccess ? "SUCCESS" : "FAILURE"}.`
    } else {
    }
  }

  // Identify player characters
  const playerCharacters = (turn.characters as TurnCharacter[]).filter((c) => c.type === "pc")
  const playerCharacterNames = playerCharacters.map((c) => c.name).join(", ")

  // 4. Ask LLM if encounter is resolved
  const transitionsText = currentEncounter.transitions
    ? (currentEncounter.transitions as { condition: string; encounter: string }[])
        .map((t, i) => `Transition Option ${i + 1} (leads to encounter ID: '${t.encounter}'):\n  Condition to check: ${t.condition}`)
        .join("\n")
    : "No explicit transitions defined for this encounter."

  console.log("[advanceTurn] Current encounter transitions:", JSON.stringify(currentEncounter.transitions, null, 2))
  console.log("[advanceTurn] Transitions text for LLM:", JSON.stringify(transitionsText, null, 2))
  console.log("[advanceTurn] Most recent narrative block:", JSON.stringify(mostRecentNarrativeBlock, null, 2))
  console.log("[advanceTurn] Roll info:", JSON.stringify(rollInfo, null, 2))

  // Find current section and scene for context
  let currentSection = undefined
  let currentScene = undefined
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      if (scene.encounters.some((enc) => enc.id === turn.encounterId)) {
        currentSection = section
        currentScene = scene
        break
      }
    }
    if (currentSection && currentScene) break
  }

  const sectionContext = currentSection ? `Section Title: ${currentSection.title || ""}\nSection Summary: ${currentSection.summary || ""}` : ""
  const sceneContext = currentScene ? `Scene Title: ${currentScene.title || ""}\nScene Summary: ${currentScene.summary || ""}` : ""
  const adventureOverview = plan.overview ? `Adventure Overview: ${plan.overview}` : ""

  // Build recent turn history context with encounter information
  const recentTurnHistory =
    recentTurns.length > 0
      ? `Recent Adventure History (last ${recentTurns.length} turns across encounters):
${recentTurns.map((item) => `Turn ${item.order} [Encounter: ${item.encounterId}]: ${item.turn?.narrative || ""}`).join("\n\n")}`
      : "No previous turns available."

  // --- DETAILED LOGGING FOR LLM PROMPT INPUTS ---
  console.log("\n[advanceTurn] --- LLM PROMPT INPUTS ---")
  if (currentSection) {
  }
  if (currentScene) {
  }
  console.log("--- END LLM PROMPT INPUTS ---\n")
  // --- END DETAILED LOGGING ---

  const prompt = `
${adventureOverview}

${sectionContext}

${sceneContext}

Current Encounter Title: ${currentEncounter.title}
Current Encounter ID: ${currentEncounter.id}
Current Encounter Intro:
${encounterIntro}
Current Encounter Instructions:
${encounterInstructions}

${recentTurnHistory}

Recent Narrative Context (last few paragraphs):
${narrativeContext}

Most Recent Action/Event from the narrative (this is what the player/environment JUST DID):
${mostRecentNarrativeBlock}

${
  rollInfo
    ? `Key Information Regarding Recent Dice Roll (related to the 'Most Recent Action/Event'):
${rollInfo}
`
    : "No specific dice roll outcome to report for the most recent action."
}
Available Transition Options for '${currentEncounter.id}':
${transitionsText}

Encounter Turn Status: ${encounterTurnDisplay} turns have been completed in the current encounter '${currentEncounter.id}'. You are now processing what will be turn #${currentEncounterTurnNumber} in this encounter.

Your Task:
1. Carefully review the 'Recent Adventure History' to understand the full context of what has happened across encounters.
2. **CRITICAL: Check if the player has successfully completed the encounter's main objective.** Look for:
   - If the encounter instructions mention specific requirements (like "pay the 3 marks for entrance"), check if the player's action clearly fulfilled that requirement
   - If the player's action directly accomplishes what the encounter was designed for, this should trigger a transition
   - Pay special attention to actions like paying fees, completing tasks, or achieving stated objectives
   - **IMPORTANT: Check the 'Recent Adventure History' to see if any previous players have already completed key objectives (like paying entrance fees). If the objective was completed in a previous turn, this should trigger a transition.**
3. Evaluate 'Most Recent Action/Event' and the provided encounter turn information against 'Available Transition Options' (if any):
   - **CRITICAL: For turn-count transitions** (e.g., "After 3 turns"), use the Encounter Turn Status above. If you are processing turn #N and N meets or exceeds the required number, that transition MUST occur immediately.
   - If a transition condition IS clearly met by PAST actions/rolls: Set 'nextEncounterId' to the 'encounter' ID specified in that transition option. The 'Available Transition Options' list is the definitive guide for all transitions. If the 'Most Recent Action/Event' directly and clearly fulfills a 'condition' in this list, that transition MUST occur. This takes strict precedence over any general interaction possibilities mentioned in the 'Current Encounter Instructions'.
   - **IMPORTANT: If the player has successfully completed the encounter's main objective (like paying the entrance fee), but no specific transition condition matches, look for a general "enter" or "proceed" transition.**
4. Determine the 'nextEncounterId':
   - If a transition condition IS MET: Use the 'leads to encounter ID' from that transition.
   - If MULTIPLE transition conditions appear to be met by PAST actions/rolls: Prioritize conditions related to explicit success or failure of a recent dice roll if applicable. If still ambiguous, use the first one that clearly applies.
   - If NO transition condition is met the 'nextEncounterId' should remain the Current Encounter ID ('${currentEncounter.id}').
5. Generate a 'narrative' response:
   - If transitioning (because a condition was met by PAST actions/rolls): The narrative should briefly describe the events or state that fulfill the transition condition and logically lead into the new encounter. This acts as a bridge.
   - If NOT transitioning (i.e., 'nextEncounterId' is '${currentEncounter.id}'): The narrative MUST describe what happens next in the current encounter based on the 'Most Recent Action/Event' and 'Key Information Regarding Recent Dice Roll'. It should set the stage for the player's NEXT decision. For example, if a creature was detected, the narrative might describe the creature appearing or its immediate reaction, prompting the player to decide their next move. DO NOT write new actions or decisions for the player character(s).
   - Do NOT add any questions at the end like 'What does he do next?'
   - Do NOT mention any game mechanics such as dice rolls.

IMPORTANT GUIDELINES:
- Only use encounter IDs explicitly listed in the 'Available Transition Options' or the 'Current Encounter ID' ('${currentEncounter.id}').
- Your 'narrative' response will set the stage for the player's NEXT turn.
- **CRITICAL REMINDER: DO NOT write new actions, dialogue, choices, or internal thoughts for the player character(s) (e.g., ${playerCharacterNames}).** The narrative must describe NPC actions, environmental changes, or the direct, immediate consequences of the player's PAST action/roll. The goal is to prepare for the player's *next actual decision*, not to make it for them.
- If a transition occurs due to a failed dice roll (that already happened), ensure the narrative reflects the consequences of that failure leading to the new situation.
- If a transition occurs due to a successful dice roll (that already happened), ensure the narrative reflects the consequences of that success.
- If no transition occurs, the narrative should clearly end in a way that prompts the player for their next action. For instance, describe the scene and end with a question like "What does Thalbern do next?" or simply describe the immediate situation that demands a response.
- Write in clean, classic fantasy prose without em dashes (—), en dashes (–), figure dashes (‒), or horizontal bars (―). Prefer commas or periods instead.
- **FORMATTING REQUIREMENT**: Break the narrative into 2-4 separate paragraphs. Use \\n\\n (double newlines) between paragraphs. Each paragraph should focus on a different aspect: action/consequence, environment/atmosphere, character reactions, or tension. Do NOT write everything as a single block of text.

Respond in JSON:
{
  "nextEncounterId": string, // ID of the next/current encounter based on your evaluation
  "narrative": string      // Narrative prose for the transition OR for continuing the current encounter. IMPORTANT: Do NOT include any questions at the end such as 'What does [character name] do next?' and do NOT mention any game mechanics such as dice rolls. CRITICAL: The narrative MUST be broken into 2-4 paragraphs separated by \\n\\n (double newlines). Each paragraph should be 2-4 sentences. Never return a single block of text.
}
`

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
  let newTurn: Turn | null = null
  if (llmResult.nextEncounterId === turn.encounterId) {
    // Continue current encounter
    let newCharacters: TurnCharacter[] = (turn.characters as TurnCharacter[]).filter((c) => c.status !== "dead" && c.status !== "fled")
    const narrative = normalizeNarrative(llmResult.narrative || "") // Normalize formatting
    // Reset hasReplied, isComplete, and re-roll initiative for all characters
    newCharacters = newCharacters.map((c) => ({
      ...c,
      hasReplied: false,
      isComplete: false,
      initiative: rollD20(), // Re-roll initiative
    }))

    // Sort by new initiative
    newCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

    newTurn = {
      id: "", // placeholder, Convex will generate
      adventureId: turnData.adventureId,
      encounterId: turn.encounterId,
      title: currentEncounter.title,
      narrative,
      characters: newCharacters,
    }
  } else {
    // Transition to new encounter
    const nextEncounter = findCurrentEncounter(plan, llmResult.nextEncounterId)

    if (nextEncounter?.skipInitialNpcTurns) {
      console.log(`[advanceTurn] Skipping initial NPC turns for new encounter: ${nextEncounter.id}`)
      shouldProcessNpcTurns = false
    }

    if (!nextEncounter) {
      await convex.mutation(api.turns.patchAdventure, { adventureId: turnData.adventureId, patch: { endedAt: Date.now(), updatedAt: Date.now() } })
      return { status: "adventure_complete" }
    }
    // PCs: persist from previous turn (remove dead/fled) and re-roll initiative
    let pcs: TurnCharacter[] = (turn.characters as TurnCharacter[])
      .filter((c) => c.type === "pc" && c.status !== "dead" && c.status !== "fled")
      .map((pc) => ({
        ...pc,
        initiative: rollD20(), // Re-roll PC initiative
      }))

    // Reset all spell usage for PCs on encounter transition
    console.log(`[advanceTurn] Resetting spell usage for all PCs on encounter transition to: ${nextEncounter.id}`)
    pcs = resetAllSpells(pcs)

    // Reset health if the encounter has resetHealth flag
    if (nextEncounter.resetHealth) {
      console.log(`[advanceTurn] Resetting health for all characters due to resetHealth flag in encounter: ${nextEncounter.id}`)
      pcs = pcs.map((pc) => ({
        ...pc,
        healthPercent: 100,
        status: pc.status === "dead" ? "" : pc.status, // Clear dead status if health is being reset
      }))
    }

    // Check if this is the first turn for this encounter by looking at all previous turns
    const isFirstTurnForEncounter = !allTurns.some((previousTurn) => previousTurn.encounterId === nextEncounter.id)

    if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
      console.log(`[advanceTurn] Setting NPC initiatives to 0 for first turn of encounter with skipInitialNpcTurns: ${nextEncounter.id}`)
    }

    // NPCs: add from next encounter
    const npcs: TurnCharacter[] = (nextEncounter.npc || []).map((npcRef: { id: string; initialInitiative?: number; behavior?: string }) => {
      const npc = plan.npcs[npcRef.id]

      // For encounters with skipInitialNpcTurns, set initiative to 0 for all NPCs if this is the first turn for the encounter
      let npcInitiative: number
      if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
        npcInitiative = 0
      } else {
        npcInitiative = typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollD20()
      }

      return {
        ...npc,
        id: npcRef.id,
        type: "npc",
        isComplete: false,
        hasReplied: false,
        initiative: npcInitiative,
        // NPCs always start at full health
        healthPercent: 100,
        behavior: npcRef.behavior,
      }
    })
    let allCharacters: TurnCharacter[] = [...pcs, ...npcs]
    // Reset hasReplied and isComplete for all characters
    allCharacters = allCharacters.map((c) => ({
      ...c,
      hasReplied: false,
      isComplete: false,
    }))
    // Sort by new initiative
    allCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

    // Use appendNarrative utility for new encounter intro and new narrative (normalize both)
    const narrative = appendNarrative(normalizeNarrative(llmResult.narrative || ""), normalizeNarrative(nextEncounter.intro || ""))
    newTurn = {
      id: "", // placeholder, Convex will generate
      adventureId: turnData.adventureId,
      encounterId: nextEncounter.id,
      title: nextEncounter.title,
      narrative,
      characters: allCharacters, // Use the sorted and updated list
    }
  }

  // Determine if this new turn is for the final encounter
  const resolvedNextEncounterForFinalCheck = findCurrentEncounter(plan, newTurn.encounterId)
  const isFinalEncounter = resolvedNextEncounterForFinalCheck ? !resolvedNextEncounterForFinalCheck.transitions || resolvedNextEncounterForFinalCheck.transitions.length === 0 : false

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
