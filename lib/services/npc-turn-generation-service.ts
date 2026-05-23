import { generateObject } from "@/lib/ai"
import { formatSpellsForPrompt } from "@/lib/services/spell-tracking-service"
import type { Turn, TurnCharacter } from "@/types/adventure"
import { z } from "zod"

const npcActionSchema = z.object({
  actionSummary: z.string(),
  narrative: z.string(),
  actionType: z.enum(["attack", "skill", "skip", "pass", "other"]).default("other"),
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
  narrative: z.string(),
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

export function buildNpcActionContext({
  turn,
  npc,
  encounterContext,
  sectionContext,
  sceneContext,
  adventureOverview,
}: NpcActionContext): {
  contextString: string
  npcDetails: string
  npcEquipmentList: string
  playerCharacters: TurnCharacter[]
  alivePlayerCharacters: TurnCharacter[]
  deadPlayerCharacters: TurnCharacter[]
} {
  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-6).join("\n\n")
  const playerCharacters = turn.characters.filter((character) => character.type === "pc")
  const alivePlayerCharacters = playerCharacters.filter(
    (character) => character.healthPercent !== 0 && character.status !== "dead"
  )
  const deadPlayerCharacters = playerCharacters.filter(
    (character) => character.healthPercent === 0 || character.status === "dead"
  )

  const contextString = [
    adventureOverview ? `Adventure Overview: ${adventureOverview}` : "",
    sectionContext && (sectionContext.title || sectionContext.summary)
      ? `Section Title: ${sectionContext.title || ""}\nSection Summary: ${sectionContext.summary || ""}`
      : "",
    sceneContext && (sceneContext.title || sceneContext.summary)
      ? `Scene Title: ${sceneContext.title || ""}\nScene Summary: ${sceneContext.summary || ""}`
      : "",
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
}): string {
  return `You are the DM for a tabletop RPG. Given the following context, decide what action the NPC should take this turn. Be creative and act as a real DM would. Output a short narrative for the action.

${args.contextString}

${args.npcDetails}

YOUR TASK:
You are the DM. Your SOLE responsibility right now is to decide the action for ONE specific NPC.

**THE CURRENT NPC IS: ${args.npc.name}** (ID: ${args.npc.id}, Type: ${args.npc.type})

CRITICAL: When the NPC attacks or uses equipment, you MUST use ONLY the weapons and items listed in their Equipment above. Do NOT invent or reference weapons they don't have.

CRITICAL: When the NPC casts spells, they may ONLY use spells marked as "Available" in their Spells list above. Spells marked as "Used (unavailable this encounter)" have already been cast and CANNOT be used again until the next encounter. If the NPC has no available spells, they must use physical actions or equipment instead.

CRITICAL: Pay close attention to the NPC's behavior and role. The NPC behavior section describes their specific responsibilities, motivations, and how they should act in this encounter. This is the most important context for determining their action.

**CRITICAL: Dead or unconscious player characters (HP 0% or status "Dead"/"Unconscious") cannot act and should be ignored. Do NOT target them with attacks or actions. Focus only on active, conscious player characters. If a character is dead or unconscious, the NPC should acknowledge this in their narrative but not attempt to interact with them.**

**IMPORTANT: Before deciding the NPC's action, carefully review the 'Recent Narrative' to understand what has ALREADY happened. If a player character has already completed a task (like casting a spell, detecting magic, or performing an action), the NPC should react to that completed action appropriately. Do NOT ask the player to do something they have already done. Instead, the NPC should respond to what has been completed or ask for the next step in the process.**

Based on all the context provided, determine the most logical action for **${args.npc.name}** to take. The 'Recent Narrative' describes what other characters have already done. Do NOT repeat or continue actions for other characters. Your response must be exclusively about **${args.npc.name}**.

IMPORTANT: If the NPC would realistically speak during this action (conversations, negotiations, threats, commands, etc.), include their actual dialogue in quotes. However, if the NPC is a non-speaking creature (like a mindless beast or monster) or the action doesn't involve speaking (pure physical actions, stealth, etc.), use descriptive narrative instead.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—), en dashes, or semicolons. Use commas or periods instead.
- Keep sentences short and clear.
- **FORMATTING REQUIREMENT**: Write 1-2 compact paragraphs. Use \\n\\n (double newlines) between paragraphs. Each paragraph should use 1-2 short sentences.
- Put each spoken line of dialogue on its own line. Dialogue should use straight quotes ("...") and may include dialogue tags like says/asks/replies.

If the NPC would realistically skip or pass their turn (e.g., waiting, observing, preparing, doing nothing), set actionType to "skip" or "pass" and provide appropriate narrative. For example:
- Skip action: 'The goblin scout remains hidden in the shadows, carefully observing the party's movements before making his next move.'
- Pass action: 'The wounded orc takes a defensive stance, catching his breath and waiting for an opening.'

Examples:
- Speaking NPC: 'Silas steps forward, his voice calm but firm. "We need to complete this task quickly and quietly," he says, his eyes scanning the area for threats.'
- Non-speaking creature: 'The dire wolf snarls, its hackles raised as it prepares to pounce on the nearest target.'
- Physical action: 'The guard silently draws his sword, positioning himself to block the exit.'

If the NPC's action involves giving items to a player character, include an "effects" array. Each object in "effects" should have a "targetId" (the ID of the character receiving items) and an "equipmentToAdd" array listing the items ({name: string, description?: string}).

Targetable Player Characters (alive and conscious): ${args.alivePlayerCharacters.map((character) => character.name).join(", ")} (IDs: ${args.alivePlayerCharacters.map((character) => character.id).join(", ")})
${args.deadPlayerCharacters.length > 0 ? `\n\nIMPORTANT: The following player characters are DEAD or UNCONSCIOUS and should NOT be targeted: ${args.deadPlayerCharacters.map((character) => `${character.name} (HP ${character.healthPercent}%, Status: ${character.status || "Dead"})`).join(", ")}. The NPC should acknowledge their condition but not attempt to interact with them.` : ""}

Respond as JSON. The 'narrative' and 'actionSummary' fields must describe the action of **${args.npc.name}** and no one else.
{
  actionSummary: string, // e.g., "Faelar strums a tune on his lute to lighten the mood."
  narrative: string, // e.g., "Faelar, noticing the tension, pulls out his lute. 'A somber crowd for a festival!' he jests, beginning a lighthearted melody."
  actionType: "attack" | "skill" | "skip" | "pass" | "other",
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

  return `You are the DM for a tabletop RPG. Given the action, the dice roll result, and the context, write a short narrative describing the outcome. Focus the narrative on the interacting characters. **Do not narrate any actions or dialogue for player characters.**

${args.contextString}

${args.npcDetails}

Player Character Details:
${playerCharacterDetails}

CRITICAL: Dead or unconscious player characters (marked as "DEAD/UNCONSCIOUS") cannot act and should NOT be targeted. Focus only on active, conscious player characters. If a character is dead or unconscious, acknowledge this in the narrative but do not attempt to interact with them.

CRITICAL: When describing the NPC's attack or action, you MUST reference ONLY the weapons and items listed in their Equipment. Do NOT invent or reference weapons they don't have.

CRITICAL: You must ONLY reference elements that are explicitly mentioned in the encounter instructions, encounter intro, or existing narrative context. Do NOT invent new objects, people, events, or details that are not already established in the adventure plan.

IMPORTANT: If the NPC would realistically speak during this outcome (expressing success/failure, reactions, taunts, threats, etc.), include their actual dialogue in quotes. However, if the NPC is a non-speaking creature or the outcome doesn't involve speech, use descriptive narrative instead.

STYLE AND FORMAT RULES:
- Write in present tense, third person.
- No markdown, no lists, no bullets.
- Do not use em dashes (—), en dashes, or semicolons. Use commas or periods instead.
- Keep sentences short and clear.
- **FORMATTING REQUIREMENT**: Write 1-2 compact paragraphs. Use \\n\\n (double newlines) between paragraphs. Each paragraph should use 1-2 short sentences.
- Put each spoken line of dialogue on its own line. Dialogue should use straight quotes ("...") and may include dialogue tags like says/asks/replies.

RESTRICTIONS:
- Only reference NPCs, objects, and locations explicitly mentioned in the encounter instructions or intro
- Do not create new characters, items, or events
- Do not add new details to the environment
- Stick strictly to what is already established in the adventure plan

Then, output a JSON array of effects for any characters affected (targetId, healthPercentDelta, status). If the NPC's action results in any characters receiving items, specify these in an \`equipmentToAdd\` array (each item as \`{name: string, description?: string}\`) within the corresponding effect object for the target character.

NPC: ${args.npcName}
Player Characters: ${playerCharacterNames.join(", ")}
Action: ${args.actionSummary}
Roll Type: ${args.rollType}
Roll Result: ${args.result} (difficulty: ${args.difficulty}, success: ${args.success})

Respond as JSON:
{
  narrative: string,
  effects: [ { targetId: string, healthPercentDelta?: number, status?: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`
}

export async function generateNpcAction(prompt: string) {
  return (await generateObject({ prompt, schema: npcActionSchema })).object
}

export async function generateNpcOutcome(prompt: string) {
  return (await generateObject({ prompt, schema: npcActionOutcomeSchema })).object
}
