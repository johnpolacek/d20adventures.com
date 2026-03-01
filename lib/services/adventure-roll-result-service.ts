import type { Id } from "@/convex/_generated/dataModel"
import { generateText } from "@/lib/ai"
import { appendNarrative } from "@/lib/services/narrative-service"
import { detectSpellFromRollType, markSpellAsUsed } from "@/lib/services/spell-tracking-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import wait from "waait"

export function getEncounterInstructionsFromPlan(plan: AdventurePlan, encounterId: string): string {
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((entry: { id: string }) => entry.id === encounterId)
      if (encounter) {
        return encounter.instructions || ""
      }
    }
  }
  return ""
}

function buildRollOutcomePrompt(args: {
  narrativeContext: string
  encounterInstructions: string
  presentNpcs: string
  playerActionText: string
  characterName: string
  rollType: string
  totalResult: number
  difficulty: number
  margin: number
}): string {
  return `
Context:
${args.narrativeContext}

Encounter Instructions:
${args.encounterInstructions}

CRITICAL: The encounter instructions may contain conditional statements (e.g., "If X is present..."). Only reference characters, objects, or events mentioned in conditionals if those conditions are actually met in the current scene. Do NOT assume conditional elements are present unless explicitly confirmed.

NPCs ACTUALLY PRESENT in this encounter:
${args.presentNpcs || "None"}

IMPORTANT: Only reference NPCs listed above. Do NOT reference characters mentioned in conditional statements unless they are confirmed to be present.

Player action (verbatim): """${args.playerActionText}"""
  
A dice roll was made for ${args.characterName}: ${args.rollType} (Result: ${args.totalResult}, Difficulty: ${args.difficulty}, Margin: ${args.margin}).

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
}

function sanitizeRollOutcome(text: string): string {
  const rollOutcome = (text || "").trim()
  const metaCommentaryPatterns = [
    /\[No output provided.*?\]/i,
    /\[No narrative.*?\]/i,
    /\[Nothing to output.*?\]/i,
    /No output provided/i,
    /No narrative applies/i,
  ]
  const isMetaCommentary = metaCommentaryPatterns.some((pattern) => pattern.test(rollOutcome))
  return isMetaCommentary ? "" : rollOutcome
}

function normalizeCharactersForHealthAnalysis(characters: TurnCharacter[]): TurnCharacter[] {
  return characters.map(
    (character) =>
      ({
        ...character,
        healthPercent: typeof character.healthPercent === "number" ? character.healthPercent : 100,
      }) as TurnCharacter
  )
}

export async function resolvePlayerRollNarrativeAndCharacters(args: {
  turn: {
    _id: Id<"turns">
    encounterId: string
    title: string
    narrative?: string
    characters: TurnCharacter[]
    adventureId: Id<"adventures">
    isFinalEncounter?: boolean
  }
  character: TurnCharacter & {
    rollRequired: {
      rollType: string
      difficulty: number
      modifier?: number
    }
  }
  characterId: string
  baseRollResult: number
  encounterInstructions: string
}): Promise<{
  narrative: string
  characters: TurnCharacter[]
}> {
  const { rollType, difficulty, modifier = 0 } = args.character.rollRequired
  const baseRoll = args.baseRollResult
  const totalResult = baseRoll + modifier
  const success = totalResult >= difficulty
  const margin = totalResult - difficulty
  const shortcode = `[DiceRoll:rollType=${rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? `+${modifier}` : modifier};result=${totalResult};difficulty=${difficulty};character=${args.character.name};image=${args.character.image};success=${success}]\n`

  let newNarrative = appendNarrative(args.turn.narrative || "", shortcode)
  const paragraphs = (args.turn.narrative || "").split(/\n\n+/).filter(Boolean)
  const playerActionText = paragraphs[paragraphs.length - 1] || ""
  const narrativeContext = (args.turn.narrative || "").split(/\n\n+/).slice(-2).join("\n\n")
  const presentNpcs = args.turn.characters
    .filter((character) => character.type === "npc")
    .map((character) => character.name)
    .join(", ")

  const rollOutcomePrompt = buildRollOutcomePrompt({
    narrativeContext,
    encounterInstructions: args.encounterInstructions,
    presentNpcs,
    playerActionText,
    characterName: args.character.name,
    rollType,
    totalResult,
    difficulty,
    margin,
  })

  let rollOutcome = ""
  try {
    const { text } = await generateText({ prompt: rollOutcomePrompt })
    rollOutcome = sanitizeRollOutcome(text || "")
    if (rollOutcome) {
      newNarrative = appendNarrative(newNarrative, rollOutcome)
    }
  } catch (error) {
    console.error("[resolvePlayerRollResult] Error generating roll outcome:", error)
  }

  const diceRoll = {
    rollType,
    baseRoll,
    modifier,
    result: totalResult,
    difficulty,
    character: args.character.name,
    success,
  }
  await wait(500)

  const healthAffectingRolls = ["Attack", "Constitution", "Strength", "Dexterity"]
  const shouldAnalyzeHealth = !!rollOutcome && healthAffectingRolls.includes(rollType)
  console.log(
    `[resolvePlayerRollResult] Roll analysis: rollType=${rollType}, hasOutcome=${!!rollOutcome}, shouldAnalyzeHealth=${shouldAnalyzeHealth}`
  )

  const normalizedCharacters = normalizeCharactersForHealthAnalysis(args.turn.characters)
  const turnForAnalysis: Turn = {
    id: args.turn._id,
    encounterId: args.turn.encounterId,
    title: args.turn.title,
    narrative: args.turn.narrative || "",
    characters: normalizedCharacters,
    adventureId: args.turn.adventureId,
    isFinalEncounter: args.turn.isFinalEncounter,
  }

  const analyzedTurn = shouldAnalyzeHealth
    ? await analyzeAndApplyDiceRoll({
        turn: turnForAnalysis,
        diceRoll,
        narrative: newNarrative,
      })
    : turnForAnalysis

  let updatedCharacters = analyzedTurn.characters.map((character) =>
    character.id === args.characterId
      ? {
          ...character,
          rollRequired: undefined,
          rollResult: totalResult,
          isComplete: true,
          hasReplied: true,
        }
      : character
  )

  const spellName = detectSpellFromRollType(rollType)
  if (spellName) {
    console.log(
      `[resolvePlayerRollResult] Spell detected: "${spellName}" - marking as used for character ${args.characterId}`
    )
    updatedCharacters = markSpellAsUsed(updatedCharacters, args.characterId, spellName)
  }

  return {
    narrative: newNarrative,
    characters: updatedCharacters,
  }
}

