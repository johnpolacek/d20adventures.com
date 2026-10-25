import type { GmPorts } from "../ports"
import type { StoryBeat } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { type KnownFact, ledgerNote } from "../story/knowledge"
import { castRulesNote } from "../story/limits"
import { namesHeard, namesNote } from "../story/names"
import { storyRules } from "../story/prompt"
import { lastStep, storyNames, storyText } from "../story/render"
import { rollBeat, sceneFor, storyOutputObject, withStory } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import { CONTINUITY_RULE, FAILED_ROLL_RULE, KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { gmNotesWithRules, keepPlayersAlive } from "../wiki-adventures/player-safety"
import { detectSpellFromRollType, markSpellAsUsed } from "./spell-tracking-service"
import { createTurnUpdateService } from "./turn-update-service"

// Rolls that can hurt by their kind: attacks, saving throws, and checks of the body.
const BODILY_CHECK = /attack|sav(e|ing)|constitution|strength|dexterity|athletics|acrobatics/i
// Words an outcome uses when someone is hurt, so a spell or a trap that strikes is read for health too.
const HARM =
  /\b(?:hit|hits|hitting|struck|strikes?|striking|sears?|seared|searing|burn(?:s|ed|ing)?|scorch(?:es|ed|ing)?|wound(?:s|ed|ing)?|damage[sd]?|slam(?:s|med|ming)?|fling(?:s|ing)?|flung|hurl(?:s|ed|ing)?|bites?|biting|claw(?:s|ed|ing)?|cuts?|cutting|slash(?:es|ed|ing)?|stab(?:s|bed|bing)?|pierc(?:es|ed|ing)|crush(?:es|ed|ing)?|shock(?:s|ed)?|bleed(?:s|ing)?|blood(?:ied|y)?)\b/i
// Rolls and outcomes that heal. Healing Word "knits closed" a wound on Yeva and left her health where it was.
const HEALING = /\b(?:heal(?:s|ed|ing)?|cure[sd]?|mend(?:s|ed|ing)?|knit(?:s|ted|ting)?|restor(?:es|ed|ing)|revive[sd]?|close[sd]? (?:the|her|his|their) wound)\b/i

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
  // The absolute rules in the present NPCs' behavior.
  cast?: string
  dead: string[]
  playerActionText: string
  characterName: string
  rollType: string
  totalResult: number
  difficulty: number
  margin: number
  scene: StoryScene
  ledger?: string
}): string {
  return `
Context:
${args.narrativeContext}
${args.ledger ? `\n${args.ledger}\n` : ""}
Encounter Instructions:
${args.encounterInstructions}

CRITICAL: The encounter instructions may contain conditional statements (e.g., "If X is present..."). Only reference characters, objects, or events mentioned in conditionals if those conditions are actually met in the current scene. Do NOT assume conditional elements are present unless explicitly confirmed.

NPCs ACTUALLY PRESENT in this encounter:
${args.presentNpcs || "None"}
${args.cast ? `\n${args.cast}\n` : ""}${args.dead.length ? `\nDEAD: ${args.dead.join(", ")}. The dead do not act, speak or move, and are never described alive.\n` : ""}
IMPORTANT: Only reference NPCs listed above. Do NOT reference characters mentioned in conditional statements unless they are confirmed to be present.

Player action (verbatim): """${args.playerActionText}"""
  
A dice roll was made for ${args.characterName}: ${args.rollType} (Result: ${args.totalResult}, Difficulty: ${args.difficulty}, Margin: ${args.margin}).

  Guidelines:
  - ALWAYS generate narrative if NPCs are present and the action relates to them (attacking, hiding from, avoiding, reacting to, interacting with, etc.). Actions that respond to NPC threats or presence should be narrated.
  - Generate narrative for successful rolls that affect or respond to NPCs (e.g., successfully hiding from a monster, avoiding an attack, etc.).
  - Do not narrate speech or actions for player characters.
  - Return no beats only if the action is EXCLUSIVELY between player characters with no NPC involvement AND no environmental consequences.
  - Do not invent new objects, people, events, or details. Use only the encounter instructions/intro and established narrative. Someone or something the player's action names that is not established is not there. A position, state or fact the player's action assumes, such as where someone is, holds only if the story shows it. Tell the outcome against the scene as the story shows it.
  - Decide only what this roll decides. Nothing else is resolved here: no one else is killed, captured or beaten.
  - ${CONTINUITY_RULE}${args.margin < 0 ? `\n  - This roll failed. ${FAILED_ROLL_RULE}` : ""}${HEALING.test(args.rollType) || HEALING.test(args.playerActionText) ? "\n  - Healing mends only the hurt the saved character state shows. On someone at full health it finds no wound to close." : ""}
  - Only reference NPCs that are actually present (listed above).
  - ${KNOWLEDGE_RULE}

Write the immediate outcome of the roll as beats: at most 2 short sentences of narration and action, 40 words in all. Say what the action did and where it leaves the characters. Do not describe the hero's action or its wind-up again, since the story has just told it, and do not describe again what the Context already describes. An NPC's spoken line is extra and short. Focus on how the NPC(s) react, perceive, or are affected by the action, or describe the environmental/atmospheric result of the successful roll. The hero's own attack already shows as an effect, so give effects only to what an NPC does.

Write in third person PRESENT tense. Do not use semicolons. Never mention game mechanics, dice, or rules.

${storyRules(args.scene)}

Respond as JSON: { "beats": [...] }`.trim()
}

