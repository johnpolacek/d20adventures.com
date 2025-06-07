import type { Character, PCTemplate, EquipmentItem } from "@/types/character"

export function useCharacterDetails(
  charId: string,
  getCharacter: (charId: string) => Character | PCTemplate,
  updateCharacter: (charId: string, updates: Partial<Character | PCTemplate>) => void
) {
  const char = getCharacter(charId)

  // Equipment management
  const updateEquipment = (equipment: EquipmentItem[]) => {
    updateCharacter(charId, { equipment })
  }

  const addEquipmentItem = () => {
    const newEquipment = [...(char.equipment || []), { name: "", description: "" }]
    updateEquipment(newEquipment)
  }

  const removeEquipmentItem = (index: number) => {
    const newEquipment = (char.equipment || []).filter((_, i) => i !== index)
    updateEquipment(newEquipment)
  }

  const updateEquipmentItem = (index: number, updates: Partial<EquipmentItem>) => {
    const newEquipment = (char.equipment || []).map((item, i) => (i === index ? { ...item, ...updates } : item))
    updateEquipment(newEquipment)
  }

  // Skills management
  const updateSkills = (skills: string[]) => {
    updateCharacter(charId, { skills })
  }

  const addSkill = () => {
    const newSkills = [...(char.skills || []), ""]
    updateSkills(newSkills)
  }

  const removeSkill = (index: number) => {
    const newSkills = (char.skills || []).filter((_, i) => i !== index)
    updateSkills(newSkills)
  }

  const updateSkill = (index: number, skill: string) => {
    const newSkills = (char.skills || []).map((s, i) => (i === index ? skill : s))
    updateSkills(newSkills)
  }

  // Spells management
  const updateSpells = (spells: Array<{ name: string; description?: string; isUsed?: boolean }>) => {
    updateCharacter(charId, { spells })
  }

  const addSpell = () => {
    const newSpells = [...(char.spells || []), { name: "", description: "", isUsed: false }]
    updateSpells(newSpells)
  }

  const removeSpell = (index: number) => {
    const newSpells = (char.spells || []).filter((_, i) => i !== index)
    updateSpells(newSpells)
  }

  const updateSpell = (index: number, updates: { name?: string; description?: string; isUsed?: boolean }) => {
    const newSpells = (char.spells || []).map((spell, i) => (i === index ? { ...spell, ...updates } : spell))
    updateSpells(newSpells)
  }

  // Special abilities management
  const updateSpecialAbilities = (specialAbilities: string[]) => {
    updateCharacter(charId, { specialAbilities })
  }

  const addSpecialAbility = () => {
    const newSpecialAbilities = [...(char.specialAbilities || []), ""]
    updateSpecialAbilities(newSpecialAbilities)
  }

  const removeSpecialAbility = (index: number) => {
    const newSpecialAbilities = (char.specialAbilities || []).filter((_, i) => i !== index)
    updateSpecialAbilities(newSpecialAbilities)
  }

  const updateSpecialAbility = (index: number, ability: string) => {
    const newSpecialAbilities = (char.specialAbilities || []).map((a, i) => (i === index ? ability : a))
    updateSpecialAbilities(newSpecialAbilities)
  }

  // Attributes management
  const updateAttributes = (attribute: string, value: number) => {
    const newAttributes = {
      ...char.attributes,
      [attribute]: value,
    }
    updateCharacter(charId, { attributes: newAttributes })
  }

  return {
    char,
    // Equipment
    addEquipmentItem,
    removeEquipmentItem,
    updateEquipmentItem,
    // Skills
    addSkill,
    removeSkill,
    updateSkill,
    // Spells
    addSpell,
    removeSpell,
    updateSpell,
    // Special abilities
    addSpecialAbility,
    removeSpecialAbility,
    updateSpecialAbility,
    // Attributes
    updateAttributes,
  }
} 