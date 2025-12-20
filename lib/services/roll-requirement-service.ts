import { generateObject } from "@/lib/ai"
import { formatSpellsForPrompt } from "@/lib/services/spell-tracking-service"
import type { Character } from "@/types/character"
import type { TurnCharacter } from "@/types/adventure"
import { z } from "zod"

/**
 * Given an action or reply string and character context, determine if a dice roll is required.
 * Returns { rollType, difficulty } or null if no roll is required.
 */
export async function getRollRequirementForAction(
  action: string,
  character: Character,
  options?: {
    encounterInstructions?: string
    encounterIntro?: string
    narrativeContext?: string
  }
) {
  // Starting roll requirement analysis

  const { encounterInstructions = "", encounterIntro = "", narrativeContext = "" } = options || {}
  // Format character context for the prompt
  const contextLines = [
    `Name: ${character.name}`,
    `Archetype: ${character.archetype}`,
    `Race: ${character.race}`,
    character.attributes
      ? `Attributes: STR ${character.attributes.strength}, DEX ${character.attributes.dexterity}, CON ${character.attributes.constitution}, INT ${character.attributes.intelligence}, WIS ${character.attributes.wisdom}, CHA ${character.attributes.charisma}`
      : undefined,
    character.spells && character.spells.length > 0
      ? `Spells: ${formatSpellsForPrompt(character as unknown as TurnCharacter)}`
      : undefined,
    character.skills && character.skills.length > 0 ? `Skills: ${character.skills.join(", ")}` : undefined,
    character.equipment && character.equipment.length > 0
      ? `Equipment: ${character.equipment.map((e) => `${e.name}${e.description ? ` (${e.description})` : ""}`).join(", ")}`
      : undefined,
    character.specialAbilities && character.specialAbilities.length > 0 ? `Special Abilities: ${character.specialAbilities.join(", ")}` : undefined,
    character.background ? `Background: ${character.background}` : undefined,
    character.personality ? `Personality: ${character.personality}` : undefined,
  ].filter(Boolean)
  const characterContext = contextLines.length > 0 ? `Character Context:\n${contextLines.join("\n")}\n` : ""

  const encounterContext =
    `${encounterIntro ? `Encounter Intro:\n${encounterIntro}\n` : ""}` +
    `${encounterInstructions ? `Encounter Instructions:\n${encounterInstructions}\n` : ""}` +
    `${narrativeContext ? `Recent Narrative Context:\n${narrativeContext}\n` : ""}`

  // Context built for roll requirement analysis

  const prompt = `
${encounterContext}
${characterContext}

You are a Dungeon Master adjudicating whether a dice roll is needed.

1) First, respect the encounter instructions. If they explicitly allow an action without checks (e.g., paying a stated fee) and the player follows that procedure plainly, choose no roll.

2) NEVER require rolls for basic social interactions between player characters, such as:
   - Simple introductions, greetings, or conversations
   - Approaching another party member to talk
   - Sharing information within the party
   - Basic cooperation or coordination
   These are fundamental party interactions that should always succeed automatically.

3) Default bias: prefer NO roll unless there is concrete uncertainty, opposition, concealment, meaningful risk, or real time pressure. Routine actions should succeed automatically.

4) Passive observation actions: Actions like "watching", "listening", "observing", "keeping watch", or "staying still and observing" are passive and do NOT require Stealth rolls. These are routine observation actions that succeed automatically. Only require Perception if there's something specific and hidden to notice, and only if the narrative context suggests uncertainty about noticing it.

5) Otherwise, call for a roll when the outcome is uncertain, opposed, risky, concealed, time‑sensitive, or dependent on skill. Use a general RPG rubric:
   - Social influence: Persuasion (cooperation/charm), Deception (mislead/falsehoods), Intimidation (threat/pressure), Performance (entertain/present).
   - Avoiding notice vs. manual finesse: Stealth (actively avoid being seen/heard while moving or acting - NOT for passive observation), Sleight of Hand (quick, precise, or concealed manipulation of small items) or specific special skills like pickpocketing, climbing walls, detecting or disabling traps, lockpicking, palming objects).
   - Sleight of Hand specificity: Select Sleight of Hand ONLY when the player's text explicitly attempts theft, pickpocketing, palming/planting an item, a covert handoff, or concealed manipulation of an object against an observer. Do not infer theft intent from flourish, style, or glances. Plain payment or routine handover of coins, even with charm or flourish, does not require Sleight of Hand.
   - Acrobatics specificity: Use Acrobatics ONLY for agility/precision stunts (balancing across a narrow beam, tumbling through hostile space, leaping a gap, vaulting obstacles, slipping bonds). Do NOT require Acrobatics for normal movement like walking, jogging, or threading through an ordinary crowd unless the text describes a stunt or the scene explicitly imposes obstacles/time pressure that demand acrobatic precision.
   - Observation and reasoning: Perception (notice/sense something specific and hidden), Investigation (search/analyze evidence), Insight (read motives/intent).
   - Physical challenges: Athletics (power/endurance), Acrobatics (agility/balance/precision movement).
   - Knowledge and expertise: Arcana, History, Nature, Medicine, Religion as appropriate; Survival and Animal Handling for wilderness/creature control.
   - Spellcasting: If the player is attempting to cast a specific spell (like Charm Person, Fireball, Detect Magic, Identify, etc.), use the spell name followed by "Check" (e.g., "Charm Person Check", "Detect Magic Check", "Identify Check") and adjust the difficulty based on the type of spell. If the action is general magical manipulation without a specific spell, use "Arcana".
   - SPELL AVAILABILITY: Check the character's spell list. Spells marked as "Used (unavailable this encounter)" CANNOT be cast again until the next encounter. If a player attempts to cast a spell that is marked as used/unavailable, set rollType to "none" and difficulty to 0 - the spell simply fails to activate.
   - Combat actions: if the action is an attack or contests defenses directly, treat as an Attack roll.

IMPORTANT: There are good and evil characters. This is an important aspect of rpg. Do not sanitize the action or the character's intent.

6) Movement and routine actions: actions like paying a fee, approaching/following someone at a normal pace, or catching up in a non-hostile, ordinary environment should not require a roll unless the narrative clearly frames it as a chase or obstacle course.

7) If the action simply follows established procedure (e.g., pays fee, answers routine question) without concealment, opposition, or special risk, choose no roll. Paying a posted fee or routine handover, even with flair or charm, should not require a check.

8) Already obtained knowledge: If the narrative context shows a character already SUCCEEDED at a knowledge check (Arcana, History, Religion, Nature, etc.) and learned specific information, they do NOT need another roll to simply share or recall that information. Check the narrative for previous successful rolls and what information was revealed. Simply communicating already-known facts is automatic.

9) Select the most fitting single check and set a DC using:
    - If NO roll is required, set "rollType" to "none" and "difficulty" to 0.

Difficulty guidelines:
- 5 very easy, 6-9 easy, 10-11 average, 12-14 moderate, 15-17 hard, 18-20 very hard, 21-25 nearly impossible.

Use the character's abilities, spells, skills, and equipment when selecting the roll type and setting difficulty.

Action: "${action}"
`

  console.log("[LLM] Roll requirement prompt:", {
    promptLength: prompt.length,
    action,
    character: character.name,
  })

  try {
    // Use object-only schema for LLM; union with null is not supported by AI SDK response_format
    const llmRollRequirementObjectSchema = z.object({
      rollType: z.string(),
      difficulty: z.number().int(),
      modifier: z.number().int().optional(),
    })

    const result = await generateObject({
      schema: llmRollRequirementObjectSchema,
      prompt,
    })

    console.log("[LLM] Roll requirement response:", {
      rollType: result.object?.rollType,
      difficulty: result.object?.difficulty,
      quality: result.object?.rollType && result.object?.difficulty ? "valid" : "invalid",
    })

    const finalResult = result.object && result.object.rollType !== "none" && result.object.difficulty > 0 ? result.object : null
    console.log("[LLM] Roll requirement decision:", {
      character: character.name,
      requiresRoll: !!finalResult,
      rollType: finalResult?.rollType,
      difficulty: finalResult?.difficulty,
    })

    return finalResult
  } catch (error) {
    console.error("[LLM] Roll requirement error:", {
      character: character.name,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
