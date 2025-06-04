import type { Attributes } from "@/types/character"

/**
 * Calculate D&D-style ability modifier from ability score
 * 10-11 = +0, 12-13 = +1, 8-9 = -1, etc.
 */
export function getAbilityModifier(score: number): number {
  const modifier = Math.floor((score - 10) / 2)
  console.log(`[getAbilityModifier] Score ${score} → modifier ${modifier}`)
  return modifier
}

/**
 * Map roll types to their primary attribute
 */
export function getPrimaryAttributeForRoll(rollType: string): keyof Attributes | null {
  const rollTypeLower = rollType.toLowerCase()
  
  // Strength-based
  if (rollTypeLower.includes('athletics') || rollTypeLower.includes('strength')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → strength`)
    return 'strength'
  }
  
  // Dexterity-based  
  if (rollTypeLower.includes('stealth') || 
      rollTypeLower.includes('acrobatics') || 
      rollTypeLower.includes('sleight of hand') ||
      rollTypeLower.includes('dexterity')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → dexterity`)
    return 'dexterity'
  }
  
  // Constitution-based
  if (rollTypeLower.includes('constitution') || 
      rollTypeLower.includes('endurance')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → constitution`)
    return 'constitution'
  }
  
  // Intelligence-based
  if (rollTypeLower.includes('investigation') ||
      rollTypeLower.includes('arcana') ||
      rollTypeLower.includes('history') ||
      rollTypeLower.includes('nature') ||
      rollTypeLower.includes('religion') ||
      rollTypeLower.includes('intelligence')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → intelligence`)
    return 'intelligence'
  }
  
  // Wisdom-based
  if (rollTypeLower.includes('perception') ||
      rollTypeLower.includes('insight') ||
      rollTypeLower.includes('medicine') ||
      rollTypeLower.includes('survival') ||
      rollTypeLower.includes('animal handling') ||
      rollTypeLower.includes('wisdom')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → wisdom`)
    return 'wisdom'
  }
  
  // Charisma-based
  if (rollTypeLower.includes('persuasion') ||
      rollTypeLower.includes('deception') ||
      rollTypeLower.includes('intimidation') ||
      rollTypeLower.includes('performance') ||
      rollTypeLower.includes('charisma')) {
    console.log(`[getPrimaryAttributeForRoll] "${rollType}" → charisma`)
    return 'charisma'
  }
  
  console.log(`[getPrimaryAttributeForRoll] "${rollType}" → no matching attribute`)
  return null
}

/**
 * Calculate base mechanical modifier from character attributes for a given roll type
 */
export function calculateAttributeModifier(character: unknown, rollType: string): number {
  console.log(`[calculateAttributeModifier] Processing character for "${rollType}":`)
  console.log('[calculateAttributeModifier] Character data:', JSON.stringify(character, null, 2))
  
  // Type guard to check if character has attributes
  if (!character || 
      typeof character !== 'object' || 
      !('attributes' in character) || 
      !character.attributes ||
      typeof character.attributes !== 'object') {
    console.log('[calculateAttributeModifier] No valid attributes found, returning 0')
    return 0
  }
  
  const primaryAttribute = getPrimaryAttributeForRoll(rollType)
  if (!primaryAttribute) {
    console.log('[calculateAttributeModifier] No primary attribute mapped, returning 0')
    return 0
  }
  
  const attributes = character.attributes as Record<string, unknown>
  console.log('[calculateAttributeModifier] Character attributes:', JSON.stringify(attributes, null, 2))
  
  const attributeScore = attributes[primaryAttribute]
  console.log(`[calculateAttributeModifier] ${primaryAttribute} score:`, attributeScore)
  
  if (typeof attributeScore !== 'number') {
    console.log(`[calculateAttributeModifier] ${primaryAttribute} is not a number, returning 0`)
    return 0
  }
  
  const modifier = getAbilityModifier(attributeScore)
  console.log(`[calculateAttributeModifier] Final result: ${primaryAttribute} ${attributeScore} → modifier ${modifier}`)
  return modifier
} 