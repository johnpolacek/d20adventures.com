import { generateObject } from "@/lib/ai"
import type { DiceRoll, Turn } from "@/types/adventure"
import { z } from "zod"

// Enhanced schema: AI must provide reasoning for health and status changes
const healthAnalysisSchema = z.object({
  hasPhysicalEffect: z.boolean().describe("Whether the narrative describes physical damage, injury, healing, or recovery"),
  reasoning: z.string().describe("Brief explanation of why health/status should or should not change"),
  update: z
    .object({
      characterId: z.string().describe("The id of the character whose health/status changed"),
      newHealthPercent: z.number().min(0).max(100).optional().describe("The new health percentage after this action (if health changed)"),
      newStatus: z.string().optional().describe("New status condition (e.g., 'Off-balance', 'Stunned', 'Bleeding') or empty string to clear status"),
      damageOrHealingDescription: z.string().describe("Brief description of what caused the health/status change"),
    })
    .nullable()
    .describe("Null if no health/status change, otherwise the update details"),
})

type HealthAnalysis = z.infer<typeof healthAnalysisSchema>

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
 * Uses AI to analyze the narrative and determine if any character's health should change.
 * Returns an updated turn object with the character's healthPercent updated as needed.
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
  console.log("[analyzeAndApplyDiceRoll] Input diceRoll:", JSON.stringify(diceRoll, null, 2))
  console.log("[analyzeAndApplyDiceRoll] Input turn:", JSON.stringify({ characterCount: turn.characters.length, characters: turn.characters.map(c => ({ id: c.id, name: c.name, healthPercent: c.healthPercent, status: c.status })) }, null, 2))

  // Extract only the narrative following the last dice roll shortcode
  const relevantNarrative = extractNarrativeAfterLastDiceRoll(narrative)

  if (!relevantNarrative) {
    console.log("[analyzeAndApplyDiceRoll] No narrative found after dice roll")
    console.log("[analyzeAndApplyDiceRoll] Full narrative:", narrative)
    return turn
  }

  console.log("[analyzeAndApplyDiceRoll] Extracted relevant narrative:", relevantNarrative)

  // Build context about the roll outcome
  let rollContext = ""
  if (diceRoll.baseRoll === 1) {
    rollContext = "This was a CRITICAL FAILURE (natural 1). The outcome should be dramatically bad."
  } else if (diceRoll.baseRoll === 20) {
    rollContext = "This was a CRITICAL SUCCESS (natural 20). The outcome should be exceptionally good."
  } else {
    const delta = diceRoll.result - diceRoll.difficulty
    rollContext = diceRoll.success
      ? `This was a SUCCESS (exceeded target by ${delta} points).`
      : `This was a FAILURE (missed target by ${Math.abs(delta)} points).`
  }

  // Build character summary for context - include attributes for damage assessment
  const characterSummary = turn.characters.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    archetype: c.archetype ?? "Unknown",
    currentHealthPercent: c.healthPercent ?? 100,
    currentStatus: c.status ?? "",
    // Include key combat stats for accurate damage assessment
    strength: c.attributes?.strength ?? 10,
    constitution: c.attributes?.constitution ?? 10,
    equipment: c.equipment?.map((e) => e.name).slice(0, 5) ?? [], // Include primary equipment
  }))

  console.log("[analyzeAndApplyDiceRoll] Character summary:", JSON.stringify(characterSummary, null, 2))
  console.log("[analyzeAndApplyDiceRoll] Roll context:", rollContext)

  const prompt = `Analyze this combat/action narrative to determine if any character's health or status should change.

ROLL CONTEXT:
- Roll Type: ${diceRoll.rollType}
- Character Acting: ${diceRoll.character}
- ${rollContext}

OUTCOME NARRATIVE:
"${relevantNarrative}"

CURRENT CHARACTERS:
${JSON.stringify(characterSummary, null, 2)}

CRITICAL: When matching characters mentioned in the narrative to the character list above:
- Match characters ONLY by their exact names from the CURRENT CHARACTERS list
- Do NOT match characters based on descriptions in the narrative (e.g., "elven operative", "the mage", "the warrior") unless those descriptions match the character's actual name
- If the narrative mentions a character that doesn't exist in CURRENT CHARACTERS, ignore that reference
- Only apply health/status changes to characters that are actually present in CURRENT CHARACTERS

RULES FOR HEALTH CHANGES:
1. Only physical damage, injury, healing, or recovery affects health
2. Social interactions, skill checks, and mental effects do NOT affect health
3. Failed social rolls (Insight, Persuasion, Deception) NEVER change health
4. Stumbling, falling without injury, or near-misses do NOT change health

DAMAGE CALCULATION GUIDELINES:
- Consider the ATTACKER's strength and weapon: High STR (14+) with heavy weapons = more damage
- Consider the TARGET's constitution and armor: Low CON (10 or below) = takes more damage
- A strong warrior (STR 16) hitting a fragile scholar (CON 10) with a sword should deal 20-30% damage
- A weak character attacking a tough armored foe should deal only 5-10% damage
- Use the character stats provided to calculate realistic damage:

BASE DAMAGE BY ATTACK SUCCESS:
- Barely succeeded (1-2 over DC): 10-15% health loss
- Solid success (3-5 over DC): 15-25% health loss  
- Exceptional success (6+ over DC): 20-30% health loss
- Critical hit (nat 20): 25-40% health loss

MODIFIERS:
- Strong attacker (STR 14+) vs weak target (CON 10-): Add 5-10% more damage
- Weak attacker (STR 10-) vs tough target (CON 14+): Reduce damage by 5-10%
- Heavy weapon (sword, mace, axe): Add 5% damage
- Light weapon (dagger, fists): Reduce damage by 5%

RULES FOR STATUS CHANGES:
1. Status represents temporary conditions (e.g., "Off-balance", "Stunned", "Bleeding", "Prone", "Grappled")
2. Only update status if the narrative explicitly describes a condition that affects the character
3. Use empty string "" to clear status if a condition is resolved
4. Common status conditions: "Off-balance", "Stunned", "Bleeding", "Prone", "Grappled", "Disadvantaged", "Advantaged"
5. Status should reflect immediate tactical effects from the action

Analyze the narrative and determine if health or status should change.`

  console.log("[analyzeAndApplyDiceRoll] Sending prompt to AI")

  let analysis: HealthAnalysis
  try {
    const result = await generateObject({
      prompt,
      schema: healthAnalysisSchema,
    })
    analysis = result.object as HealthAnalysis
    console.log("[analyzeAndApplyDiceRoll] AI Response (full):", JSON.stringify(result, null, 2))
    console.log("[analyzeAndApplyDiceRoll] AI Analysis (parsed):", JSON.stringify(analysis, null, 2))
  } catch (err) {
    console.error("[analyzeAndApplyDiceRoll] AI analysis failed, leaving turn unchanged")
    console.error("[analyzeAndApplyDiceRoll] Error:", JSON.stringify(err, null, 2))
    return turn
  }

  // If no physical effect or no update, return unchanged
  if (!analysis.hasPhysicalEffect || !analysis.update) {
    console.log("[analyzeAndApplyDiceRoll] No health/status change needed")
    console.log("[analyzeAndApplyDiceRoll] Reasoning:", analysis.reasoning)
    console.log("[analyzeAndApplyDiceRoll] hasPhysicalEffect:", analysis.hasPhysicalEffect)
    console.log("[analyzeAndApplyDiceRoll] update:", JSON.stringify(analysis.update, null, 2))
    return turn
  }

  console.log("[analyzeAndApplyDiceRoll] Health/status change detected")
  console.log("[analyzeAndApplyDiceRoll] Update details:", JSON.stringify(analysis.update, null, 2))

  // Validate the target character exists
  const targetCharacter = turn.characters.find((c) => c.id === analysis.update!.characterId)
  if (!targetCharacter) {
    console.error("[analyzeAndApplyDiceRoll] Target character not found")
    console.error("[analyzeAndApplyDiceRoll] Requested characterId:", analysis.update.characterId)
    console.error("[analyzeAndApplyDiceRoll] Available character IDs:", JSON.stringify(turn.characters.map(c => c.id), null, 2))
    return turn
  }

  console.log("[analyzeAndApplyDiceRoll] Target character found:", JSON.stringify({ 
    id: targetCharacter.id, 
    name: targetCharacter.name, 
    currentHealthPercent: targetCharacter.healthPercent,
    currentStatus: targetCharacter.status ?? ""
  }, null, 2))

  const currentHealth = targetCharacter.healthPercent ?? 100
  const currentStatus = targetCharacter.status ?? ""
  const newHealth = analysis.update.newHealthPercent
  const newStatus = analysis.update.newStatus

  // Log health assessment
  if (newHealth !== undefined) {
    console.log("[analyzeAndApplyDiceRoll] Health assessment:", JSON.stringify({
      currentHealth,
      newHealth,
      delta: newHealth - currentHealth,
      absoluteDelta: Math.abs(newHealth - currentHealth),
      willChange: newHealth !== currentHealth
    }, null, 2))

    // Sanity check: prevent extreme single-turn changes (more than 50%)
    if (Math.abs(newHealth - currentHealth) > 50) {
      console.warn("[analyzeAndApplyDiceRoll] Health change too extreme, capping")
      console.warn("[analyzeAndApplyDiceRoll] Original change:", JSON.stringify({ currentHealth, newHealth, delta: newHealth - currentHealth }, null, 2))
      const cappedHealth = newHealth < currentHealth ? Math.max(currentHealth - 50, 0) : Math.min(currentHealth + 50, 100)
      analysis.update.newHealthPercent = cappedHealth
      console.warn("[analyzeAndApplyDiceRoll] Capped change:", JSON.stringify({ currentHealth, cappedHealth, delta: cappedHealth - currentHealth }, null, 2))
    }
  } else {
    console.log("[analyzeAndApplyDiceRoll] No health change in this update")
  }

  // Log status assessment
  if (newStatus !== undefined) {
    console.log("[analyzeAndApplyDiceRoll] Status assessment:", JSON.stringify({
      currentStatus: currentStatus || "(none)",
      newStatus: newStatus || "(clearing)",
      willChange: newStatus !== currentStatus
    }, null, 2))
  } else {
    console.log("[analyzeAndApplyDiceRoll] No status change in this update")
  }

  console.log("[analyzeAndApplyDiceRoll] Damage/healing description:", analysis.update.damageOrHealingDescription)

  // Apply the update (we know analysis.update is not null here due to check above)
  const update = analysis.update
  const updatedCharacters = turn.characters.map((c) => {
    if (c.id !== update.characterId) {
      return c
    }

    const updates: { healthPercent?: number; status?: string | undefined } = {}
    
    if (update.newHealthPercent !== undefined) {
      updates.healthPercent = update.newHealthPercent
      console.log(`[analyzeAndApplyDiceRoll] Applying health change to ${c.name}: ${currentHealth}% -> ${update.newHealthPercent}%`)
    }
    
    if (update.newStatus !== undefined) {
      updates.status = update.newStatus === "" ? undefined : update.newStatus
      console.log(`[analyzeAndApplyDiceRoll] Applying status change to ${c.name}: "${currentStatus || "(none)"}" -> "${update.newStatus || "(clearing)"}"`)
    }

    return {
      ...c,
      ...updates,
    }
  })

  const updatedTurn = {
    ...turn,
    characters: updatedCharacters,
  }

  console.log("[analyzeAndApplyDiceRoll] Turn updated successfully")
  console.log("[analyzeAndApplyDiceRoll] Updated characters:", JSON.stringify(updatedCharacters.map(c => ({ 
    id: c.id, 
    name: c.name, 
    healthPercent: c.healthPercent,
    status: c.status ?? ""
  })), null, 2))

  return updatedTurn
}
