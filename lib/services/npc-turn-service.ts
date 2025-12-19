/* eslint-disable max-lines */

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateObject } from "@/lib/ai"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import { rollD20 } from "@/lib/utils"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventureEncounter, AdventurePlan } from "@/types/adventure-plan"
import { z } from "zod"

// Step 1: Schema for LLM to decide NPC action
const npcActionSchema = z.object({
  actionSummary: z.string(), // e.g. "The goblin tries to sneak behind the hero and attack."
  narrative: z.string(), // Narrative update for the action
  actionType: z.enum(["attack", "skill", "skip", "pass", "other"]).default("other"), // Explicit action type
  effects: z
    .array(
      z.object({
        targetId: z.string(),
        equipmentToAdd: z
          .array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
})

// Step 2: Schema for LLM to decide outcome of the action after roll
const npcActionOutcomeSchema = z.object({
  narrative: z.string(), // Narrative update for the outcome
  effects: z.array(
    z.object({
      targetId: z.string(),
      healthPercentDelta: z.number().optional(),
      status: z.string().optional(),
      equipmentToAdd: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
          })
        )
        .optional(),
    })
  ),
})

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

  // Use more narrative context (last 6 paragraphs) to better understand what has happened
  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-6).join("\n\n")
  const playerCharactersForPrompt1 = turn.characters.filter((c) => c.type === "pc")
  const playerCharacterNamesForPrompt1 = playerCharactersForPrompt1.map((c) => c.name)

  // Player characters identified for NPC interaction

  // Build context string for prompt
  const contextString = [
    adventureOverview ? `Adventure Overview: ${adventureOverview}` : "",
    sectionContext && (sectionContext.title || sectionContext.summary) ? `Section Title: ${sectionContext.title || ""}\nSection Summary: ${sectionContext.summary || ""}` : "",
    sceneContext && (sceneContext.title || sceneContext.summary) ? `Scene Title: ${sceneContext.title || ""}\nScene Summary: ${sceneContext.summary || ""}` : "",
    encounterContext?.intro ? `Encounter Intro: ${encounterContext.intro}` : "",
    encounterContext?.instructions ? `Encounter Instructions: ${encounterContext.instructions}` : "",
    npc.behavior ? `NPC Behavior: ${npc.behavior}` : "",
    narrativeContext ? `Recent Narrative:\n${narrativeContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  // Context prepared for NPC action decision

  // Build NPC details including equipment
  const npcEquipmentList = npc.equipment?.map((e) => e.name).join(", ") || "None"
  const npcDetails = `
NPC Details:
- Name: ${npc.name}
- Race: ${npc.race || "Unknown"}
- Archetype: ${npc.archetype || "Unknown"}
- Equipment: ${npcEquipmentList}
- Skills: ${npc.skills?.join(", ") || "None"}
- Health: ${npc.healthPercent ?? 100}%
- Status: ${npc.status || "Normal"}
`

  const prompt1 = `You are the DM for a tabletop RPG. Given the following context, decide what action the NPC should take this turn. Be creative and act as a real DM would. Output a short narrative for the action.

${contextString}

${npcDetails}

YOUR TASK:
You are the DM. Your SOLE responsibility right now is to decide the action for ONE specific NPC.

**THE CURRENT NPC IS: ${npc.name}** (ID: ${npc.id}, Type: ${npc.type})

CRITICAL: When the NPC attacks or uses equipment, you MUST use ONLY the weapons and items listed in their Equipment above. Do NOT invent or reference weapons they don't have.

CRITICAL: Pay close attention to the NPC's behavior and role. The NPC behavior section describes their specific responsibilities, motivations, and how they should act in this encounter. This is the most important context for determining their action.

**IMPORTANT: Before deciding the NPC's action, carefully review the 'Recent Narrative' to understand what has ALREADY happened. If a player character has already completed a task (like casting a spell, detecting magic, or performing an action), the NPC should react to that completed action appropriately. Do NOT ask the player to do something they have already done. Instead, the NPC should respond to what has been completed or ask for the next step in the process.**

Based on all the context provided, determine the most logical action for **${npc.name}** to take. The 'Recent Narrative' describes what other characters have already done. Do NOT repeat or continue actions for other characters. Your response must be exclusively about **${npc.name}**.

IMPORTANT: If the NPC would realistically speak during this action (conversations, negotiations, threats, commands, etc.), include their actual dialogue in quotes. However, if the NPC is a non-speaking creature (like a mindless beast or monster) or the action doesn't involve speaking (pure physical actions, stealth, etc.), use descriptive narrative instead.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—) or en dashes; use commas or periods instead.
- Keep sentences short and clear; avoid semicolons.
- Use novel-like pacing with line breaks: separate distinct beats into separate paragraphs with a blank line between paragraphs.
- Put each spoken line of dialogue on its own line. Dialogue should use straight quotes ("...") and may include dialogue tags like says/asks/replies.

If the NPC would realistically skip or pass their turn (e.g., waiting, observing, preparing, doing nothing), set actionType to "skip" or "pass" and provide appropriate narrative. For example:
- Skip action: 'The goblin scout remains hidden in the shadows, carefully observing the party's movements before making his next move.'
- Pass action: 'The wounded orc takes a defensive stance, catching his breath and waiting for an opening.'

Examples:
- Speaking NPC: 'Silas steps forward, his voice calm but firm. "We need to complete this task quickly and quietly," he says, his eyes scanning the area for threats.'
- Non-speaking creature: 'The dire wolf snarls, its hackles raised as it prepares to pounce on the nearest target.'
- Physical action: 'The guard silently draws his sword, positioning himself to block the exit.'

If the NPC's action involves giving items to a player character, include an "effects" array. Each object in "effects" should have a "targetId" (the ID of the character receiving items) and an "equipmentToAdd" array listing the items ({name: string, description?: string}).

Targetable Player Characters: ${playerCharacterNamesForPrompt1.join(", ")} (IDs: ${playerCharactersForPrompt1.map((c) => c.id).join(", ")})

Respond as JSON. The 'narrative' and 'actionSummary' fields must describe the action of **${npc.name}** and no one else.
{
  actionSummary: string, // e.g., "Faelar strums a tune on his lute to lighten the mood."
  narrative: string, // e.g., "Faelar, noticing the tension, pulls out his lute. 'A somber crowd for a festival!' he jests, beginning a lighthearted melody."
  actionType: "attack" | "skill" | "skip" | "pass" | "other",
  effects?: [ { targetId: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`

  console.log("[LLM] NPC action prompt:", JSON.stringify({
    promptLength: prompt1.length,
    npc: npc.name,
    npcEquipment: npcEquipmentList,
    targetPlayers: playerCharactersForPrompt1.length,
  }, null, 2))

  const actionResult = (await generateObject({ prompt: prompt1, schema: npcActionSchema })).object

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

    // 6. LLM: Given the action, roll result, and context, generate the outcome
    const playerCharacters = turn.characters.filter((c) => c.type === "pc")
    const playerCharacterNames = playerCharacters.map((c) => c.name)
    
    // Build player character details for context
    const playerCharacterDetails = playerCharacters.map((pc) => `- ${pc.name}: ${pc.archetype || "Unknown"}, HP ${pc.healthPercent ?? 100}%, Equipment: ${pc.equipment?.map((e) => e.name).join(", ") || "None"}`).join("\n")
    
    const prompt2 = `You are the DM for a tabletop RPG. Given the action, the dice roll result, and the context, write a short narrative describing the outcome. Focus the narrative on the interacting characters. **Do not narrate any actions or dialogue for player characters.**

${contextString}

${npcDetails}

Player Character Details:
${playerCharacterDetails}

CRITICAL: When describing the NPC's attack or action, you MUST reference ONLY the weapons and items listed in their Equipment. Do NOT invent or reference weapons they don't have.

CRITICAL: You must ONLY reference elements that are explicitly mentioned in the encounter instructions, encounter intro, or existing narrative context. Do NOT invent new objects, people, events, or details that are not already established in the adventure plan.

IMPORTANT: If the NPC would realistically speak during this outcome (expressing success/failure, reactions, taunts, threats, etc.), include their actual dialogue in quotes. However, if the NPC is a non-speaking creature or the outcome doesn't involve speech, use descriptive narrative instead.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—) or en dashes; use commas or periods instead.
- Keep sentences short and clear; avoid semicolons.
- Use novel-like pacing with line breaks: separate distinct beats into separate paragraphs with a blank line between paragraphs.
- Put each spoken line of dialogue on its own line. Dialogue should use straight quotes ("...") and may include dialogue tags like says/asks/replies.

RESTRICTIONS:
- Only reference NPCs, objects, and locations explicitly mentioned in the encounter instructions or intro
- Do not create new characters, items, or events
- Do not add new details to the environment
- Stick strictly to what is already established in the adventure plan

Then, output a JSON array of effects for any characters affected (targetId, healthPercentDelta, status). If the NPC's action results in any characters receiving items, specify these in an \`equipmentToAdd\` array (each item as \`{name: string, description?: string}\`) within the corresponding effect object for the target character.

NPC: ${npc.name}
Player Characters: ${playerCharacterNames.join(", ")}
Action: ${actionResult.actionSummary}
Roll Type: ${rollRequirement.rollType}
Roll Result: ${result} (difficulty: ${rollRequirement.difficulty}, success: ${success})

Respond as JSON:
{
  narrative: string,
  effects: [ { targetId: string, healthPercentDelta?: number, status?: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`

    console.log(
      "[LLM DM] Sending prompt to LLM for outcome generation",
      JSON.stringify(
        {
          promptLength: prompt2.length,
          actionSummary: actionResult.actionSummary,
          rollResult: result,
          success,
          playerCharacterCount: playerCharacters.length,
        },
        null,
        2
      )
    )

    const outcomeResult = (await generateObject({ prompt: prompt2, schema: npcActionOutcomeSchema })).object

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

// Helper function to find encounter in plan
const findEncounterInPlan = (plan: AdventurePlan, encounterId: string): AdventureEncounter | null =>
  plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((encounter) => encounter.id === encounterId) ?? null

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

  // Find current section and scene for context
  let currentSection = undefined
  let currentScene = undefined
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      if (scene.encounters.some((enc) => enc.id === turn!.encounterId)) {
        currentSection = section
        currentScene = scene
        break
      }
    }
    if (currentSection && currentScene) break
  }

  console.log(
    "[LLM DM] Found current context",
    JSON.stringify(
      {
        hasSection: !!currentSection,
        hasScene: !!currentScene,
        sectionTitle: currentSection?.title,
        sceneTitle: currentScene?.title,
        encounterId: turn.encounterId,
      },
      null,
      2
    )
  )

  const sectionContext = currentSection ? { title: currentSection.title, summary: currentSection.summary } : undefined
  const sceneContext = currentScene ? { title: currentScene.title, summary: currentScene.summary } : undefined
  const adventureOverview = plan.overview || undefined

  let characters = turn.characters as TurnCharacter[]
  // Take a snapshot of the current initiative order
  const initiativeOrder = characters.filter((c) => !c.hasReplied && !c.isComplete).sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  let processedNpcCount = 0
  for (const char of initiativeOrder) {
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

    // Use appendNarrative utility for consistent narrative updates
    const newNarrative = appendNarrative(turn!.narrative || "", result.narrativeToAppend || "")

    console.log(
      `[NPC:${npcRequestId}] Updating turn in database`,
      JSON.stringify(
        {
          turnId: turn._id.toString(),
          oldNarrativeLength: turn.narrative?.length || 0,
          newNarrativeLength: newNarrative.length,
          narrativeDelta: newNarrative.length - (turn.narrative?.length || 0),
          oldNarrativePreview: `${turn.narrative?.substring(0, 100)}...`,
          newNarrativePreview: `${newNarrative.substring(0, 100)}...`,
          updatedCharacterCount: result.updatedCharacters.length,
        },
        null,
        2
      )
    )

    await convex.mutation(api.turns.updateTurn, {
      turnId: turn._id,
      patch: {
        characters: result.updatedCharacters,
        narrative: newNarrative,
        updatedAt: Date.now(),
      },
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

  console.log(`[NPC:${npcRequestId}] NPC turns processing completed:`, {
    processed: processedNpcCount,
    total: initiativeOrder.length,
  })
}
