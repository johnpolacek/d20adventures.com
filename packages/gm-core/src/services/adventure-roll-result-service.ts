import type { GmPorts } from "../ports"
import { type Strike, strike, strikeFacts } from "../sheet/attack"
import { checkBonus, resolveCheck } from "../sheet/check"
import { d20Penalty, saveFailedBy } from "../sheet/conditions"
import { afterHarm, deathSave } from "../sheet/death"
import { applyStakes } from "../sheet/harm"
import type { StoryBeat } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { type KnownFact, ledgerNote } from "../story/knowledge"
import { castRulesNote } from "../story/limits"
import { namesHeard, namesNote } from "../story/names"
import { storyRules } from "../story/prompt"
import { lastStep, storyNames, storyText } from "../story/render"
import { attackBeat, rollBeat, sceneFor, storyOutputObject, withStory } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import { d20sFor, rollDie } from "../utils/game-utils"
import { CONTINUITY_RULE, FAILED_ROLL_RULE, KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { hasFled, isDead, isDown } from "../utils/turn-actors"
import { DEATH_SAVE, isAttackRoll, isDeathSaveRoll, type RequiredRoll } from "../validations/roll-requirement-schema"
import { gmNotesWithRules } from "../wiki-adventures/player-safety"
import { markSpellAsUsed } from "./spell-tracking-service"

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
  // An attack the engine has already resolved, in plain words: the hit or miss, the damage and how the target stands.
  attack?: string
  // What the roll did to hit points and conditions, already settled by the engine, in plain words.
  harm?: string[]
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
  
${
  args.attack
    ? `${args.attack}\nThe game has already rolled this attack and its damage. Tell the blow exactly as stated: the hit or the miss, and how the target stands after it. Add no other harm and undo none of it. Give no number.`
    : `A dice roll was made for ${args.characterName}: ${args.rollType} (Result: ${args.totalResult}, Difficulty: ${args.difficulty}, Margin: ${args.margin}).${
        args.harm?.length
          ? `\nThe game has already settled what this did to hit points and conditions:\n${args.harm.map((line) => `- ${line}`).join("\n")}\nTell it exactly as stated. Add no other harm, healing or condition and undo none of it. Give no number.`
          : "\nThis roll changes no one's hit points or conditions. No one is wounded, healed, knocked down, knocked out or killed by it."
      }`
}

  Guidelines:
  - ALWAYS generate narrative if NPCs are present and the action relates to them (attacking, hiding from, avoiding, reacting to, interacting with, etc.). Actions that respond to NPC threats or presence should be narrated.
  - Generate narrative for successful rolls that affect or respond to NPCs (e.g., successfully hiding from a monster, avoiding an attack, etc.).
  - Do not narrate speech or actions for player characters.
  - Return no beats only if the action is EXCLUSIVELY between player characters with no NPC involvement AND no environmental consequences.
  - Do not invent new objects, people, events, or details. Use only the encounter instructions/intro and established narrative. Someone or something the player's action names that is not established is not there. A position, state or fact the player's action assumes, such as where someone is, holds only if the story shows it. Tell the outcome against the scene as the story shows it.
  - Decide only what this roll decides. Nothing else is resolved here: no one else is killed, captured or beaten.
  - ${CONTINUITY_RULE}${args.margin < 0 ? `\n  - This roll failed. ${FAILED_ROLL_RULE}` : ""}
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

export function createAdventureRollResultService(ports: GmPorts) {
  const wait = ports.sleep?.bind(ports) ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const generateObject = ports.llm.generateObject.bind(ports.llm)
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
    character: TurnCharacter & { rollRequired: RequiredRoll }
    characterId: string
    // The d20s the roller threw. Any the roll still needs are rolled here: two with Advantage or Disadvantage.
    dice?: number[]
    encounterInstructions: string
    // The adventure's `playerDeath` rule. False leaves a hero who would die Stable at 0 hit points instead.
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
    const required = args.character.rollRequired
    const { rollType, mode } = required
    const by = { step: "roll" as const, character: args.character.id }
    const rules = { playerDeath: args.playerDeath }
    if (isDeathSaveRoll(required)) {
      // A dying hero's Death Saving Throw: the rules decide it, and the roll beat tells it. No model is asked.
      const [natural] = d20sFor("normal", args.dice)
      const saved = deathSave(args.character, natural, rules)
      const bonus = 0 - d20Penalty(args.character)
      const beat = rollBeat(by, args.character, DEATH_SAVE.rollType, { dice: [natural], natural, bonus, total: natural + bonus, dc: DEATH_SAVE.difficulty, success: saved.success, mode: "normal" })
      return {
        ...withStory(args.turn, [beat]),
        characters: args.turn.characters.map((character) =>
          character.id === args.characterId ? { ...saved.character, rollRequired: undefined, rollResult: natural, isComplete: true, hasReplied: true } : character
        ),
      }
    }
    let turnCharacters = args.turn.characters
    let blow: Strike | undefined
    let stakeFacts: string[] = []
    let target: TurnCharacter | undefined
    let roll: StoryBeat
    let numbers: { natural: number; bonus: number; total: number; against: number; success: boolean }
    if (isAttackRoll(required)) {
      // An attack: the engine rolls to hit against the target's Armor Class and, on a hit, the damage. The target's
      // hit points change here and nowhere else.
      target = turnCharacters.find((character) => character.id === required.attack.target)
      if (!target) throw new Error("The one attacked is no longer here.")
      const struck = strike({ attacker: args.character, target, weapon: required.attack.weapon, dice: d20sFor(mode, args.dice), mode, roll: rollDie, rules })
      blow = struck
      turnCharacters = turnCharacters.map((character) => (character.id === required.attack.target ? afterHarm(struck.target) : character))
      roll = attackBeat(by, args.character, target.id, blow)
      numbers = { natural: blow.roll.natural, bonus: blow.roll.bonus, total: blow.roll.total, against: blow.roll.armorClass, success: blow.roll.hit }
    } else {
      // The bonus is read from the sheet as the die lands, so the sheet is always the one source of it.
      // A condition may make the roller fail a saving throw outright, whatever the dice show.
      const failedBy = saveFailedBy(args.character, required.check)
      const result = resolveCheck({ dice: d20sFor(mode, args.dice), bonus: checkBonus(args.character, required.check), dc: required.difficulty, mode, fails: !!failedBy })
      // What the roll put at stake is settled here, by the engine: who it hurts or heals, and how they stand after.
      const settled = applyStakes({ characters: turnCharacters, stakes: required.stakes, outcome: result.success ? "success" : "failure", roll: rollDie, rules })
      turnCharacters = settled.characters
      stakeFacts = [...(failedBy ? [`${args.character.name} is ${failedBy} and fails this saving throw outright.`] : []), ...settled.facts]
      roll = rollBeat(by, args.character, rollType, result, settled.harm, settled.conditions)
      numbers = { natural: result.natural, bonus: result.bonus, total: result.total, against: result.dc, success: result.success }
    }
    const spell = isAttackRoll(required) ? undefined : required.spell
    const { total: totalResult, against: difficulty } = numbers
    const margin = totalResult - difficulty
    const story = args.turn.story
    const names = storyNames(args.turn.characters)
    const playerActionText = storyText(lastStep(story), names)
    const narrativeContext = storyText(story, names).split(/\n\n+/).slice(-2).join("\n\n")
    const scene = await sceneFor(ports, args.turn)
    let added: StoryBeat[] = [roll]
    // The dead are named apart, so an outcome does not have one gasp or stand again.
    // The one just struck down is still named among those present, so the outcome can tell them falling.
    const presentNpcs = turnCharacters
      .filter((character) => character.type === "npc" && (!isDown(character) || character.id === target?.id) && !hasFled(character))
      .map((character) => character.name)
      .join(", ")
    const deadNames = turnCharacters.filter((character) => isDead(character) && character.id !== target?.id).map((character) => character.name)

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
      attack: blow && target ? strikeFacts(args.character.name, target.name, blow) : undefined,
      harm: stakeFacts,
      ledger: [ledgerNote(args.knowledge, names), args.strangers ? namesNote(namesHeard(args.knowledge, args.turn), args.turn.characters) : ""].filter(Boolean).join("\n\n"),
    })

    try {
      const { object } = await generateObject({ prompt: rollOutcomePrompt, schema: storyOutputObject })
      const outcome = cleanStory(object.beats, scene, by).filter((b) => !("text" in b) || sanitizeRollOutcome(b.text))
      added = [roll, ...outcome]
    } catch (error) {
      console.error("[resolvePlayerRollResult] Error generating roll outcome:", error)
    }

    const { story: newStory } = withStory(args.turn, added)
    await wait(500)

    // Anyone the outcome left down with no Death Saving Throw to make this round is done with it.
    let updatedCharacters = turnCharacters.map((character) =>
      character.id === args.characterId
        ? {
            ...character,
            rollRequired: undefined,
            rollResult: totalResult,
            isComplete: true,
            hasReplied: true,
          }
        : afterHarm(character)
    )

    if (spell) updatedCharacters = markSpellAsUsed(updatedCharacters, args.characterId, spell)

    return {
      story: newStory,
      characters: updatedCharacters,
    }
  }
  return { resolvePlayerRollNarrativeAndCharacters }
}
