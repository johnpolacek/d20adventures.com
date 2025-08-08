import { rollRequirementSchema } from "@/lib/validations/roll-requirement-schema";
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
  console.log("[LLM DM] Starting roll requirement check", JSON.stringify({
    action,
    characterName: character.name,
    characterArchetype: character.archetype,
    characterRace: character.race,
    hasSpells: character.spells && character.spells.length > 0,
    hasSkills: character.skills && character.skills.length > 0,
    hasEquipment: character.equipment && character.equipment.length > 0,
    hasSpecialAbilities: character.specialAbilities && character.specialAbilities.length > 0,
    options: {
      hasEncounterInstructions: !!options?.encounterInstructions,
      hasEncounterIntro: !!options?.encounterIntro,
      hasNarrativeContext: !!options?.narrativeContext
    }
  }, null, 2));

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

  console.log("[LLM DM] Built context for roll requirement", JSON.stringify({
    characterContextLength: characterContext.length,
    encounterContextLength: encounterContext.length,
    contextLinesCount: contextLines.length
  }, null, 2));

  const prompt = `
${encounterContext}
${characterContext}

You are a Dungeon Master adjudicating whether a dice roll is needed.

1. **First, respect the encounter instructions.** If they explicitly state that no dice rolls are necessary for a certain action (e.g., paying an entrance fee) and the player's action follows that flow, then *no roll is required*.

2. If the player's action attempts something beyond what is automatically allowed (e.g., sneaking past the guards **without** paying), determine the most appropriate skill check.

 3. Return strictly **JSON object** with the shape { "rollType": string, "difficulty": number, "modifier"?: number }.
    - If NO roll is required, set "rollType" to "none" and "difficulty" to 0.

Difficulty guidelines:
- 5 very easy, 6-9 easy, 10-11 average, 12-14 moderate, 15-17 hard, 18-20 very hard, 21-25 nearly impossible.

Use the character's abilities, spells, skills, and equipment when selecting the roll type and setting difficulty.

Action: "${action}"
`;

  console.log("[LLM DM] Sending roll requirement prompt to LLM", JSON.stringify({
    promptLength: prompt.length,
    action,
    characterName: character.name
  }, null, 2));

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

    console.log("[LLM DM] LLM response for roll requirement", JSON.stringify({
      rawResult: result.object,
      hasRollType: result.object && "rollType" in result.object,
      hasDifficulty: result.object && "difficulty" in result.object,
      rollType: result.object?.rollType,
      difficulty: result.object?.difficulty
    }, null, 2));

    const finalResult = (result.object && result.object.rollType !== "none" && result.object.difficulty > 0)
      ? result.object
      : null;
    console.log("[LLM DM] Roll requirement check completed", JSON.stringify({
      action,
      characterName: character.name,
      result: finalResult,
      requiresRoll: !!finalResult
    }, null, 2));

    return finalResult;
  } catch (error) {
    console.error("[LLM DM] Error in roll requirement check", JSON.stringify({
      action,
      characterName: character.name,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    throw error;
  }
} 