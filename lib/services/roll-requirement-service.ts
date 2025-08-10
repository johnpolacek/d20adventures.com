import { generateObject } from "@/lib/ai";
import type { Character } from "@/types/character";
import { z } from "zod";

/**
 * Given an action or reply string and character context, determine if a dice roll is required.
 * Returns { rollType, difficulty } or null if no roll is required.
 */
export async function getRollRequirementForAction(
  action: string,
  character: Character,
  options?: {
    encounterInstructions?: string;
    encounterIntro?: string;
    narrativeContext?: string;
  }
) {
  // Starting roll requirement analysis

  const { encounterInstructions = "", encounterIntro = "", narrativeContext = "" } = options || {};
  // Format character context for the prompt
  const contextLines = [
    `Name: ${character.name}`,
    `Archetype: ${character.archetype}`,
    `Race: ${character.race}`,
    character.spells && character.spells.length > 0 ? `Spells: ${character.spells.map(s => s.name).join(", ")}` : undefined,
    character.skills && character.skills.length > 0 ? `Skills: ${character.skills.join(", ")}` : undefined,
    character.equipment && character.equipment.length > 0 ? `Equipment: ${character.equipment.map(e => e.name).join(", ")}` : undefined,
    character.specialAbilities && character.specialAbilities.length > 0 ? `Special Abilities: ${character.specialAbilities.join(", ")}` : undefined,
  ].filter(Boolean);
  const characterContext = contextLines.length > 0 ? `Character Context:\n${contextLines.join("\n")}\n` : "";

  const encounterContext = `${encounterIntro ? `Encounter Intro:\n${encounterIntro}\n` : ""}` +
    `${encounterInstructions ? `Encounter Instructions:\n${encounterInstructions}\n` : ""}` +
    `${narrativeContext ? `Recent Narrative Context:\n${narrativeContext}\n` : ""}`;

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

3) Otherwise, call for a roll when the outcome is uncertain, opposed, risky, concealed, time‑sensitive, or dependent on skill. Use a general RPG rubric:
   - Social influence: Persuasion (cooperation/charm), Deception (mislead/falsehoods), Intimidation (threat/pressure), Performance (entertain/present).
   - Avoiding notice vs. manual finesse: Stealth (avoid being seen/heard), Sleight of Hand (quick, precise, or concealed manipulation of small items) or specific special skills like pickpocketing, climbing walls, detecting or disabling traps,lockpicking, palming objects).
   - Observation and reasoning: Perception (notice/sense), Investigation (search/analyze evidence), Insight (read motives/intent).
   - Physical challenges: Athletics (power/endurance), Acrobatics (agility/balance/precision movement).
   - Knowledge and expertise: Arcana, History, Nature, Medicine, Religion as appropriate; Survival and Animal Handling for wilderness/creature control.
   - Combat actions: if the action is an attack or contests defenses directly, treat as an Attack roll.

IMPORTANT: There are good and evil characters. This is an important aspect of rpg. Do not sanitize the action or the character's intent.

4) If the action simply follows established procedure (e.g., pays fee, answers routine question) without concealment, opposition, or special risk, choose no roll.

5) Select the most fitting single check and set a DC using:
    - If NO roll is required, set "rollType" to "none" and "difficulty" to 0.

Difficulty guidelines:
- 5 very easy, 6-9 easy, 10-11 average, 12-14 moderate, 15-17 hard, 18-20 very hard, 21-25 nearly impossible.

Use the character's abilities, spells, skills, and equipment when selecting the roll type and setting difficulty.

Action: "${action}"
`;

  console.log("[LLM] Roll requirement prompt:", {
    promptLength: prompt.length,
    action: action.substring(0, 100) + (action.length > 100 ? '...' : ''),
    character: character.name
  });

  try {
    // Use object-only schema for LLM; union with null is not supported by AI SDK response_format
    const llmRollRequirementObjectSchema = z.object({
      rollType: z.string(),
      difficulty: z.number().int(),
      modifier: z.number().int().optional(),
    });

    const result = await generateObject({
      schema: llmRollRequirementObjectSchema,
      prompt,
    });

    console.log("[LLM] Roll requirement response:", {
      rollType: result.object?.rollType,
      difficulty: result.object?.difficulty,
      quality: result.object?.rollType && result.object?.difficulty ? 'valid' : 'invalid'
    });

    const finalResult = (result.object && result.object.rollType !== "none" && result.object.difficulty > 0)
      ? result.object
      : null;
    console.log("[LLM] Roll requirement decision:", {
      character: character.name,
      requiresRoll: !!finalResult,
      rollType: finalResult?.rollType,
      difficulty: finalResult?.difficulty
    });

    return finalResult;
  } catch (error) {
    console.error("[LLM] Roll requirement error:", {
      character: character.name,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
} 