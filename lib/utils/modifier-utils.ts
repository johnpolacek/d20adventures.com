import type { Attributes } from "@/types/character"

/**
 * Calculate D&D-style ability modifier from ability score
 * 10-11 = +0, 12-13 = +1, 8-9 = -1, etc.
 */
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Map roll types to their primary attribute
 */
export function getPrimaryAttributeForRoll(rollType: string): keyof Attributes | null {
  const rollTypeLower = rollType.toLowerCase()
  
  // Strength-based
  if (rollTypeLower.includes('athletics') || rollTypeLower.includes('strength')) {
    return 'strength'
  }
  
  // Dexterity-based  
  if (rollTypeLower.includes('stealth') || 
      rollTypeLower.includes('acrobatics') || 
      rollTypeLower.includes('sleight of hand') ||
      rollTypeLower.includes('dexterity')) {
    return 'dexterity'
  }
  
  // Constitution-based
  if (rollTypeLower.includes('constitution') || 
      rollTypeLower.includes('endurance')) {
    return 'constitution'
  }
  
  // Intelligence-based
  if (rollTypeLower.includes('investigation') ||
      rollTypeLower.includes('arcana') ||
      rollTypeLower.includes('history') ||
      rollTypeLower.includes('nature') ||
      rollTypeLower.includes('religion') ||
      rollTypeLower.includes('intelligence')) {
    return 'intelligence'
  }
  
  // Wisdom-based
  if (rollTypeLower.includes('perception') ||
      rollTypeLower.includes('insight') ||
      rollTypeLower.includes('medicine') ||
      rollTypeLower.includes('survival') ||
      rollTypeLower.includes('animal handling') ||
      rollTypeLower.includes('wisdom')) {
    return 'wisdom'
  }
  
  // Charisma-based
  if (rollTypeLower.includes('persuasion') ||
      rollTypeLower.includes('deception') ||
      rollTypeLower.includes('intimidation') ||
      rollTypeLower.includes('performance') ||
      rollTypeLower.includes('charisma')) {
    return 'charisma'
  }
  
  return null
}

/**
 * Calculate base mechanical modifier from character attributes for a given roll type
 */
export function calculateAttributeModifier(character: unknown, rollType: string): number {
  // Type guard to check if character has attributes
  if (!character || 
      typeof character !== 'object' || 
      !('attributes' in character) || 
      !character.attributes ||
      typeof character.attributes !== 'object') {
    return 0
  }
  
  const primaryAttribute = getPrimaryAttributeForRoll(rollType)
  if (!primaryAttribute) {
    return 0
  }
  
  const attributes = character.attributes as Record<string, unknown>
  const attributeScore = attributes[primaryAttribute]
  
  if (typeof attributeScore !== 'number') {
    return 0
  }
  
  return getAbilityModifier(attributeScore)
} 