function sanitizeRollOutcome(text: string): string {
  const rollOutcome = (text || "").trim()
  const metaCommentaryPatterns = [/\[No output provided.*?\]/i, /\[No narrative.*?\]/i, /\[Nothing to output.*?\]/i, /No output provided/i, /No narrative applies/i]
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

export function createAdventureRollResultService(ports: GmPorts) {
  const wait = ports.sleep?.bind(ports) ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  const { analyzeAndApplyDiceRoll } = createTurnUpdateService(ports)
  async function resolvePlayerRollNarrativeAndCharacters(args: {
    turn: {
      _id: string
      encounterId: string
      title: string
      story: StoryBeat[]
      characters: TurnCharacter[]
      adventureId: string
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
    // The adventure's `playerDeath` rule. False keeps player characters alive through the roll's outcome.
    playerDeath?: boolean
    // The adventure's premise, added to the GM's notes.
    premise?: string
    // What each character knows, so the outcome gives no one what they do not.
    knowledge?: KnownFact[]
    // The adventure's heroes start as strangers: the outcome is told whose names who has not heard.
    strangers?: boolean
  }): Promise<{
    story: StoryBeat[]
    characters: TurnCharacter[]
  }> {
    const { rollType, difficulty, modifier = 0 } = args.character.rollRequired
    const baseRoll = args.baseRollResult
    const totalResult = baseRoll + modifier
    const success = totalResult >= difficulty
    const margin = totalResult - difficulty
    const by = { step: "roll" as const, character: args.character.id }
    const roll = rollBeat(by, {
      id: args.character.id,
      name: args.character.name,
      image: args.character.image,
      check: rollType,
      natural: baseRoll,
      modifier,
      total: totalResult,
      dc: difficulty,
      success,
    })
    const story = args.turn.story
    const names = storyNames(args.turn.characters)
    const playerActionText = storyText(lastStep(story), names)
    const narrativeContext = storyText(story, names).split(/\n\n+/).slice(-2).join("\n\n")
    const scene = await sceneFor(ports, args.turn)
    let added: StoryBeat[] = [roll]
    // The dead are named apart, so an outcome does not have one gasp or stand again.
    const isDead = (c: TurnCharacter) => c.healthPercent === 0 || c.status === "dead"
    const presentNpcs = args.turn.characters
      .filter((character) => character.type === "npc" && !isDead(character) && character.status !== "fled")
      .map((character) => character.name)
      .join(", ")
    const deadNames = args.turn.characters.filter(isDead).map((character) => character.name)

    const rollOutcomePrompt = buildRollOutcomePrompt({
      narrativeContext,
      encounterInstructions: gmNotesWithRules(args, args.encounterInstructions) ?? "",
      presentNpcs,
      cast: castRulesNote(args.turn.characters),
      dead: deadNames,
      playerActionText,
      characterName: args.character.name,
      rollType,
      totalResult,
      difficulty,
      margin,
      scene,
      ledger: [ledgerNote(args.knowledge, names), args.strangers ? namesNote(namesHeard(args.knowledge, args.turn), args.turn.characters) : ""].filter(Boolean).join("\n\n"),
    })

    let rollOutcome = ""
    try {
      const { object } = await generateObject({ prompt: rollOutcomePrompt, schema: storyOutputObject })
      const outcome = cleanStory(object.beats, scene, by).filter((b) => !("text" in b) || sanitizeRollOutcome(b.text))
      rollOutcome = outcome.map((b) => ("text" in b ? b.text : "")).join(" ")
      added = [roll, ...outcome]
    } catch (error) {
      console.error("[resolvePlayerRollResult] Error generating roll outcome:", error)
    }

    const { story: newStory } = withStory(args.turn, added)
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

    // Health is read from the outcome after an attack, a save or a feat of body, and after any roll whose outcome
    // tells of harm. Only the exact names Attack, Constitution, Strength and Dexterity counted, so Guiding Bolt "sears
    // into the drake's flank" left it unhurt, and a ward's lightning that flung Cassia into the casks after a failed
    // Misty Step left her untouched.
    // A roll that heals is read the same way, so the health it restores is kept.
    const shouldAnalyzeHealth = !!rollOutcome && (BODILY_CHECK.test(rollType) || HARM.test(rollOutcome) || HEALING.test(rollType) || HEALING.test(rollOutcome))
    console.log(`[resolvePlayerRollResult] Roll analysis: rollType=${rollType}, hasOutcome=${!!rollOutcome}, shouldAnalyzeHealth=${shouldAnalyzeHealth}`)

    const normalizedCharacters = normalizeCharactersForHealthAnalysis(args.turn.characters)
    const turnForAnalysis: Turn = {
      id: args.turn._id,
      encounterId: args.turn.encounterId,
      title: args.turn.title,
      story: args.turn.story,
      characters: normalizedCharacters,
      adventureId: args.turn.adventureId,
      isFinalEncounter: args.turn.isFinalEncounter,
    }

    const analyzedTurn = shouldAnalyzeHealth
      ? await analyzeAndApplyDiceRoll({
          turn: turnForAnalysis,
          diceRoll,
          story: newStory,
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
      console.log(`[resolvePlayerRollResult] Spell detected: "${spellName}" - marking as used for character ${args.characterId}`)
      updatedCharacters = markSpellAsUsed(updatedCharacters, args.characterId, spellName)
    }

    return {
      story: newStory,
      characters: keepPlayersAlive(args, updatedCharacters),
    }
  }
  return { resolvePlayerRollNarrativeAndCharacters }
}
