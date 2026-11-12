import { type AbilityId, abilityIds, type SkillId, skillIds } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { backgroundById } from "@d20/srd/backgrounds"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { featById } from "@d20/srd/feats"
import { skillById } from "@d20/srd/skills"
import { speciesById } from "@d20/srd/species"
import { deriveSheet } from "./derive"
import { type HitPoints, hitPointsAt } from "./hit-points"
import type { Sheet } from "./sheet"

/** A feature as the sheet lists it. `uses` is how many times it can be used, and the rest that restores them. */
export type SheetFeature = { name: string; from: string; uses?: { count: number; recharge: string } }

/** A sheet ready to show: every name spelled out and every number worked out. It holds plain values only. */
export type SheetView = {
  className: string
  level: number
  speciesName: string
  backgroundName: string
  proficiencyBonus: number
  hitPoints: HitPoints
  armorClass: number
  armorClassFrom: string
  initiative: number
  speed: number
  passivePerception: number
  abilities: { id: AbilityId; name: string; score: number; modifier: number; save: number; saveProficient: boolean }[]
  skills: { id: SkillId; name: string; ability: AbilityId; bonus: number; proficient: boolean; expertise: boolean }[]
  senses: { name: string; range: number }[]
  resistances: string[]
  features: SheetFeature[]
}

const RECHARGE: Record<string, string> = {
  "short-rest": "Short Rest",
  "short-or-long-rest": "Short or Long Rest",
  "long-rest": "Long Rest",
  dawn: "Dawn",
  "start-of-next-turn": "Turn",
  "initiative-or-short-or-long-rest": "Initiative or Rest",
}
const titled = (id: string) => id.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase())

type Count = number | "proficiency-bonus" | { ability: AbilityId; minimum: 1 } | { column: string } | { byLevel: { level: number; count: number }[] }

/** The sheet as a screen shows it. Throws when the class, species or background is unknown, as `deriveSheet` does. */
export function sheetView(sheet: Sheet, healthPercent?: number): SheetView {
  const derived = deriveSheet(sheet)
  const cls = classById.get(sheet.class)
  const species = speciesById.get(sheet.species)
  const background = backgroundById.get(sheet.background)
  if (!cls || !species || !background) throw new Error("The sheet names a class, species or background the SRD data lacks")
  const row = cls.levels[sheet.level - 1] as unknown as Record<string, unknown>

  const countOf = (count: Count): number | undefined => {
    if (typeof count === "number") return count
    if (count === "proficiency-bonus") return derived.proficiencyBonus
    if ("ability" in count) return Math.max(count.minimum, derived.abilityModifiers[count.ability])
    if ("column" in count) return typeof row[count.column] === "number" ? (row[count.column] as number) : undefined
    return count.byLevel.filter((step) => step.level <= sheet.level).at(-1)?.count
  }
  const usesOf = (uses: { count: Count; recharge: string; rechargeByLevel?: { level: number; recharge: string }[] } | undefined) => {
    if (!uses) return undefined
    const count = countOf(uses.count)
    const recharge = uses.rechargeByLevel?.filter((step) => step.level <= sheet.level).at(-1)?.recharge ?? uses.recharge
    return count === undefined ? undefined : { count, recharge: RECHARGE[recharge] ?? titled(recharge) }
  }

  const features: SheetFeature[] = []
  for (const id of derived.classFeatures) {
    const feature = classFeatureById.get(id)
    if (!feature) continue
    const chosen = sheet.featureChoices?.[id]
    const choice = chosen ? (feature.options?.find((option) => option.id === chosen)?.name ?? featById.get(chosen)?.name) : undefined
    features.push({ name: choice ? `${feature.name}: ${choice}` : feature.name, from: cls.name, uses: usesOf(feature.uses as Parameters<typeof usesOf>[0]) })
  }
  for (const trait of species.traits) {
    if ((trait.level ?? 1) > sheet.level) continue
    const taken = trait.choice ? sheet.speciesChoices?.[trait.choice.id] : undefined
    const choice = trait.choice?.options.find((option) => option.id === taken)?.name
    features.push({ name: choice ? `${trait.name}: ${choice}` : trait.name, from: species.name, uses: usesOf(trait.uses as Parameters<typeof usesOf>[0]) })
  }
  derived.feats.forEach((id, index) => {
    const feat = featById.get(id)
    // A feat a class feature grants is already listed with that feature.
    if (feat && feat.category === "origin") features.push({ name: feat.name, from: index === 0 ? background.name : "Feat" })
  })

  return {
    className: cls.name,
    level: sheet.level,
    speciesName: species.name,
    backgroundName: background.name,
    proficiencyBonus: derived.proficiencyBonus,
    hitPoints: hitPointsAt(derived.hitPointMaximum, healthPercent),
    armorClass: derived.armorClass,
    armorClassFrom: derived.armorClassFrom,
    initiative: derived.initiative,
    speed: derived.speed,
    passivePerception: derived.passivePerception,
    abilities: abilityIds.map((id) => ({
      id,
      name: abilityById.get(id)?.name ?? titled(id),
      score: sheet.abilityScores[id],
      modifier: derived.abilityModifiers[id],
      save: derived.savingThrows[id].bonus,
      saveProficient: derived.savingThrows[id].proficient,
    })),
    skills: skillIds.map((id) => ({ id, name: skillById.get(id)?.name ?? titled(id), ability: skillById.get(id)?.ability as AbilityId, ...derived.skills[id] })),
    senses: derived.senses.map((sense) => ({ name: titled(sense.type), range: sense.range })),
    resistances: derived.resistances.map(titled),
    features,
  }
}
