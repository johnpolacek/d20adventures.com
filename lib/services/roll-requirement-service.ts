import { rollRequirementSchema } from "@/lib/validations/roll-requirement-schema";
import { generateObject } from "@/lib/ai";
import type { Character } from "@/types/character";

/**
 * Given an action or reply string and character context, determine if a dice roll is required.
 * Returns { rollType, difficulty } or null if no roll is required.
 */
export async function getRollRequirementForAction(action: string, character: Character) {
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

  const prompt = `
${characterContext}
Given the following player or NPC action, determine if a dice roll is required for the character to attempt the action. If a roll is required, return a JSON object with "rollType" (choose the most appropriate from the list below) and "difficulty" (a number between 5 and 25). If no roll is required, return the JSON value null (not a string).

Use the character's spells, skills, equipment, special abilities, archetype, and race to determine the most appropriate roll type and difficulty. If the action involves casting a spell (e.g., 'casts charm person', 'casts fireball'), use 'Spellcasting Check' as the rollType, unless the spell is an attack (then use 'Attack Roll').

When assigning difficulty, use the following guidance:
- The average/typical difficulty should be 10 or 11 for most normal actions.
- Use 5 for very easy actions, 6-9 for easy, 10-11 for average actions, 15+ for hard actions, and 18-20 for very hard or nearly impossible actions.
- Most actions should be around 10 or 11 unless the action is clearly much easier or harder than normal.

Possible roll types:
- Perception Check
- Investigation Check
- Insight Check
- Stealth Check
- Athletics Check
- Acrobatics Check
- Survival Check
- Nature Check
- Arcana Check
- History Check
- Medicine Check
- Animal Handling Check
- Persuasion Check
- Deception Check
- Intimidation Check
- Performance Check
- Sleight of Hand Check
- Strength Check
- Dexterity Check
- Constitution Check
- Intelligence Check
- Wisdom Check
- Charisma Check
- Attack Roll
- Spellcasting Check
- Saving Throw
- Initiative Roll
- Luck Check
- Reflex Saving Throw
- Fortitude Saving Throw
- Will Saving Throw
- Concentration Check
- Endurance Check
- Religion Check
- Technology Check
- Engineering Check
- Piloting Check
- Driving Check
- Climbing Check
- Swimming Check
- Jumping Check
- Disguise Check
- Bluff Check
- Sense Motive Check
- Use Magic Device Check
- Use Rope Check
- Escape Artist Check
- Appraise Check
- Disable Device Check
- Knowledge (Any) Check
- Perform (Any) Check
- Craft (Any) Check
- Profession (Any) Check
- Read Lips Check
- Tumble Check
- Balance Check
- Ride Check
- Handle Animal Check
- Gather Information Check
- Search Check
- Listen Check
- Spot Check
- Open Lock Check
- Forgery Check
- Diplomacy Check
- Intuition Check
- Morale Check
- Sanity Check
- Willpower Check
- Faith Check
- Social Check
- Streetwise Check
- Investigation Check
- Technology Use Check
- Computer Use Check
- Hacking Check
- Science Check
- Alchemy Check
- Herbalism Check
- Tracking Check
- Navigation Check
- Weather Sense Check
- Cooking Check
- Brewing Check
- Gambling Check
- Barter Check
- Leadership Check
- Strategy Check
- Tactics Check
- Animal Empathy Check
- Psionics Check
- Telepathy Check
- Intuition Check

Examples:
Action: "Try to sneak past the guards."
Result: { "rollType": "Stealth Check", "difficulty": 12 }

Action: "Attack the goblin."
Result: { "rollType": "Attack Roll", "difficulty": 10 }

Action: "Try to determine what the sound is."
Result: { "rollType": "Perception Check", "difficulty": 8 }

Action: "Say hello."
Result: null

Action: "Lyra casts charm person on Silas."
Result: { "rollType": "Spellcasting Check", "difficulty": 11 }

Now, given the following action, determine the roll requirement.

Action: "${action}"
`;
  try {
    const result = await generateObject({
      schema: rollRequirementSchema,
      prompt,
    });
    if (
      result.object &&
      typeof result.object === "object" &&
      "rollType" in result.object &&
      (result.object.rollType === "null" || result.object.rollType === "none" || result.object.rollType === "")
    ) {
      return null;
    }
    return result.object ?? null;
  } catch (error) {
    throw error;
  }
} 