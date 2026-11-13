import { featById } from "@d20/srd/feats"
import type { ClassRules } from "../class-rules"
import { hasFeat, withUsedThisTurn } from "../feature-rules"
import { areEnemies } from "../sides"

/**
 * Boon of Combat Prowess (SRD 5.2.1 p. 88), Peerless Aim: "When you miss with an attack roll, you can hit instead. Once
 * you use this benefit, you can't use it again until the start of your next turn." The engine uses it by a plain rule,
 * on the first of the hero's own attack rolls at an enemy to miss, after a held Bardic Inspiration die and before
 * Heroic Inspiration. The hit is not a Critical Hit. Its mark lasts until the next round begins, the engine's start of
 * the hero's next turn.
 */

const BOON = "boon-of-combat-prowess"
const name = () => featById.get(BOON)?.benefits?.find((benefit) => benefit.uses)?.name ?? "Peerless Aim"

export const combatProwess: ClassRules = {
  class: BOON,
  turnEffects: [{ id: BOON, span: 1 }],
  attackRescues: [
    {
      feature: BOON,
      name: "Peerless Aim",
      rescue: ({ attacker, target, roll }) =>
        hasFeat(attacker, BOON) && areEnemies(attacker, target) && !attacker.turnEffects?.some((effect) => effect.id === BOON) ? { ...roll, hit: true, critical: false } : undefined,
      spend: (attacker, turnOf) => withUsedThisTurn(attacker, BOON, turnOf),
      words: (who, first) => `${who}'s attack misses (${first.total} against Armor Class ${first.armorClass}), and ${who} hits instead by ${name()}.`,
    },
  ],
}
