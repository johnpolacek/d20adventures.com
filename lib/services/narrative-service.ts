import { z } from "zod";
import { generateObject } from "@/lib/ai";

// Thin compatibility layer: re-export split services and utils
export { formatNarrativeAction, generateNarrativeUpdate, generateRollOutcomeNarrativeWithContext } from "@/lib/services/narrative-generation-service";
export { getRollModifier } from "@/lib/services/roll-modifier-service";
export { appendNarrative, normalizeNarrative, limitToTwoSentences, fixMalformedQuotes } from "@/lib/utils/narrative-utils";
export { analyzePlayerInput } from "@/lib/utils/narrative-analysis";

// Keep helper if current callsites depend on it (new code should use roll-requirement-service)
const rollRequirementSchema = z.object({
  rollType: z.string(),
  difficulty: z.number().int(),
  modifier: z.number().int().optional(),
});

export async function getRollRequirementHelper(
  playerInput: string,
  context: { encounterIntro?: string; encounterInstructions?: string; narrativeContext?: string }
) {
  const prompt = `
Encounter Intro:
${context.encounterIntro || ""}

Encounter Instructions:
${context.encounterInstructions || ""}

Narrative Context:
${context.narrativeContext || ""}

Player action or narrative: "${playerInput}"

CRITICAL: The encounter instructions are the highest priority. If they contain phrases like "No dice rolls should be necessary", "no rolls required", "automatic success", or similar language, then NO roll should be required for actions that follow the intended flow of the encounter.

Pay special attention to:
- If the instructions say no rolls are needed for a specific action (like paying entrance fees), then NO roll should be required for that action
- Only require rolls for actions that clearly violate the encounter's intended flow or involve actual deception/conflict

Given the above, decide if a D&D-style roll is required. If so, return the type of roll and a difficulty (DC) between 5 and 20.

For spellcasting actions:
- If the player is attempting to cast a specific spell (like Charm Person, Fireball, Detect Magic, etc.), use the spell name followed by "Check" (e.g., "Charm Person Check", "Fireball Check") and adjust the difficulty based on the type of spell.
- If the player is attempting a general magical action without a specific spell, use "Arcana Check".

For non-spellcasting actions, use the appropriate skill check (Perception, Investigation, Stealth, Athletics, Acrobatics, Survival, Deception, Persuasion, Intimidation, Insight, Nature, Animal Handling, Medicine, History, Sleight of Hand, Performance, Attack, etc.)

Respond in JSON: { "rollType": string, "difficulty": number } or null if no roll is needed.
`;
  const result = await generateObject({ prompt, schema: rollRequirementSchema });
  return result.object ?? null;
}


