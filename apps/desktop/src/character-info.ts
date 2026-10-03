import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import type { CardInfo } from "@/components/stage/character-card"

export function characterInfo(character: TurnCharacter, portrait?: string): CardInfo {
  return {
    id: character.id,
    name: character.name,
    role: `${character.race} ${character.archetype}`,
    portrait,
    about: character.appearance,
    details: [
      { label: "Condition", items: [`Health: ${character.healthPercent}%`, ...(character.status ? [character.status] : [])] },
      { label: "Equipment", items: character.equipment?.length ? character.equipment.map((e) => `${e.name}${e.description ? `. ${e.description}` : ""}`) : ["None"] },
      { label: "Effects", items: character.effects?.length ? character.effects.map((e) => `${e.name}, ${e.duration} ${e.duration === 1 ? "round" : "rounds"} left. ${e.description}`) : ["None"] },
      ...(character.spells?.length ? [{ label: "Spells", items: character.spells.map((s) => `${s.name}, ${s.isUsed ? "used" : "available"}${s.description ? `. ${s.description}` : ""}`) }] : []),
    ],
  }
}
