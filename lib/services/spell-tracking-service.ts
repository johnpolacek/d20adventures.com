import type { TurnCharacter } from "@/types/adventure"

interface Spell {
  name: string
  description?: string
  isUsed?: boolean
}

/**
 * Detects if a spell was cast based on the roll type (e.g., "Fireball Check", "Detect Magic Check")
 * Returns the spell name if found, otherwise null
 */
export function detectSpellFromRollType(rollType: string): string | null {
  if (!rollType) return null
  
  // Spell rolls are formatted as "SpellName Check" (e.g., "Fireball Check", "Detect Magic Check")
  const checkMatch = rollType.match(/^(.+?)\s+Check$/i)
  if (!checkMatch) return null
  
  const potentialSpellName = checkMatch[1].trim()
  
  // Exclude common non-spell checks
  const nonSpellChecks = [
    "Attack", "Perception", "Investigation", "Insight", "Stealth",
    "Sleight of Hand", "Athletics", "Acrobatics", "Persuasion",
    "Deception", "Intimidation", "Performance", "Survival",
    "Animal Handling", "Medicine", "History", "Arcana", "Nature", "Religion"
  ]
  
  if (nonSpellChecks.some(check => check.toLowerCase() === potentialSpellName.toLowerCase())) {
    return null
  }
  
  return potentialSpellName
}

/**
 * Marks a spell as used for a specific character
 * Returns updated characters array
 */
export function markSpellAsUsed(
  characters: TurnCharacter[],
  characterId: string,
  spellName: string
): TurnCharacter[] {
  return characters.map(char => {
    if (char.id !== characterId) return char
    if (!char.spells || char.spells.length === 0) return char
    
    const updatedSpells = char.spells.map((spell: Spell) => {
      // Case-insensitive spell name matching
      if (spell.name.toLowerCase() === spellName.toLowerCase()) {
        console.log(`[SpellTracking] Marking spell "${spell.name}" as used for character "${char.name}"`)
        return { ...spell, isUsed: true }
      }
      return spell
    })
    
    return { ...char, spells: updatedSpells }
  })
}

/**
 * Resets all spells to unused for all characters (used on encounter transitions)
 * Returns updated characters array
 */
export function resetAllSpells(characters: TurnCharacter[]): TurnCharacter[] {
  return characters.map(char => {
    if (!char.spells || char.spells.length === 0) return char
    
    const resetSpells = char.spells.map((spell: Spell) => ({
      ...spell,
      isUsed: false
    }))
    
    console.log(`[SpellTracking] Reset ${resetSpells.length} spells for character "${char.name}"`)
    return { ...char, spells: resetSpells }
  })
}

/**
 * Gets available (unused) spells for a character
 */
export function getAvailableSpells(character: TurnCharacter): Spell[] {
  if (!character.spells || character.spells.length === 0) return []
  return character.spells.filter((spell: Spell) => !spell.isUsed)
}

/**
 * Gets used spells for a character
 */
export function getUsedSpells(character: TurnCharacter): Spell[] {
  if (!character.spells || character.spells.length === 0) return []
  return character.spells.filter((spell: Spell) => spell.isUsed)
}

/**
 * Formats spell list for LLM prompts, showing availability
 */
export function formatSpellsForPrompt(character: TurnCharacter): string {
  if (!character.spells || character.spells.length === 0) return "None"
  
  const available = getAvailableSpells(character)
  const used = getUsedSpells(character)
  
  const parts: string[] = []
  
  if (available.length > 0) {
    parts.push(`Available: ${available.map(s => s.name).join(", ")}`)
  }
  
  if (used.length > 0) {
    parts.push(`Used (unavailable this encounter): ${used.map(s => s.name).join(", ")}`)
  }
  
  return parts.length > 0 ? parts.join(" | ") : "None"
}

