import type { SheetView } from "@d20/gm-core/sheet/view"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import type { CardInfo } from "@/components/stage/character-card"
import type { Standing } from "@/components/stage/standing"

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

/**
 * A character's card. `standing` is how they stand (components/stage/standing): a hero's hit points and Armor Class
 * from their sheet, an NPC's wound word. The caller works it out, since this file loads under the desktop's tests.
 */
export function characterInfo(character: TurnCharacter, portrait: string | undefined, sheet: SheetView | null, standing: Standing | undefined): CardInfo {
  const conditions = conditionLabel(character)
  return {
    id: character.id,
    name: character.name,
    role: `${character.race} ${character.archetype}`,
    portrait,
    about: character.appearance,
    ...(standing ? { standing } : {}),
    ...(conditions ? { conditions } : {}),
    details: [
      ...(sheet ? sheetDetails(sheet) : []),
      { label: "Equipment", items: character.equipment?.length ? character.equipment.map((e) => `${e.name}${e.description ? `. ${e.description}` : ""}`) : ["None"] },
      { label: "Effects", items: character.effects?.length ? character.effects.map((e) => `${e.name}, ${e.duration} ${e.duration === 1 ? "round" : "rounds"} left. ${e.description}`) : ["None"] },
      ...(character.spells?.length ? [{ label: "Spells", items: character.spells.map((s) => `${s.name}${s.description ? `. ${s.description}` : ""}`) }] : []),
    ],
  }
}
