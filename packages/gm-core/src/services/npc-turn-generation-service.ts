import { z } from "zod"
import type { GmPorts } from "../ports"
import { conditionWords } from "../sheet/conditions"
import { hitPointWords } from "../sheet/hit-points"
import { sidesWords } from "../sheet/sides"
import { moveBudget } from "../sheet/moves"
import { spellWords } from "../sheet/spells"
import { statBlockLines } from "../sheet/stat-block-actions"
import { authoredText } from "../story/authored"
import type { StoryScene } from "../story/clean"
import { type KnownFact, knowledgeNote } from "../story/knowledge"
import { npcNoteRulesNote } from "../story/limits"
import { namesHeard, unheardNote } from "../story/names"
import { storyRules } from "../story/prompt"
import { storyNames } from "../story/render"
import { beatsField, characterScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { CONTINUITY_RULE, FAILED_ROLL_RULE, KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { isDead, isDown } from "../utils/turn-actors"

const npcActionSchema = z.object({
  actionSummary: z.string(),
  ...beatsField,
  actionType: z.enum(["attack", "skill", "skip", "pass", "flee", "die", "other"]).default("other"),
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

const npcActionOutcomeSchema = z.object({
  ...beatsField,
  effects: z.array(
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
  ),
})

type NpcActionContext = {
  turn: Turn
  npc: TurnCharacter
  encounterContext?: { intro?: string; introSource?: string; instructions?: string }
  sectionContext?: { title?: string; summary?: string }
  sceneContext?: { title?: string; summary?: string }
  adventureOverview?: string
  knowledge?: KnownFact[]
  // The adventure's heroes start as strangers: the NPC reads whose names it has not heard.
  strangers?: boolean
  // What this NPC did in the scene's earlier rounds, as a script.
  earlier?: string
  // Where everyone stands, in the engine's words (standingWords). None when the encounter has no floor.
  standing?: string
}

// What an NPC's turn reads. The round and the intro are as the NPC knows them: without the private beats and
// paragraphs it is not in, or the players' own words. The GM's notes stay whole, since they direct the GM.
export function buildNpcActionContext({ turn, npc, encounterContext, sectionContext, sceneContext, adventureOverview, knowledge, strangers, earlier, standing }: NpcActionContext): {
  contextString: string
  npcDetails: string
  // The absolute rules the GM notes set for this NPC, lifted out to sit beside the rule that the notes bind.
  noteRules: string
  npcEquipmentList: string
  playerCharacters: TurnCharacter[]
  alivePlayerCharacters: TurnCharacter[]
  deadPlayerCharacters: TurnCharacter[]
} {
  const narrativeContext = characterScript(turn, npc.id).split(/\n\n+/).slice(-6).join("\n\n")
  const intro = encounterContext?.introSource !== undefined ? authoredText(encounterContext.introSource, storyNames(turn.characters), npc.id) : encounterContext?.intro
  const playerCharacters = turn.characters.filter((character) => character.type === "pc")
  const alivePlayerCharacters = playerCharacters.filter((character) => !isDown(character))
  const deadPlayerCharacters = playerCharacters.filter(isDown)
  // Who the encounter puts with the party and who is a bystander, only where it marks someone (../sheet/sides).
  const sides = sidesWords(turn.characters.filter((character) => !isDead(character) && !character.fled))

  const contextString = [
    adventureOverview ? `Adventure Overview: ${adventureOverview}` : "",
    sectionContext && (sectionContext.title || sectionContext.summary) ? `Section Title: ${sectionContext.title || ""}\nSection Summary: ${sectionContext.summary || ""}` : "",
    sceneContext && (sceneContext.title || sceneContext.summary) ? `Scene Title: ${sceneContext.title || ""}\nScene Summary: ${sceneContext.summary || ""}` : "",
    intro ? `Encounter Intro: ${intro}` : "",
    encounterContext?.instructions ? `Encounter Instructions: ${encounterContext.instructions}` : "",
    npc.behavior ? `NPC Behavior: ${npc.behavior}` : "",
    sides ? `Sides: ${sides}` : "",
    knowledgeNote(knowledge, npc),
    strangers ? unheardNote(namesHeard(knowledge, turn), npc, turn.characters) : "",
    earlier ? `What ${npc.name} did in earlier rounds of this scene. None of these lines is said again, and an action that failed is not tried again the same way:\n${earlier}` : "",
    narrativeContext ? `Recent Narrative:\n${narrativeContext}` : "",
    standing
      ? `Where Everyone Stands:\n${standing}\nThese places and distances are the game's own. ${npc.name} can move ${moveBudget(npc, turn.characters)} feet on this turn before acting, and reaches 5 feet in melee unless a weapon says more. Plan what ${npc.name} can do from where they stand, and tell nothing that disagrees with these distances.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const npcEquipmentList = npc.equipment?.map((equipment) => equipment.name).join(", ") || "None"
  const npcSpellsList = spellWords(npc) || "None"
  // What its stat block lets it do this turn, one line each: a breath not yet recharged is left out.
  const blockLines = statBlockLines(npc)
  const npcDetails = `
NPC Details:
- Name: ${npc.name}
- Race: ${npc.race || "Unknown"}
- Archetype: ${npc.archetype || "Unknown"}
- Equipment: ${npcEquipmentList}
- Skills: ${npc.skills?.join(", ") || "None"}
- Spells: ${npcSpellsList}
${blockLines.length ? `- Stat Block, what it can do this turn:\n${blockLines.map((line) => `  - ${line}`).join("\n")}\n` : ""}- Health: ${hitPointWords(npc)}
- Conditions: ${conditionWords(npc) || "None"}
`

  return {
    contextString,
    npcDetails,
    noteRules: npcNoteRulesNote(encounterContext?.instructions, npc, turn.characters),
    npcEquipmentList,
    playerCharacters,
    alivePlayerCharacters,
    deadPlayerCharacters,
  }
}

export function buildNpcActionPrompt(args: {
  contextString: string
  npcDetails: string
  noteRules?: string
  npc: TurnCharacter
  alivePlayerCharacters: TurnCharacter[]
  deadPlayerCharacters: TurnCharacter[]
  scene: StoryScene
}): string {
  return `You are the DM for a tabletop RPG. Given the following context, decide what action the NPC should take this turn. Be creative and act as a real DM would. Write the action as a few short beats.

${args.contextString}

${args.npcDetails}

YOUR TASK:
You are the DM. Your SOLE responsibility right now is to decide the action for ONE specific NPC.

**THE CURRENT NPC IS: ${args.npc.name}** (ID: ${args.npc.id}, Type: ${args.npc.type})

CRITICAL: When the NPC attacks or uses equipment, you MUST use ONLY the weapons and items listed in their Equipment above. Do NOT invent or reference weapons they don't have.
${statBlockLines(args.npc).length ? "\nCRITICAL: The NPC's Stat Block lines above are what it can do this turn, beside its Equipment. One of its stat block's actions that is not listed there is not ready, and is not used.\n" : ""}
CRITICAL: When the NPC casts spells, they may ONLY use spells marked as "Available" in their Spells list above. Spells marked as "Used (unavailable this encounter)" have already been cast and CANNOT be used again until the next encounter. If the NPC has no available spells, they must use physical actions or equipment instead.

CRITICAL: Pay close attention to the NPC's behavior and role. The NPC behavior section describes their specific responsibilities, motivations, and how they should act in this encounter. This is the most important context for determining their action.

CRITICAL: The NPC Behavior is binding, line by line. If it says the NPC says nothing, give no lines. If it says when the NPC acts, it acts only then and otherwise skips. If it says how the NPC fights, it fights that way: a fighter strikes with a weapon from their Equipment, a caster casts an Available spell from their Spells. An action that failed on an earlier turn is not tried again unchanged: change the approach, the weapon or the spell.

CRITICAL: The Encounter Instructions bind the NPC too. What they say does not happen, or that the NPC does not know, say or give, holds. The NPC gives no clue, location, secret, confession or reveal the instructions do not provide, and states no fact the story has not shown, such as who else is after something. Prices, bids, sums and counts stay as the story has said them, and an item already sold or given away is not offered again.
${args.noteRules ? `\n${args.noteRules}\n` : ""}
**CRITICAL: Dead or unconscious player characters (at 0 hit points) cannot act and should be ignored. Do NOT target them with attacks or actions. Focus only on active, conscious player characters. If a character is dead or unconscious, the NPC should acknowledge this in their beats but not attempt to interact with them.**

**IMPORTANT: Before deciding the NPC's action, carefully review the 'Recent Narrative' to understand what has ALREADY happened. If a player character has already completed a task (like casting a spell, detecting magic, or performing an action), the NPC should react to that completed action appropriately. Do NOT ask the player to do something they have already done. Instead, the NPC should respond to what has been completed or ask for the next step in the process.**

${KNOWLEDGE_RULE}

Based on all the context provided, determine the most logical action for **${args.npc.name}** to take. The 'Recent Narrative' describes what other characters have already done. Do NOT repeat or continue actions for other characters. Your response must be exclusively about **${args.npc.name}**.

IMPORTANT: If the NPC would realistically speak during this action (conversations, negotiations, threats, commands, etc.), give their words as lines. A non-speaking creature (like a mindless beast or monster), or an action that doesn't involve speaking (pure physical actions, stealth, etc.), has no lines.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—), en dashes, or semicolons. Use commas or periods instead.
- Keep sentences short and clear.
- **LENGTH**: At most 2 short sentences of action and narration, 40 words in all. Spoken lines are extra: give lines the Encounter Instructions script as they are written, once, and otherwise at most 2 short lines. One action for the whole turn, not one between each line.
- Say nothing this NPC has already said or done in the 'Recent Narrative', and do not describe again what it has already described.
- A question this NPC has asked that the player has not yet answered is not asked again, in any words. The NPC waits for the answer: the game asks the player.
- An event the Encounter Instructions call for this turn may take up to 4 sentences.

If the NPC would realistically skip or pass their turn (e.g., waiting, observing, preparing, doing nothing), set actionType to "skip" or "pass" and write it as an action. For example:
- Skip: {"kind": "action", "who": "goblin-scout", "text": "The goblin scout stays hidden in the shadows, watching the party."}
- Pass: {"kind": "action", "who": "orc", "text": "The wounded orc takes a defensive stance, catching his breath."}

Examples:
- Speaking NPC: {"kind": "action", "who": "silas", "to": "lyra", "text": "Silas steps forward, his eyes scanning the area."}, {"kind": "line", "who": "silas", "to": "lyra", "delivery": "calm but firm", "text": "We need to do this quickly and quietly."}
- Non-speaking creature: {"kind": "action", "who": "dire-wolf", "to": "milos", "text": "The dire wolf snarls, its hackles raised, ready to pounce."}
- Physical action: {"kind": "action", "who": "guard", "text": "The guard silently draws his sword and blocks the exit."}

The NPC opens no way out of the scene that the Encounter Instructions do not give: no secret passage, no trail or sign left for the heroes to follow, no lead toward a place the encounter does not go.

If the NPC is away from the heroes and does nothing they could see or hear this turn, set actionType to "skip" and leave "beats" empty. Do not narrate that it stays where it is: a turn the heroes cannot perceive is not told.

If the NPC runs away and leaves the scene for good, set actionType to "flee" and narrate them going. They are then out of the encounter and take no further turns. Use it only when they actually get away this turn, not for backing off or taking cover.

If the NPC dies this turn of a wound, poison or curse the story has already given them, set actionType to "die" and narrate their death. They are then dead: they take no further turns and no one may describe them alive again.

If the NPC's action involves giving items to a player character, include an "effects" array. Each object in "effects" should have a "targetId" (the ID of the character receiving items) and an "equipmentToAdd" array listing the items ({name: string, description?: string}).

Targetable Player Characters (alive and conscious): ${args.alivePlayerCharacters.map((character) => character.name).join(", ")} (IDs: ${args.alivePlayerCharacters.map((character) => character.id).join(", ")})
${args.deadPlayerCharacters.length > 0 ? `\n\nIMPORTANT: The following player characters are DEAD or UNCONSCIOUS and should NOT be targeted: ${args.deadPlayerCharacters.map((character) => `${character.name} (${isDead(character) ? "Dead" : "Unconscious"})`).join(", ")}. The NPC should acknowledge their condition but not attempt to interact with them.` : ""}

${storyRules(args.scene)}

Respond as JSON. The 'beats' and 'actionSummary' fields must describe the action of **${args.npc.name}** and no one else.
{
  actionSummary: string, // e.g., "Faelar strums a tune on his lute to lighten the mood."
  beats: [...], // e.g., [{"kind": "action", "who": "faelar", "text": "Faelar notices the tension and pulls out his lute."}, {"kind": "line", "who": "faelar", "delivery": "jesting", "text": "A somber crowd for a festival!"}]
  actionType: "attack" | "skill" | "skip" | "pass" | "flee" | "die" | "other",
  effects?: [ { targetId: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`
}

export function buildNpcOutcomePrompt(args: {
  contextString: string
  npcDetails: string
  playerCharacters: TurnCharacter[]
  npcName: string
  actionSummary: string
  rollType: string
  result: number
  difficulty: number
  success: boolean
  scene: StoryScene
  // Attacks the engine has already resolved, in plain words: each hit or miss, its damage and how the target stands.
  attacks?: string[]
  // What a check or save did to hit points and conditions, already settled by the engine, in plain words.
  harm?: string[]
  // A spell the NPC cast, already resolved by the engine: its name, what it did in plain words, and for a utility
  // spell its own text, which binds what it can do. A stat block's action it used (a breath) is told the same way,
  // with the verb "uses".
  spell?: { name: string; facts: string[]; text?: string; verb?: string }
}): string {
  const playerCharacterNames = args.playerCharacters.map((character) => character.name)
  const playerCharacterDetails = args.playerCharacters
    .map((character) => {
      const status = isDown(character)
        ? `DEAD/UNCONSCIOUS (${isDead(character) ? "Dead" : "Unconscious"})`
        : `${hitPointWords(character)}${conditionWords(character) ? `, Conditions: ${conditionWords(character)}` : ""}`
      return `- ${character.name}: ${character.archetype || "Unknown"}, ${status}, Equipment: ${character.equipment?.map((equipment) => equipment.name).join(", ") || "None"}`
    })
    .join("\n")

  return `You are the DM for a tabletop RPG. Given the action, the dice roll result, and the context, write the outcome as a few short beats. Focus on the interacting characters. **Do not write any actions or lines for player characters.**

${args.contextString}

${args.npcDetails}

Player Character Details:
${playerCharacterDetails}

CRITICAL: Dead or unconscious player characters (marked as "DEAD/UNCONSCIOUS") cannot act and should NOT be targeted. Focus only on active, conscious player characters. If a character is dead or unconscious, acknowledge this in the beats but do not attempt to interact with them.

CRITICAL: When describing the NPC's attack or action, you MUST reference ONLY the weapons and items listed in their Equipment. Do NOT invent or reference weapons they don't have.

CRITICAL: You must ONLY reference elements that are explicitly mentioned in the encounter instructions, encounter intro, or existing narrative context. Do NOT invent new objects, people, events, or details that are not already established in the adventure plan.

IMPORTANT: If the NPC would realistically speak during this outcome (expressing success/failure, reactions, taunts, threats, etc.), give their words as a line. A non-speaking creature, or an outcome without speech, has no lines.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—), en dashes, or semicolons. Use commas or periods instead.
- Keep sentences short and clear.
- **LENGTH**: At most 2 short sentences, 40 words. Say what the action did and where it leaves the characters. Do not describe the wind-up, and do not describe again what the 'Recent Narrative' has already described. A spoken line, if there is one, is extra and short.
- The NPC's action is the first beat, with its effect when one shows: an arrow, a slash, a spell.

RESTRICTIONS:
- Only reference NPCs, objects, and locations explicitly mentioned in the encounter instructions or intro
- Do not create new characters, items, or events
- Do not add new details to the environment
- Stick strictly to what is already established in the adventure plan

${KNOWLEDGE_RULE}

${CONTINUITY_RULE}

${args.success ? "" : `${FAILED_ROLL_RULE}\n\n`}Hit points and conditions are the game's: never give a number for them, and tell no wound or condition the game has not stated. If the NPC's action results in any characters receiving items, output an "effects" array: each entry has the "targetId" of who receives them and an \`equipmentToAdd\` array (each item as \`{name: string, description?: string}\`). Otherwise "effects" is empty.

NPC: ${args.npcName}
Player Characters: ${playerCharacterNames.join(", ")}
Action: ${args.actionSummary}
${
  args.spell
    ? `${args.npcName} ${args.spell.verb ?? "casts"} ${args.spell.name}.${
        args.spell.facts.length
          ? `\nThe game has already rolled ${args.spell.verb ? "it" : "this spell"}:\n${args.spell.facts.map((line) => `- ${line}`).join("\n")}\nTell it exactly as stated: each hit, miss and save, and how each one stands after it. Add no other harm, healing or condition and undo none of it. Give no number.`
          : ""
      }${args.spell.text ? `\nThe spell does what its own text says and no more:\n"""${args.spell.text}"""\nIt changes no one's hit points or conditions.` : ""}`
    : args.attacks?.length
      ? `The game has already rolled this turn's attacks and their damage:\n${args.attacks.map((line) => `- ${line}`).join("\n")}\nTell each blow exactly as stated: the hit or the miss, and how the target stands after it. Add no other harm and undo none of it. Give no number.`
      : `Roll Type: ${args.rollType}\nRoll Result: ${args.result} (difficulty: ${args.difficulty}, success: ${args.success})\n${
          args.harm?.length
            ? `The game has already settled what this did to hit points and conditions:\n${args.harm.map((entry) => `- ${entry}`).join("\n")}\nTell it exactly as stated. Add no other harm, healing or condition and undo none of it. Give no number.`
            : "This roll changes no one's hit points or conditions. No one is wounded, healed, knocked down, knocked out or killed by it."
        }`
}

${storyRules(args.scene)}

Respond as JSON:
{
  beats: [...],
  effects: [ { targetId: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`
}

export function createNpcTurnGenerationService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  // `viewer` is the NPC the prompt plays.
  async function generateNpcAction(prompt: string, viewer?: string) {
    return (await generateObject({ prompt, schema: npcActionSchema, viewer })).object
  }

  async function generateNpcOutcome(prompt: string, viewer?: string) {
    return (await generateObject({ prompt, schema: npcActionOutcomeSchema, viewer })).object
  }
  return { generateNpcAction, generateNpcOutcome }
}
