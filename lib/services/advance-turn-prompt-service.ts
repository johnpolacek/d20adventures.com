import { mapConvexTurnToTurn } from "@/lib/utils"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

type TurnHistoryRow = {
  order?: number
  encounterId: string
  narrative?: string
}

type RecentTurnContext = {
  turn: Turn
  order: number | undefined
  encounterId: string
}

// Type guard for characters with rollRequired and rollResult
function hasRollFields(c: TurnCharacter): c is TurnCharacter & {
  rollRequired: { rollType: string; difficulty: number; modifier?: number }
  rollResult: number
} {
  return "rollResult" in c && typeof c.rollResult === "number" && "rollRequired" in c && typeof c.rollRequired === "object" && c.rollRequired !== null
}

export function findEncounterInPlan(plan: AdventurePlan, encounterId: string): AdventurePlan["sections"][number]["scenes"][number]["encounters"][number] | null {
  return (
    plan.sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .find((encounter) => encounter.id === encounterId) ?? null
  )
}

export function getEncounterTurnStatus(allTurns: TurnHistoryRow[], encounterId: string, currentTurnOrder: number) {
  const completedEncounterTurnCount = allTurns.filter((t) => t.encounterId === encounterId && (t.order || 0) < currentTurnOrder).length
  const encounterTurnDisplay = completedEncounterTurnCount >= 5 ? "5 or more" : String(completedEncounterTurnCount)
  const currentEncounterTurnNumber = completedEncounterTurnCount + 1

  return {
    completedEncounterTurnCount,
    encounterTurnDisplay,
    currentEncounterTurnNumber,
  }
}

export function getRecentTurnsForContext(allTurns: (TurnHistoryRow & Record<string, unknown>)[], currentTurnOrder: number, adventureId: string): RecentTurnContext[] {
  return allTurns
    .filter((t) => typeof t.order === "number" && t.order < currentTurnOrder)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(-5)
    .map((t) => ({
      turn: mapConvexTurnToTurn({
        ...t,
        adventureId,
      }),
      order: t.order,
      encounterId: t.encounterId,
    }))
    .filter((item): item is RecentTurnContext => item.turn !== null)
}

export function buildRollInfo(turn: Turn): string {
  const diceRollRegex = /\[DiceRoll:([^\]]+)\]/g
  const narrativeForRollParsing = turn.narrative ?? ""
  let matches
  let lastDiceRollParamsStr: string | null = null
  while ((matches = diceRollRegex.exec(narrativeForRollParsing)) !== null) {
    lastDiceRollParamsStr = matches[1]
  }

  let rollInfo = "No character-specific dice roll was identified as the immediate precursor to this state."

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
      let modifier: number | undefined
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
      }
    }
  } else {
    const lastRollingCharacter = (turn.characters as TurnCharacter[]).find(hasRollFields)
    if (lastRollingCharacter) {
      const { name, rollRequired, rollResult: charRollResult } = lastRollingCharacter
      const { rollType: charRollType, difficulty: charDifficulty, modifier: charModifier = 0 } = rollRequired
      const charSuccess = charRollResult >= charDifficulty
      rollInfo = `Regarding the most recent dice roll (from character data): Character '${name}' attempted a '${charRollType}'. The result was ${charRollResult} (difficulty: ${charDifficulty}, modifier: ${charModifier}). This roll was a ${charSuccess ? "SUCCESS" : "FAILURE"}.`
    }
  }

  return rollInfo
}

export function buildRecentTurnHistory(recentTurns: RecentTurnContext[]): string {
  return recentTurns.length > 0
    ? `Recent Adventure History (last ${recentTurns.length} turns across encounters):
${recentTurns.map((item) => `Turn ${item.order} [Encounter: ${item.encounterId}]: ${item.turn.narrative || ""}`).join("\n\n")}`
    : "No previous turns available."
}

export function buildTransitionsText(currentEncounter: AdventurePlan["sections"][number]["scenes"][number]["encounters"][number]): string {
  return currentEncounter.transitions
    ? (
        currentEncounter.transitions as {
          condition: string
          encounter: string
        }[]
      )
        .map((t, i) => `Transition Option ${i + 1} (leads to encounter ID: '${t.encounter}'):\n  Condition to check: ${t.condition}`)
        .join("\n")
    : "No explicit transitions defined for this encounter."
}

export function getSectionAndSceneContext(plan: AdventurePlan, encounterId: string): { sectionContext: string; sceneContext: string } {
  let currentSection
  let currentScene
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      if (scene.encounters.some((enc) => enc.id === encounterId)) {
        currentSection = section
        currentScene = scene
        break
      }
    }
    if (currentSection && currentScene) break
  }

  const sectionContext = currentSection ? `Section Title: ${currentSection.title || ""}\nSection Summary: ${currentSection.summary || ""}` : ""
  const sceneContext = currentScene ? `Scene Title: ${currentScene.title || ""}\nScene Summary: ${currentScene.summary || ""}` : ""

  return { sectionContext, sceneContext }
}

