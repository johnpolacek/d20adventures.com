import { generateObject } from "@/lib/ai";
import { z } from "zod";

// Zod schema for the AI's expected output
const characterUpdateSchema = z.object({
  id: z.string(), // character id
  healthPercent: z.number().min(0).max(100),
  status: z.string().optional(),
});

// Types for dice roll and character (customize as needed)
export interface DiceRoll {
  rollType: string;
  baseRoll: number;
  modifier: string | number;
  result: number;
  difficulty: number;
  character: string;
  success: boolean;
  // ...other fields as needed
}

export interface Character {
  id: string;
  healthPercent: number;
  status?: string;
  // ...other fields as needed
}

export interface Turn {
  characters: Character[];
  // ...other fields as needed
}

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

  // Compose a prompt for the AI
  const prompt = `
Given the following dice roll and the outcome narrative, decide if any character's healthPercent or status should be updated. Only update if the dice roll was a success and the narrative describes harm or a condition.
Dice Roll: ${JSON.stringify(diceRoll)}
Outcome Narrative: ${relevantNarrative}
Current Characters: ${JSON.stringify(turn.characters)}
Return an object with the character id, new healthPercent (0-100), and optional status.
`;

  // Call the AI
  const update = await generateObject({
    prompt,
    schema: characterUpdateSchema,
  });

  // If the AI didn't return a valid update, return the turn unchanged
  if (!update.object || !update.object.id) return turn;

  // Find and update the character in the turn
  const updatedCharacters = turn.characters.map((c) =>
    c.id === update.object.id
      ? {
          ...c,
          healthPercent: typeof update.object.healthPercent === "number" ? update.object.healthPercent : c.healthPercent,
          status: update.object.status ?? c.status,
        }
      : c
  );

  // Return the updated turn
  return {
    ...turn,
    characters: updatedCharacters,
  };
} 