import { z } from "zod"
import type { GmPorts } from "../ports"
import type { StoryScene } from "../story/clean"
import { storyRules } from "../story/prompt"
import { beatsField, turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { formatSpellsForPrompt } from "./spell-tracking-service"

const npcActionSchema = z.object({
  actionSummary: z.string(),
  ...beatsField,
  actionType: z.enum(["attack", "skill", "skip", "pass", "flee", "other"]).default("other"),
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

type NpcActionContext = {
  turn: Turn
  npc: TurnCharacter
  encounterContext?: { intro?: string; instructions?: string }
  sectionContext?: { title?: string; summary?: string }
  sceneContext?: { title?: string; summary?: string }
  adventureOverview?: string
}

export function buildNpcActionContext({ turn, npc, encounterContext, sectionContext, sceneContext, adventureOverview }: NpcActionContext): {
  contextString: string
  npcDetails: string
  npcEquipmentList: string
  playerCharacters: TurnCharacter[]
  alivePlayerCharacters: TurnCharacter[]
  deadPlayerCharacters: TurnCharacter[]
} {
  const narrativeContext = turnScript(turn).split(/\n\n+/).slice(-6).join("\n\n")
  const playerCharacters = turn.characters.filter((character) => character.type === "pc")
  const alivePlayerCharacters = playerCharacters.filter((character) => character.healthPercent !== 0 && character.status !== "dead")
  const deadPlayerCharacters = playerCharacters.filter((character) => character.healthPercent === 0 || character.status === "dead")

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

  const npcEquipmentList = npc.equipment?.map((equipment) => equipment.name).join(", ") || "None"
  const npcSpellsList = npc.spells && npc.spells.length > 0 ? formatSpellsForPrompt(npc) : "None"
  const npcDetails = `
NPC Details:
- Name: ${npc.name}
- Race: ${npc.race || "Unknown"}
- Archetype: ${npc.archetype || "Unknown"}
- Equipment: ${npcEquipmentList}
- Skills: ${npc.skills?.join(", ") || "None"}
- Spells: ${npcSpellsList}
- Health: ${npc.healthPercent ?? 100}%
- Status: ${npc.status || "Normal"}
`

  return {
    contextString,
    npcDetails,
    npcEquipmentList,
    playerCharacters,
    alivePlayerCharacters,
    deadPlayerCharacters,
  }
}

export function buildNpcActionPrompt(args: {
  contextString: string
  npcDetails: string
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

CRITICAL: When the NPC casts spells, they may ONLY use spells marked as "Available" in their Spells list above. Spells marked as "Used (unavailable this encounter)" have already been cast and CANNOT be used again until the next encounter. If the NPC has no available spells, they must use physical actions or equipment instead.

CRITICAL: Pay close attention to the NPC's behavior and role. The NPC behavior section describes their specific responsibilities, motivations, and how they should act in this encounter. This is the most important context for determining their action.

**CRITICAL: Dead or unconscious player characters (HP 0% or status "Dead"/"Unconscious") cannot act and should be ignored. Do NOT target them with attacks or actions. Focus only on active, conscious player characters. If a character is dead or unconscious, the NPC should acknowledge this in their beats but not attempt to interact with them.**

**IMPORTANT: Before deciding the NPC's action, carefully review the 'Recent Narrative' to understand what has ALREADY happened. If a player character has already completed a task (like casting a spell, detecting magic, or performing an action), the NPC should react to that completed action appropriately. Do NOT ask the player to do something they have already done. Instead, the NPC should respond to what has been completed or ask for the next step in the process.**

${KNOWLEDGE_RULE}

Based on all the context provided, determine the most logical action for **${args.npc.name}** to take. The 'Recent Narrative' describes what other characters have already done. Do NOT repeat or continue actions for other characters. Your response must be exclusively about **${args.npc.name}**.

IMPORTANT: If the NPC would realistically speak during this action (conversations, negotiations, threats, commands, etc.), give their words as lines. A non-speaking creature (like a mindless beast or monster), or an action that doesn't involve speaking (pure physical actions, stealth, etc.), has no lines.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—), en dashes, or semicolons. Use commas or periods instead.
- Keep sentences short and clear.
- **LENGTH**: At most 2 short sentences of action and narration, 40 words in all. Spoken lines are extra: give lines the Encounter Instructions script as they are written, and otherwise at most 2 short lines. One action for the whole turn, not one between each line.
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

If the NPC runs away and leaves the scene for good, set actionType to "flee" and narrate them going. They are then out of the encounter and take no further turns. Use it only when they actually get away this turn, not for backing off or taking cover.

If the NPC's action involves giving items to a player character, include an "effects" array. Each object in "effects" should have a "targetId" (the ID of the character receiving items) and an "equipmentToAdd" array listing the items ({name: string, description?: string}).

Targetable Player Characters (alive and conscious): ${args.alivePlayerCharacters.map((character) => character.name).join(", ")} (IDs: ${args.alivePlayerCharacters.map((character) => character.id).join(", ")})
${args.deadPlayerCharacters.length > 0 ? `\n\nIMPORTANT: The following player characters are DEAD or UNCONSCIOUS and should NOT be targeted: ${args.deadPlayerCharacters.map((character) => `${character.name} (HP ${character.healthPercent}%, Status: ${character.status || "Dead"})`).join(", ")}. The NPC should acknowledge their condition but not attempt to interact with them.` : ""}

${storyRules(args.scene)}

Respond as JSON. The 'beats' and 'actionSummary' fields must describe the action of **${args.npc.name}** and no one else.
{
  actionSummary: string, // e.g., "Faelar strums a tune on his lute to lighten the mood."
  beats: [...], // e.g., [{"kind": "action", "who": "faelar", "text": "Faelar notices the tension and pulls out his lute."}, {"kind": "line", "who": "faelar", "delivery": "jesting", "text": "A somber crowd for a festival!"}]
  actionType: "attack" | "skill" | "skip" | "pass" | "flee" | "other",
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
}): string {
  const playerCharacterNames = args.playerCharacters.map((character) => character.name)
  const playerCharacterDetails = args.playerCharacters
    .map((character) => {
      const isDead = character.healthPercent === 0 || character.status === "dead"
      const status = isDead
        ? `DEAD/UNCONSCIOUS (HP ${character.healthPercent}%, Status: ${character.status || "Dead"})`
        : `HP ${character.healthPercent ?? 100}%${character.status ? `, Status: ${character.status}` : ""}`
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

Then, output a JSON array of effects for any characters affected (targetId, healthPercentDelta, status). If the NPC's action results in any characters receiving items, specify these in an \`equipmentToAdd\` array (each item as \`{name: string, description?: string}\`) within the corresponding effect object for the target character.

NPC: ${args.npcName}
Player Characters: ${playerCharacterNames.join(", ")}
Action: ${args.actionSummary}
Roll Type: ${args.rollType}
Roll Result: ${args.result} (difficulty: ${args.difficulty}, success: ${args.success})

${storyRules(args.scene)}

Respond as JSON:
{
  beats: [...],
  effects: [ { targetId: string, healthPercentDelta?: number, status?: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`
}

export function createNpcTurnGenerationService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  async function generateNpcAction(prompt: string) {
    return (await generateObject({ prompt, schema: npcActionSchema })).object
  }

  async function generateNpcOutcome(prompt: string) {
    return (await generateObject({ prompt, schema: npcActionOutcomeSchema })).object
  }
  return { generateNpcAction, generateNpcOutcome }
}
