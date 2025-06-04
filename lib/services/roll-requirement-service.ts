import { rollRequirementSchema } from "@/lib/validations/roll-requirement-schema";
import { generateObject } from "@/lib/ai";

/**
 * Given an action or reply string, determine if a dice roll is required.
 * Returns { rollType, difficulty } or null if no roll is required.
 */
export async function getRollRequirementForAction(action: string) {
  const prompt = `
Given the following player or NPC action, determine if a dice roll is required for the character to attempt the action. If a roll is required, return a JSON object with "rollType" (choose the most appropriate from the list below) and "difficulty" (a number between 5 and 25). If no roll is required, return the JSON value null (not a string).

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
Result: { "rollType": "Stealth Check", "difficulty": 15 }

Action: "Attack the goblin."
Result: { "rollType": "Attack Roll", "difficulty": 12 }

Action: "Try to determine what the sound is."
Result: { "rollType": "Perception Check", "difficulty": 10 }

Action: "Say hello."
Result: null

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