import type { AbilityId } from "@d20/srd"
import { featById } from "@d20/srd/feats"
import type { ClassRules } from "../class-rules"
import { deriveSheet } from "../derive"
import { hasFeat } from "../feature-rules"

/**
 * Boon of Irresistible Offense (SRD 5.2.1 p. 88). Overcome Defenses: the Bludgeoning, Piercing and Slashing damage the
 * hero deals always ignores Resistance, read where a hit and a spell's damage meet the target's defenses (../attack
 * `defensesAgainst`). Overwhelming Strike: a 20 on the d20 of the hero's weapon or Unarmed Strike that hits deals extra
 * damage of the attack's type equal to the score the feat raised, Strength or Dexterity, as the sheet records it. The
 * text's types are not typed in the data.
 */

const BOON = "boon-of-irresistible-offense"
const OVERCOME = ["bludgeoning", "piercing", "slashing"] as const

// The score the feat raised, by the advancement that took it: its Strength or its Dexterity.
function raisedScore(sheet: NonNullable<Parameters<typeof hasFeat>[0]["sheet"]>): number | undefined {
  const raised = sheet.advancements?.find((entry) => entry.feat === BOON)?.abilities
  const ability = Object.keys(raised ?? {})[0] as AbilityId | undefined
  return ability ? deriveSheet(sheet).abilityScores[ability] : undefined
}

export const irresistibleOffense: ClassRules = {
  class: BOON,
  ignoresResistance: (character) => (hasFeat(character, BOON) ? OVERCOME : []),
  hits: [
    {
      id: BOON,
      damage: ({ attacker, attack, roll }) => {
        if (roll.natural !== 20 || !attacker.sheet || !hasFeat(attacker, BOON)) return undefined
        const amount = raisedScore(attacker.sheet)
        const type = attack.damage[0]?.type
        const name = featById.get(BOON)?.benefits?.find((benefit) => benefit.name === "Overwhelming Strike")?.name ?? "Overwhelming Strike"
        return amount && type ? { name, damage: { amount, type } } : undefined
      },
    },
  ],
}
