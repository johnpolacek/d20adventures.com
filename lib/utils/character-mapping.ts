import type { Adventure } from "@/types/adventure"
import type { TurnCharacter } from "@/types/adventure"
import type { PCTemplate } from "@/types/character"

export function toPCTemplate(obj: unknown): PCTemplate | null {
  if (!obj || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  if (typeof o.id !== "string" || typeof o.name !== "string") return null
  // Validate and map attributes
  let attributes = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  }
  if (typeof o.attributes === "object" && o.attributes !== null) {
    const a = o.attributes as Record<string, unknown>
    attributes = {
      strength: typeof a.strength === "number" ? a.strength : 10,
      dexterity: typeof a.dexterity === "number" ? a.dexterity : 10,
      constitution: typeof a.constitution === "number" ? a.constitution : 10,
      intelligence: typeof a.intelligence === "number" ? a.intelligence : 10,
      wisdom: typeof a.wisdom === "number" ? a.wisdom : 10,
      charisma: typeof a.charisma === "number" ? a.charisma : 10,
    }
  }
  // Validate and map effects
  let effects: { name: string; description: string; duration: number }[] = []
  if (Array.isArray(o.effects)) {
    effects = o.effects.map((e) => {
      if (typeof e === "object" && e !== null) {
        const ee = e as Record<string, unknown>
        return {
          name: typeof ee.name === "string" ? ee.name : "",
          description: typeof ee.description === "string" ? ee.description : "",
          duration: typeof ee.duration === "number" ? ee.duration : 0,
        }
      }
      return { name: "", description: "", duration: 0 }
    })
  }
  return {
    id: o.id,
    name: o.name,
    image: typeof o.image === "string" ? o.image : "",
    archetype: typeof o.archetype === "string" ? o.archetype : "",
    race: typeof o.race === "string" ? o.race : "",
    gender: typeof o.gender === "string" ? o.gender : undefined,
    appearance: typeof o.appearance === "string" ? o.appearance : "",
    personality: typeof o.personality === "string" ? o.personality : undefined,
    background: typeof o.background === "string" ? o.background : undefined,
    motivation: typeof o.motivation === "string" ? o.motivation : undefined,
    behavior: typeof o.behavior === "string" ? o.behavior : "",
    healthPercent: typeof o.healthPercent === "number" ? o.healthPercent : 100,
    equipment: Array.isArray(o.equipment) ? (o.equipment as { name: string }[]) : [],
    skills: Array.isArray(o.skills) ? (o.skills as string[]) : [],
    spells: Array.isArray(o.spells) ? (o.spells as { name: string }[]) : [],
    specialAbilities: Array.isArray(o.specialAbilities) ? (o.specialAbilities as string[]) : [],
    effects,
    type: "pc",
    attributes,
  }
}

// Convert PC to TurnCharacter format for the modal
export function convertPCToTurnCharacter(pc: Adventure["party"][0]): TurnCharacter {
  return {
    ...pc,
    type: "pc" as const,
    initiative: 0, // Default value
    hasReplied: false,
    isComplete: false,
  }
}

// Convert PCTemplate to TurnCharacter format for the modal
export function convertPCTemplateToTurnCharacter(pcTemplate: PCTemplate): TurnCharacter {
  return {
    ...pcTemplate,
    type: "pc" as const,
    userId: "", // Empty for template
    initiative: 0, // Default value
    hasReplied: false,
    isComplete: false,
  }
}
