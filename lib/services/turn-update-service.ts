import { generateObject } from "@/lib/ai";
import { z } from "zod";
import type { Turn, DiceRoll } from "@/types/adventure";

// Zod schema for the AI's expected output
// Accept either a full update object or an empty object (no change)
const characterUpdateSchema = z.union([
  z.object({
    id: z.string(), // character id
    healthPercent: z.number().min(0).max(100),
    status: z.string().optional(),
  }),
  z.object({}).strict(),
]);

type CharacterUpdate = {
  id: string;
  healthPercent: number;
  status?: string;
};

function isCharacterUpdate(value: unknown): value is CharacterUpdate {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.healthPercent === "number" &&
    (v.status === undefined || typeof v.status === "string")
  );
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

If no changes are warranted, return an empty JSON object {}.
If changes are warranted, return an object with the character id, new healthPercent (0-100), and optional status.
`;

  // Call the AI (gracefully handle failures by leaving the turn unchanged)
  let update:
    | {
        object: z.infer<typeof characterUpdateSchema>;
        [key: string]: unknown;
      }
    | undefined;
  try {
    update = await generateObject({
      prompt,
      schema: characterUpdateSchema,
    });
  } catch (err) {
    console.warn("[analyzeAndApplyDiceRoll] generateObject failed, leaving turn unchanged.", err);
    return turn;
  }

  // If the AI didn't return a valid update, return the turn unchanged
  if (!update || !update.object) return turn;

  const obj = update.object as unknown;
  // Allow empty object (no changes)
  if (obj && typeof obj === "object" && Object.keys(obj as Record<string, unknown>).length === 0) {
    return turn;
  }

  if (!isCharacterUpdate(obj)) {
    return turn;
  }

  // Find and update the character in the turn
  const updatedCharacters = turn.characters.map((c) =>
    c.id === obj.id
      ? {
          ...c,
          healthPercent: typeof obj.healthPercent === "number" ? obj.healthPercent : c.healthPercent,
        }
      : c
  );

  // Return the updated turn
  return {
    ...turn,
    characters: updatedCharacters,
  };
} 