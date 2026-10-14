import { z } from "zod"
import type { GmPorts, Llm } from "../ports"
import type { StoryBeat } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { storyRules } from "../story/prompt"
import { sceneFor, storyOutputObject, storyProse, turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { rollD20 } from "../utils/game-utils"
import { PLAYER_KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { isAiControlledPc, isDeadActor } from "../utils/turn-actors"
import { premiseNote } from "../wiki-adventures/player-safety"
import { createAdventureRollResultService, getEncounterInstructionsFromPlan } from "./adventure-roll-result-service"
import { createAdventureTurnReplyService } from "./adventure-turn-reply-service"

// The character as a player knows them. Each line ends with a newline.
function characterSheet(character: TurnCharacter): string {
  const availableSpells = (character.spells || []).filter((spell) => !spell.isUsed)
  return `Name: ${character.name}
${character.archetype ? `Class/Archetype: ${character.archetype}\n` : ""}${character.race ? `Race: ${character.race}\n` : ""}${character.personality ? `Personality: ${character.personality}\n` : ""}${character.background ? `Background: ${character.background}\n` : ""}${character.motivation ? `Motivation: ${character.motivation}\n` : ""}${character.behavior ? `How they act: ${character.behavior}\n` : ""}${character.appearance ? `Appearance: ${character.appearance}\n` : ""}${character.specialAbilities?.length ? `Special Abilities: ${character.specialAbilities.join(", ")}\n` : ""}${availableSpells.length ? `Spells: ${availableSpells.map((s) => s.name).join(", ")}\n` : ""}${character.skills?.length ? `Skills: ${character.skills.join(", ")}\n` : ""}${character.equipment?.length ? `Equipment: ${character.equipment.map((e) => e.name).join(", ")}\n` : ""}`
}

function buildAiPcIntentPrompt(character: TurnCharacter, narrative: string, sceneRoster: string, scene: StoryScene, premise?: string): string {
  return `You are the PLAYER (not the GM) roleplaying as the character below. Players describe their character's intent and attempt only. The GM determines all outcomes, results, and perceptions.

Given the recent narrative, write as beats what the character does next: an action by "${character.id}" and, only when natural, one brief line in the character's voice. Write actions in third person. Be creative, stay in character, and keep the reply concise, 1-2 short sentences total.

Constraints:
- Read the narrative to identify what the character is expected to do, then describe them actively taking that action.
- When characters have magical or special abilities, describe them casting spells or invoking powers with visible effects.
- Show concrete actions that others in the scene could observe.
- Do not restate character traits, equipment, or special abilities unless they are directly relevant in this moment.
- Focus on what is happening now; avoid listing capabilities or background info.
- Do not use em dashes, en dashes, or semicolons. Use commas or periods instead.
- CRITICAL: Stop the narrative BEFORE any result, outcome, or feedback from the action.
- Do NOT describe what the character perceives, senses, learns, or discovers.
- Do NOT describe effects, reactions, or consequences of the action.
- ${PLAYER_KNOWLEDGE_RULE}
- GAME RULE: You are the PLAYER, not the GM. Players can only describe their character's INTENT and ATTEMPT. The GM (not you) determines outcomes, results, and what the character perceives. Never write the GM's part.

WRONG: "She casts detect magic and feels ancient vibrations emanating from the crate."
RIGHT: "She traces a complex sigil in the air, violet light gathering at her fingertips as she begins to cast detect magic."

WRONG: "He swings his sword and feels the blade connect with armor."
RIGHT: "He raises his blade and lunges forward with a powerful overhead strike."

Character:
${characterSheet(character)}
Others present in the scene: ${sceneRoster || "None"}
${premiseBlock(premise)}
Recent Narrative:
${narrative}

${storyRules(scene)}

Respond as JSON: { "beats": [...] }`
}

// The premise ends with a blank line, or is nothing, so a prompt without one reads as it did before.
const premiseBlock = (premise?: string) => (premiseNote(premise) ? `\n${premiseNote(premise)}\n` : "")

function buildSceneRoster(characters: TurnCharacter[], selfId: string): string {
  return characters
    .filter((c) => c.id !== selfId)
    .map((c) => {
      if (isDeadActor(c)) return `${c.name} (down)`
      const hurt = typeof c.healthPercent === "number" && c.healthPercent < 50 ? ", badly wounded" : ""
      return `${c.name}${hurt}`
    })
    .join("; ")
}

const actionSuggestionsSchema = z.object({
  suggestions: z
    .array(z.object({ label: z.string().min(1).max(60), text: z.string().min(1).max(600) }))
    .min(1)
    .max(4),
})
export type ActionSuggestion = z.infer<typeof actionSuggestionsSchema>["suggestions"][number]

function buildActionSuggestionsPrompt(character: TurnCharacter, narrative: string, allCharacters: TurnCharacter[], premise?: string): string {
  return `You are helping a PLAYER (not the GM) choose what their character does next. Players describe their character's intent and attempt only. The GM determines all outcomes, results, and perceptions.

Given the recent narrative, offer 3 different things the character below could do now. Make them distinct approaches that fit this moment and this character, such as speaking to someone, a careful or clever move, and a bold action.

For each suggestion give:
- label: 2 or 3 words naming the choice, at most 20 characters, such as "Question the guard".
- text: the reply the player would send, 1-2 short sentences. Use third person for actions and put any dialogue in quotes, in the character's voice.

Constraints:
- Respond to what is happening now in the narrative. Name the people and things the character acts on.
- Use only abilities, spells, skills, and equipment the character has.
- Show concrete actions that others in the scene could observe.
- Do not use em dashes, en dashes, or semicolons. Use commas or periods instead.
- Stop each text BEFORE any result, outcome, or feedback from the action.
- Do NOT describe what the character perceives, senses, learns, or discovers.
- Do NOT invent people, places, items, or facts that the narrative has not established.
- ${PLAYER_KNOWLEDGE_RULE}

Character:
${characterSheet(character)}
Others present in the scene: ${buildSceneRoster(allCharacters, character.id) || "None"}
${premiseBlock(premise)}
Recent Narrative:
${narrative}`
}

// Replies offered to a player for their own character's turn, three at most. Like the AI companion's intent, they are
// written from the narrative the players have read, never from the encounter's GM instructions. `context` is added
// to the prompt as it stands, such as the character's saved state. `premise` is the adventure's, which players know.
export async function suggestActions(llm: Llm, character: TurnCharacter, narrative: string, allCharacters: TurnCharacter[], context = "", premise?: string): Promise<ActionSuggestion[]> {
  const prompt = buildActionSuggestionsPrompt(character, narrative, allCharacters, premise) + context
  return (await llm.generateObject({ prompt, schema: actionSuggestionsSchema })).object.suggestions.slice(0, 3)
}

export function createAiPcTurnService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  const { resolvePlayerRollNarrativeAndCharacters } = createAdventureRollResultService(ports)
  const { buildTurnReplyRollRequirement } = createAdventureTurnReplyService(ports)
  const loadAdventurePlanForRuntime = ports.content.loadPlan.bind(ports.content)
  // The AI companion's move, as its own beats: what it does and, at times, says.
  async function generateAiPcIntent(args: { character: TurnCharacter; narrative: string; allCharacters: TurnCharacter[]; scene: StoryScene; premise?: string }): Promise<StoryBeat[]> {
    const prompt = buildAiPcIntentPrompt(args.character, args.narrative, buildSceneRoster(args.allCharacters, args.character.id), args.scene, args.premise)
    const { object } = await generateObject({ prompt, schema: storyOutputObject })
    const beats = cleanStory(object.beats, args.scene, { step: "reply", character: args.character.id })
    if (!beats.length) throw new Error(`Empty intent generated for AI companion ${args.character.name}`)
    return beats
  }

  async function processAiPcTurn(args: { turnId: string; characterId: string; adventure: { _id: string; settingId: string; planId: string } }): Promise<void> {
    const { turnId, characterId, adventure } = args

    let turn = await ports.store.getTurn({ turnId })
    if (!turn) throw new Error("Turn not found")
    let character = (turn.characters as TurnCharacter[]).find((c) => c.id === characterId)
    if (!character || !isAiControlledPc(character) || character.isComplete) {
      console.log("[AI PC] Skipping — character missing, not AI-controlled, or already complete:", characterId)
      return
    }

    const needsRollResolution = character.hasReplied && character.rollRequired && typeof character.rollResult !== "number"
    const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)

    if (!needsRollResolution) {
      const beats = await generateAiPcIntent({
        character,
        narrative: turnScript(turn),
        allCharacters: turn.characters as TurnCharacter[],
        scene: await sceneFor(ports, turn),
        premise: plan?.premise,
      })
      const intent = storyProse(beats)
      console.log("[AI PC] Intent for", character.name, ":", intent)

      const rollRequirement = await buildTurnReplyRollRequirement({
        turn,
        adventure: { settingId: adventure.settingId, planId: adventure.planId },
        characterPerformingAction: character,
        narrativeAction: intent,
      })

      const hasRoll = Boolean(rollRequirement?.rollType && typeof rollRequirement?.difficulty === "number")
      await ports.store.submitReply({
        turnId,
        characterId,
        narrativeAction: intent,
        story: beats,
        rollRequirement: hasRoll ? rollRequirement : undefined,
      })
      if (!hasRoll) return // submitReply marked the character complete

      turn = await ports.store.getTurn({ turnId })
      if (!turn) throw new Error("Turn disappeared while processing AI companion roll")
      character = (turn.characters as TurnCharacter[]).find((c) => c.id === characterId)
    }

    if (!character?.rollRequired || typeof character.rollRequired.difficulty !== "number") {
      console.warn("[AI PC] Expected a pending roll but found none for", characterId)
      return
    }

    if (!plan || !Array.isArray(plan.sections)) throw new Error("Adventure plan not found or invalid")
    const encounterInstructions = getEncounterInstructionsFromPlan(plan, turn.encounterId)

    const baseRoll = rollD20()
    console.log("[AI PC]", character.name, "rolls", baseRoll, "for", character.rollRequired.rollType)

    const rollResolution = await resolvePlayerRollNarrativeAndCharacters({
      turn: {
        _id: turn._id,
        encounterId: turn.encounterId,
        title: turn.title,
        narrative: turn.narrative,
        story: turn.story,
        characters: turn.characters as TurnCharacter[],
        adventureId: turn.adventureId,
        isFinalEncounter: turn.isFinalEncounter,
      },
      character: character as TurnCharacter & { rollRequired: { rollType: string; difficulty: number; modifier?: number } },
      characterId,
      baseRollResult: baseRoll,
      encounterInstructions,
      playerDeath: plan.playerDeath,
      premise: plan.premise,
    })

    await ports.store.updateTurn({
      turnId,
      patch: {
        narrative: rollResolution.narrative,
        story: rollResolution.story,
        characters: rollResolution.characters,
        updatedAt: Date.now(),
      },
    })
  }
  return { generateAiPcIntent, processAiPcTurn }
}
