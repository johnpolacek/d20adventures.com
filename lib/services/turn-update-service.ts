import { generateObject } from "@/lib/ai";
import { z } from "zod";
import type { Turn, DiceRoll } from "@/types/adventure";

// Zod schema for the AI's expected output
const characterUpdateSchema = z.object({
  id: z.string(), // character id
  healthPercent: z.number().min(0).max(100),
  status: z.string().optional(),
});

/**
 * Extracts the narrative text that follows the last [DiceRoll:...] shortcode.
 */
function extractNarrativeAfterLastDiceRoll(narrative: string): string | null {
  const diceRollRegex = /\[DiceRoll:[^\]]+\]/g;
  let match: RegExpExecArray | null;
  let lastIndex = -1;
  while ((match = diceRollRegex.exec(narrative)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === -1) return null;
  return narrative.slice(lastIndex).trim();
}

/**
 * Uses generateObject to analyze the most recent dice roll and outcome narrative,
 * and returns an updated turn object with the character's healthPercent and status updated as needed.
 */
export async function analyzeAndApplyDiceRoll({
  turn,
  diceRoll,
  narrative,
}: {
  turn: Turn;
  diceRoll: DiceRoll;
  narrative: string;
}): Promise<Turn> {
  // Extract only the narrative following the last dice roll shortcode
  const relevantNarrative = extractNarrativeAfterLastDiceRoll(narrative);

  if (!relevantNarrative) {
    // If we can't find the relevant narrative, return the turn unchanged
    return turn;
  }

  // Determine if this is a natural 1 or 20, or calculate performance delta
  let narrativeGuidance = "";
  
  if (diceRoll.baseRoll === 1) {
    narrativeGuidance = "This was a catastrophic failure. The narrative should reflect dramatic, unexpected negative consequences that go beyond a simple failure.";
  } else if (diceRoll.baseRoll === 20) {
    narrativeGuidance = "This was a spectacular success. The narrative should reflect exceptional, dramatically positive outcomes that exceed normal success.";
  } else {
    const delta = diceRoll.result - diceRoll.difficulty;
    if (delta > 0) {
      narrativeGuidance = `This was a success that exceeded the target by ${delta} points. The narrative should reflect how well the action was performed.`;
    } else {
      narrativeGuidance = `This was a failure that missed the target by ${Math.abs(delta)} points. The narrative should reflect the degree of the failure.`;
    }
  }

  // Compose a prompt for the AI
  const prompt = `
Given the outcome narrative and performance context, decide if any character's healthPercent or status should be updated. Only update if the narrative describes harm, healing, or a condition change.

${narrativeGuidance}

Outcome Narrative: ${relevantNarrative}
Current Characters: ${JSON.stringify(turn.characters)}

Return an object with the character id, new healthPercent (0-100), and optional status if any changes are warranted.
`;

  // Call the AI
  const update = await generateObject({
    prompt,
    schema: characterUpdateSchema,
  });

  console.log("[analyzeAndApplyDiceRoll] update:", JSON.stringify(update.object, null, 2))

  // If the AI didn't return a valid update, return the turn unchanged
  if (!update.object || !update.object.id) return turn;

  // Find and update the character in the turn
  const updatedCharacters = turn.characters.map((c) =>
    c.id === update.object.id
      ? {
          ...c,
          healthPercent: typeof update.object.healthPercent === "number" ? update.object.healthPercent : c.healthPercent,
        }
      : c
  );

  // Return the updated turn
  return {
    ...turn,
    characters: updatedCharacters,
  };
} 