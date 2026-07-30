import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateText } from "@/lib/ai"
import { convex } from "@/lib/convex/server"
import { getEncounterInstructionsFromPlan, resolvePlayerRollNarrativeAndCharacters } from "@/lib/services/adventure-roll-result-service"
import { buildTurnReplyRollRequirement } from "@/lib/services/adventure-turn-reply-service"
import { rollD20 } from "@/lib/utils"
import { isAiControlledPc, isDeadActor } from "@/lib/utils/turn-actors"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { TurnCharacter } from "@/types/adventure"

// AI companions are PCs the server plays automatically. Their turns run through
// the same pipeline a human reply uses (intent -> roll requirement -> submitReply
// -> roll -> outcome), so they present exactly like player turns in the UI.
// The prompt below is the server-side counterpart of the client "Generate"
// prompt in components/adventure/turn-narrative-reply.tsx — keep them in sync.

function buildAiPcIntentPrompt(character: TurnCharacter, narrative: string, sceneRoster: string): string {
  const availableSpells = (character.spells || []).filter((spell) => !spell.isUsed)
  return `You are the PLAYER (not the GM) roleplaying as the character below. Players describe their character's intent and attempt only. The GM determines all outcomes, results, and perceptions.

Given the recent narrative, write a short narrative describing what the character does next. Include a character action and, only when natural, one brief line of dialogue in the character's voice. Use third person for actions and put dialogue in quotes. Be creative, stay in character, and keep the reply concise, 1-2 short sentences total.

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
- GAME RULE: You are the PLAYER, not the GM. Players can only describe their character's INTENT and ATTEMPT. The GM (not you) determines outcomes, results, and what the character perceives. Never write the GM's part.

WRONG: "She casts detect magic and feels ancient vibrations emanating from the crate."
RIGHT: "She traces a complex sigil in the air, violet light gathering at her fingertips as she begins to cast detect magic."

WRONG: "He swings his sword and feels the blade connect with armor."
RIGHT: "He raises his blade and lunges forward with a powerful overhead strike."

Character:
Name: ${character.name}
${character.archetype ? `Class/Archetype: ${character.archetype}\n` : ""}${character.race ? `Race: ${character.race}\n` : ""}${character.personality ? `Personality: ${character.personality}\n` : ""}${character.background ? `Background: ${character.background}\n` : ""}${character.motivation ? `Motivation: ${character.motivation}\n` : ""}${character.behavior ? `How they act: ${character.behavior}\n` : ""}${character.appearance ? `Appearance: ${character.appearance}\n` : ""}${character.specialAbilities?.length ? `Special Abilities: ${character.specialAbilities.join(", ")}\n` : ""}${availableSpells.length ? `Spells: ${availableSpells.map((s) => s.name).join(", ")}\n` : ""}${character.skills?.length ? `Skills: ${character.skills.join(", ")}\n` : ""}${character.equipment?.length ? `Equipment: ${character.equipment.map((e) => e.name).join(", ")}\n` : ""}
Others present in the scene: ${sceneRoster || "None"}

Recent Narrative:
${narrative}`
}

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

export async function generateAiPcIntent(args: { character: TurnCharacter; narrative: string; allCharacters: TurnCharacter[] }): Promise<string> {
  const prompt = buildAiPcIntentPrompt(args.character, args.narrative, buildSceneRoster(args.allCharacters, args.character.id))
  const { text } = await generateText({ prompt })
  const intent = (text || "").trim()
  if (!intent) throw new Error(`Empty intent generated for AI companion ${args.character.name}`)
  return intent
}

/**
 * Run one AI companion's complete turn: generate a player-voice intent, submit
 * it through the normal reply pipeline, and auto-resolve any required roll.
 * Mirrors processTurnReply + resolvePlayerRollResult (app/_actions/adventure.ts)
 * minus the human auth asserts, and without re-entering the autonomous loop.
 * Idempotent: bails if the character is already complete, and resumes a turn
 * that previously crashed between submitReply and roll resolution.
 */
export async function processAiPcTurn(args: {
  turnId: Id<"turns">
  characterId: string
  adventure: { _id: Id<"adventures">; settingId: string; planId: string }
}): Promise<void> {
  const { turnId, characterId, adventure } = args

  let turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")
  let character = (turn.characters as TurnCharacter[]).find((c) => c.id === characterId)
  if (!character || !isAiControlledPc(character) || character.isComplete) {
    console.log("[AI PC] Skipping — character missing, not AI-controlled, or already complete:", characterId)
    return
  }

  const needsRollResolution = character.hasReplied && character.rollRequired && typeof character.rollResult !== "number"

  if (!needsRollResolution) {
    const intent = await generateAiPcIntent({
      character,
      narrative: turn.narrative || "",
      allCharacters: turn.characters as TurnCharacter[],
    })
    console.log("[AI PC] Intent for", character.name, ":", intent)

    const rollRequirement = await buildTurnReplyRollRequirement({
      turn,
      adventure: { settingId: adventure.settingId, planId: adventure.planId },
      characterPerformingAction: character,
      narrativeAction: intent,
    })

    const hasRoll = Boolean(rollRequirement?.rollType && typeof rollRequirement?.difficulty === "number")
    await convex.mutation(api.adventure.submitReply, {
      turnId,
      characterId,
      narrativeAction: intent,
      rollRequirement: hasRoll ? rollRequirement : undefined,
    })
    if (!hasRoll) return // submitReply marked the character complete

    turn = await convex.query(api.adventure.getTurnById, { turnId })
    if (!turn) throw new Error("Turn disappeared while processing AI companion roll")
    character = (turn.characters as TurnCharacter[]).find((c) => c.id === characterId)
  }

  if (!character?.rollRequired || typeof character.rollRequired.difficulty !== "number") {
    console.warn("[AI PC] Expected a pending roll but found none for", characterId)
    return
  }

  const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
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
      characters: turn.characters as TurnCharacter[],
      adventureId: turn.adventureId,
      isFinalEncounter: turn.isFinalEncounter,
    },
    character: character as TurnCharacter & { rollRequired: { rollType: string; difficulty: number; modifier?: number } },
    characterId,
    baseRollResult: baseRoll,
    encounterInstructions,
  })

  await convex.mutation(api.turns.updateTurn, {
    turnId,
    patch: {
      narrative: rollResolution.narrative,
      characters: rollResolution.characters,
      updatedAt: Date.now(),
    },
  })
}
