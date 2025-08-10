import { generateObject } from "@/lib/ai";

import { z } from "zod";

// External utils
import { calculateAttributeModifier } from "@/lib/utils/modifier-utils";

const rollModifierSchema = z.object({
  modifier: z.number().int(),
});

export async function getRollModifier(context: { scenario: unknown; rollRequirement: unknown; character: unknown }) {
  const rollType = typeof context.rollRequirement === 'object' && context.rollRequirement !== null && 'rollType' in context.rollRequirement
    ? String((context.rollRequirement as Record<string, unknown>).rollType)
    : '';
  const characterName = typeof context.character === 'object' && context.character !== null && 'name' in context.character
    ? String((context.character as Record<string, unknown>).name)
    : 'unknown';

  console.log("[LLM] Calculating roll modifier:", { rollType, character: characterName });

  const baseAttributeModifier = calculateAttributeModifier(context.character, rollType);

  const prompt = `
Given the following scenario, roll requirement, and character (paying attention to their archetype, skills, and how they might interact with the environment), determine if there should be an additional situational bonus or penalty (modifier) to the roll.
This modifier should reflect:
1. Environmental factors (e.g., darkness, weather, noise).
2. How the character's specific archetype (e.g., a Ranger's attunement to forests, a Rogue's expertise in shadows) or skills (e.g., Survival, Stealth, Perception proficiency in certain conditions) would uniquely affect their performance in THIS specific situation.

Note: The character's raw ability score modifier (e.g., from Wisdom for Perception) has ALREADY been factored in. You are to provide ONLY the additional modifier based on the situation and the character's specific fitness for it.

Scenario: ${JSON.stringify(context.scenario, null, 2)}
Roll Requirement: ${JSON.stringify(context.rollRequirement, null, 2)}
Character: ${JSON.stringify(context.character, null, 2)}

Respond in JSON: { "modifier": number } (can be negative, zero, or positive).
`;

  console.log("[LLM] Situational modifier prompt:", { promptLength: prompt.length, rollType });

  const result = await generateObject({ prompt, schema: rollModifierSchema });
  const situationalModifier = result.object?.modifier ?? 0;

  console.log("[LLM] Situational modifier response:", { modifier: situationalModifier, quality: typeof situationalModifier === 'number' ? 'valid' : 'invalid' });

  const totalModifier = Math.round(baseAttributeModifier + situationalModifier);

  console.log("[LLM] Roll modifier calculated:", { base: baseAttributeModifier, situational: situationalModifier, total: totalModifier, rollType });

  return totalModifier;
}