export function buildEncounterProgressionPrompt(args: {
  adventureOverview: string
  sectionContext: string
  sceneContext: string
  currentEncounterTitle: string
  currentEncounterId: string
  encounterIntro: string
  encounterInstructions: string
  recentTurnHistory: string
  narrativeContext: string
  mostRecentNarrativeBlock: string
  rollInfo: string
  transitionsText: string
  encounterTurnDisplay: string
  currentEncounterTurnNumber: number
  playerCharacterNames: string
}): string {
  return `
${args.adventureOverview}

${args.sectionContext}

${args.sceneContext}

Current Encounter Title: ${args.currentEncounterTitle}
Current Encounter ID: ${args.currentEncounterId}
Current Encounter Intro:
${args.encounterIntro}
Current Encounter Instructions:
${args.encounterInstructions}

${args.recentTurnHistory}

Recent Narrative Context (last few paragraphs):
${args.narrativeContext}

Most Recent Action/Event from the narrative (this is what the player/environment JUST DID):
${args.mostRecentNarrativeBlock}

${
  args.rollInfo
    ? `Key Information Regarding Recent Dice Roll (related to the 'Most Recent Action/Event'):
${args.rollInfo}
`
    : "No specific dice roll outcome to report for the most recent action."
}
Available Transition Options for '${args.currentEncounterId}':
${args.transitionsText}

Encounter Turn Status: ${args.encounterTurnDisplay} turns have been completed in the current encounter '${args.currentEncounterId}'. You are now processing what will be turn #${args.currentEncounterTurnNumber} in this encounter.

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
   - If NO transition condition is met the 'nextEncounterId' should remain the Current Encounter ID ('${args.currentEncounterId}').
5. Generate a 'narrative' response:
   - If transitioning (because a condition was met by PAST actions/rolls): The narrative should briefly describe the events or state that fulfill the transition condition and logically lead into the new encounter. This acts as a bridge.
   - If NOT transitioning (i.e., 'nextEncounterId' is '${args.currentEncounterId}'): The narrative MUST describe what happens next in the current encounter based on the 'Most Recent Action/Event' and 'Key Information Regarding Recent Dice Roll'. It should set the stage for the player's NEXT decision. For example, if a creature was detected, the narrative might describe the creature appearing or its immediate reaction, prompting the player to decide their next move. DO NOT write new actions or decisions for the player character(s).
   - Do NOT add any questions at the end like 'What does he do next?'
   - Do NOT mention any game mechanics such as dice rolls.

IMPORTANT GUIDELINES:
- Only use encounter IDs explicitly listed in the 'Available Transition Options' or the 'Current Encounter ID' ('${args.currentEncounterId}').
- Your 'narrative' response will set the stage for the player's NEXT turn.
- **CRITICAL REMINDER: DO NOT write new actions, dialogue, choices, or internal thoughts for the player character(s) (e.g., ${args.playerCharacterNames}).** The narrative must describe NPC actions, environmental changes, or the direct, immediate consequences of the player's PAST action/roll. The goal is to prepare for the player's *next actual decision*, not to make it for them.
- If a transition occurs due to a failed dice roll (that already happened), ensure the narrative reflects the consequences of that failure leading to the new situation.
- If a transition occurs due to a successful dice roll (that already happened), ensure the narrative reflects the consequences of that success.
- If no transition occurs, the narrative should clearly end in a way that prompts the player for their next action. For instance, describe the scene and end with a question like "What does Thalbern do next?" or simply describe the immediate situation that demands a response.
- Write in clean, classic fantasy prose without em dashes (—), en dashes (–), figure dashes (‒), horizontal bars (―), or semicolons. Prefer commas or periods instead.
- **FORMATTING REQUIREMENT**: Write 1-2 compact paragraphs. Use \\n\\n (double newlines) between paragraphs. Each paragraph should use 1-2 short sentences. Do NOT write a long block of text.

Respond in JSON:
{
  "nextEncounterId": string, // ID of the next/current encounter based on your evaluation
  "narrative": string      // Narrative prose for the transition OR for continuing the current encounter. IMPORTANT: Do NOT include any questions at the end such as 'What does [character name] do next?' and do NOT mention any game mechanics such as dice rolls. CRITICAL: The narrative MUST be 1-2 compact paragraphs separated by \\n\\n (double newlines). Each paragraph should be 1-2 short sentences.
}
`
}
