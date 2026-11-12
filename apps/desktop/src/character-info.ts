import type { SheetView } from "@d20/gm-core/sheet/view"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import type { CardInfo } from "@/components/stage/character-card"

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

/** The card's rules sections for a hero with a sheet: what the rules work out from its class, species and scores. */
function sheetDetails(sheet: SheetView): NonNullable<CardInfo["details"]> {
  return [
    {
      label: "Sheet",
      items: [
        `Level ${sheet.level} ${sheet.speciesName} ${sheet.className}, ${sheet.backgroundName}`,
        `Armor Class ${sheet.armorClass}, Initiative ${signed(sheet.initiative)}, Speed ${sheet.speed} ft.`,
        `Passive Perception ${sheet.passivePerception}, Proficiency ${signed(sheet.proficiencyBonus)}`,
      ],
    },
    { label: "Saving Throws", items: [sheet.abilities.map((a) => `${a.name.slice(0, 3)} ${signed(a.save)}`).join(", ")] },
    {
      label: "Skill Checks",
      items: [
        sheet.skills
          .filter((s) => s.proficient)
          .map((s) => `${s.name} ${signed(s.bonus)}`)
          .join(", "),
      ],
    },
    { label: "Features", items: sheet.features.map((f) => (f.uses ? `${f.name}, ${f.uses.count} per ${f.uses.recharge}` : f.name)) },
  ]
}

export function characterInfo(character: TurnCharacter, portrait?: string, sheet?: SheetView | null): CardInfo {
  const health = sheet ? `Hit Points: ${sheet.hitPoints.current} of ${sheet.hitPoints.maximum}` : `Health: ${character.healthPercent}%`
  return {
    id: character.id,
    name: character.name,
    role: `${character.race} ${character.archetype}`,
    portrait,
    about: character.appearance,
    details: [
      { label: "Condition", items: [health, ...(character.status ? [character.status] : [])] },
      ...(sheet ? sheetDetails(sheet) : []),
      { label: "Equipment", items: character.equipment?.length ? character.equipment.map((e) => `${e.name}${e.description ? `. ${e.description}` : ""}`) : ["None"] },
      { label: "Effects", items: character.effects?.length ? character.effects.map((e) => `${e.name}, ${e.duration} ${e.duration === 1 ? "round" : "rounds"} left. ${e.description}`) : ["None"] },
      ...(character.spells?.length ? [{ label: "Spells", items: character.spells.map((s) => `${s.name}, ${s.isUsed ? "used" : "available"}${s.description ? `. ${s.description}` : ""}`) }] : []),
    ],
  }
}
