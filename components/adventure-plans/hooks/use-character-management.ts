import type { Character, NPC, PCTemplate } from "@/types/character"

export function useCharacterManagement(
  type: "npcs" | "premadePlayerCharacters",
  characters: Record<string, Character> | PCTemplate[],
  onCharactersChange: (characters: Record<string, Character> | PCTemplate[]) => void
) {
  const isNpcs = type === "npcs"

  const addNewCharacter = () => {
    const newId = isNpcs ? `${type}-${Date.now()}` : Date.now().toString()

    if (isNpcs) {
      const newNpc: NPC = {
        id: newId,
        type: "npc",
        name: "",
        image: "",
        archetype: "",
        race: "",
        appearance: "",
        healthPercent: 100,
        equipment: [],
        skills: [],
      }
      const npcsRecord = characters as Record<string, Character>
      onCharactersChange({
        ...npcsRecord,
        [newId]: newNpc,
      })
    } else {
      const newPc: PCTemplate = {
        id: newId,
        type: "pc",
        name: "",
        image: "",
        archetype: "",
        race: "",
        appearance: "",
        healthPercent: 100,
        equipment: [],
        skills: [],
        attributes: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
      }
      const pcArray = characters as PCTemplate[]
      onCharactersChange([...pcArray, newPc])
    }
  }

  const updateCharacter = (charId: string, updates: Partial<Character | PCTemplate>) => {
    if (isNpcs) {
      const npcsRecord = characters as Record<string, Character>
      const updatedNpcs = {
        ...npcsRecord,
        [charId]: {
          ...npcsRecord[charId],
          ...updates,
        } as Character,
      }
      onCharactersChange(updatedNpcs)
    } else {
      const pcArray = characters as PCTemplate[]
      const index = parseInt(charId)
      const updatedPcs = pcArray.map((char, i) => (i === index ? ({ ...char, ...updates } as PCTemplate) : char))
      onCharactersChange(updatedPcs)
    }
  }

  const removeCharacter = (charId: string) => {
    if (isNpcs) {
      const npcsRecord = characters as Record<string, Character>
      const updatedNpcs = { ...npcsRecord }
      delete updatedNpcs[charId]
      onCharactersChange(updatedNpcs)
    } else {
      const pcArray = characters as PCTemplate[]
      const index = parseInt(charId)
      const updatedPcs = pcArray.filter((_, i) => i !== index)
      onCharactersChange(updatedPcs)
    }
  }

  const getCharacter = (charId: string): Character | PCTemplate => {
    return isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
  }

  // Get the characters array for rendering - convert objects to array format for consistency
  const charactersArray: [string, Character | PCTemplate][] = isNpcs
    ? Object.entries(characters as Record<string, Character>)
    : (characters as PCTemplate[]).map((char, index) => [index.toString(), char])

  return {
    isNpcs,
    charactersArray,
    addNewCharacter,
    updateCharacter,
    removeCharacter,
    getCharacter,
  }
} 