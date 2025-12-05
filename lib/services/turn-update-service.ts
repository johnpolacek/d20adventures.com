import { generateObject } from "@/lib/ai"
import type { DiceRoll, Turn } from "@/types/adventure"
import { z } from "zod"

// Zod schema for the AI's expected output
// Accept either a full update object or an empty object (no change)
const characterUpdateSchema = z.union([
  z.object({
    id: z.string(), // character id
    healthPercent: z.number().min(0).max(100),
    status: z.string().optional(),
  }),
  z.object({}).strict(),
])

type CharacterUpdate = {
  id: string
  healthPercent: number
  status?: string
}

function isCharacterUpdate(value: unknown): value is CharacterUpdate {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.id === "string" && typeof v.healthPercent === "number" && (v.status === undefined || typeof v.status === "string")
}

/**
 * Extracts the narrative text that follows the last [DiceRoll:...] shortcode.
 */
function extractNarrativeAfterLastDiceRoll(narrative: string): string | null {
  const diceRollRegex = /\[DiceRoll:[^\]]+\]/g
  let match: RegExpExecArray | null
  let lastIndex = -1
  while ((match = diceRollRegex.exec(narrative)) !== null) {
    lastIndex = match.index + match[0].length
  }
  if (lastIndex === -1) return null
  return narrative.slice(lastIndex).trim()
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
  turn: Turn
  diceRoll: DiceRoll
  narrative: string
}): Promise<Turn> {
  // Extract only the narrative following the last dice roll shortcode
  const relevantNarrative = extractNarrativeAfterLastDiceRoll(narrative)

  if (!relevantNarrative) {
    // If we can't find the relevant narrative, return the turn unchanged
    return turn
  }

  // Determine if this is a natural 1 or 20, or calculate performance delta
  let narrativeGuidance = ""

  if (diceRoll.baseRoll === 1) {
    narrativeGuidance = "This was a catastrophic failure. The narrative should reflect dramatic, unexpected negative consequences that go beyond a simple failure."
  } else if (diceRoll.baseRoll === 20) {
    narrativeGuidance = "This was a spectacular success. The narrative should reflect exceptional, dramatically positive outcomes that exceed normal success."
  } else {
    const delta = diceRoll.result - diceRoll.difficulty
    if (delta > 0) {
      narrativeGuidance = `This was a success that exceeded the target by ${delta} points. The narrative should reflect how well the action was performed.`
    } else {
      narrativeGuidance = `This was a failure that missed the target by ${Math.abs(delta)} points. The narrative should reflect the degree of the failure.`
    }
  }

  // Compose a prompt for the AI
  const prompt = `
You must decide if any character's healthPercent should be updated based ONLY on the outcome narrative.

IMPORTANT RULES:
- Only update health if the narrative explicitly describes physical damage, injury, healing, or recovery
- Conversations, social interactions, skill checks, and mental effects do NOT affect health
- Failed social rolls (like Insight, Persuasion, Deception) should NEVER change health
- Only combat actions, environmental hazards, or explicit healing should affect health

${narrativeGuidance}

Outcome Narrative: "${relevantNarrative}"
Current Characters: ${JSON.stringify(turn.characters)}

If NO physical harm, healing, or injury is described in the narrative, return an empty JSON object {}.
If physical harm or healing IS explicitly described, return an object with the character id and new healthPercent (0-100).
`

  console.log("[analyzeAndApplyDiceRoll] Prompt:", prompt)
  console.log("[analyzeAndApplyDiceRoll] Relevant narrative:", relevantNarrative)
  console.log("[analyzeAndApplyDiceRoll] DiceRoll:", JSON.stringify(diceRoll, null, 2))

  // Call the AI (gracefully handle failures by leaving the turn unchanged)
  let update:
    | {
        object: z.infer<typeof characterUpdateSchema>
        [key: string]: unknown
      }
    | undefined
  try {
    update = await generateObject({
      prompt,
      schema: characterUpdateSchema,
    })
    console.log("[analyzeAndApplyDiceRoll] AI Response:", JSON.stringify(update, null, 2))
  } catch (err) {
    console.warn("[analyzeAndApplyDiceRoll] generateObject failed, leaving turn unchanged.", err)
    return turn
  }

  // If the AI didn't return a valid update, return the turn unchanged
  if (!update || !update.object) {
    console.log("[analyzeAndApplyDiceRoll] No update object returned")
    return turn
  }

  const obj = update.object as unknown
  console.log("[analyzeAndApplyDiceRoll] Update object:", JSON.stringify(obj, null, 2))

  // Allow empty object (no changes)
  if (obj && typeof obj === "object" && Object.keys(obj as Record<string, unknown>).length === 0) {
    console.log("[analyzeAndApplyDiceRoll] Empty object returned, no changes")
    return turn
  }

  if (!isCharacterUpdate(obj)) {
    console.log("[analyzeAndApplyDiceRoll] Object is not a valid character update")
    return turn
  }

  console.log("[analyzeAndApplyDiceRoll] Applying character update:", JSON.stringify(obj, null, 2))

  // Additional safety check: ensure the narrative actually contains words indicating physical harm/healing
  const harmKeywords = ["damage", "injury", "wounded", "hurt", "bleeding", "pain", "struck", "hit", "slashed", "pierced", "burned", "poisoned"]
  const healKeywords = ["heal", "recover", "restoration", "mend", "cure", "health restored", "vitality"]
  const narrativeLower = relevantNarrative.toLowerCase()

  const hasPhysicalContent = [...harmKeywords, ...healKeywords].some((keyword) => narrativeLower.includes(keyword))

  if (!hasPhysicalContent) {
    console.log("[analyzeAndApplyDiceRoll] No physical harm/healing keywords found in narrative, ignoring health update")
    return turn
  }

  // Validate the health change is reasonable
  const targetCharacter = turn.characters.find((c) => c.id === obj.id)
  if (!targetCharacter) {
    console.log("[analyzeAndApplyDiceRoll] Target character not found, ignoring update")
    return turn
  }

  const currentHealth = targetCharacter.healthPercent ?? 100
  const newHealth = obj.healthPercent

  // Prevent unreasonable health changes (more than 50% in one turn from social interactions)
  if (Math.abs(newHealth - currentHealth) > 50) {
    console.log(`[analyzeAndApplyDiceRoll] Unreasonable health change detected: ${currentHealth}% -> ${newHealth}%, ignoring update`)
    return turn
  }

  // Find and update the character in the turn
  const updatedCharacters = turn.characters.map((c) =>
    c.id === obj.id
      ? {
          ...c,
          healthPercent: typeof obj.healthPercent === "number" ? obj.healthPercent : c.healthPercent,
        }
      : c
  )

  // Return the updated turn
  return {
    ...turn,
    characters: updatedCharacters,
  }
}
