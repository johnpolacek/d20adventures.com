import type { TurnCharacter } from "../types/adventure"

interface Spell {
  name: string
  description?: string
  isUsed?: boolean
}

export function markSpellAsUsed(characters: TurnCharacter[], characterId: string, spellName: string): TurnCharacter[] {
  return characters.map((char) => {
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

export function resetAllSpells(characters: TurnCharacter[]): TurnCharacter[] {
  return characters.map((char) => {
    if (!char.spells || char.spells.length === 0) return char

    const resetSpells = char.spells.map((spell: Spell) => ({
      ...spell,
      isUsed: false,
    }))

    console.log(`[SpellTracking] Reset ${resetSpells.length} spells for character "${char.name}"`)
    return { ...char, spells: resetSpells }
  })
}

export function getAvailableSpells(character: TurnCharacter): Spell[] {
  if (!character.spells || character.spells.length === 0) return []
  return character.spells.filter((spell: Spell) => !spell.isUsed)
}

export function getUsedSpells(character: TurnCharacter): Spell[] {
  if (!character.spells || character.spells.length === 0) return []
  return character.spells.filter((spell: Spell) => spell.isUsed)
}

export function formatSpellsForPrompt(character: TurnCharacter): string {
  if (!character.spells || character.spells.length === 0) return "None"

  const available = getAvailableSpells(character)
  const used = getUsedSpells(character)

  const parts: string[] = []

  if (available.length > 0) {
    parts.push(`Available: ${available.map((s) => s.name).join(", ")}`)
  }

  if (used.length > 0) {
    parts.push(`Used (unavailable this encounter): ${used.map((s) => s.name).join(", ")}`)
  }

  return parts.length > 0 ? parts.join(" | ") : "None"
}
