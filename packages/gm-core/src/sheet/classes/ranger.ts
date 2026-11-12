import { defensesOf } from "../attack"
import { attackable, nearestEnemy } from "../attack-roll"
import type { ClassRules } from "../class-rules"
import { featureChoice, hasFeature, usedThisTurn } from "../feature-rules"
import { placedOf, within } from "../space"

/**
 * The Ranger's features in play. Extra Attack is read from the data by ../feature-rules, and Hunter's Mark is a spell
 * (../spell-effects).
 *
 * Hunter's Prey (Hunter, level 3), as the hero chose it. Colossus Slayer: 1d8 more on a weapon's hit on a creature
 * missing any of its hit points, once a turn. Horde Breaker: once a turn, another attack with the same weapon at a
 * creature within 5 feet of the one just attacked, within the weapon's reach or range, that the hero has not attacked
 * this turn.
 * Hunter's Lore (Hunter, level 3): a Hunter knows the defenses of the one their Hunter's Mark is on.
 */
export const ranger: ClassRules = {
  class: "ranger",
  sees: (character, other) => {
    if (!hasFeature(character, "hunter-hunters-lore") || !other.spellEffects?.some((effect) => effect.spell === "hunters-mark" && effect.by === character.id)) return undefined
    const { immunities = [], resistances = [], vulnerabilities = [] } = defensesOf({ ...other, type: other.type ?? "npc" })
    const words = [
      immunities.length ? `immune to ${immunities.join(", ")}` : "",
      resistances.length ? `resists ${resistances.join(", ")}` : "",
      vulnerabilities.length ? `vulnerable to ${vulnerabilities.join(", ")}` : "",
    ].filter(Boolean)
    return words.length ? words.join(", ") : "no immunities, resistances or vulnerabilities"
  },
  hits: [
    {
      id: "colossus-slayer",
      damage: ({ attacker, weapon, hurt, turnOf }) =>
        weapon && hurt && featureChoice(attacker, "hunter-hunters-prey") === "colossus-slayer" && !usedThisTurn(attacker, "colossus-slayer", turnOf)
          ? { name: "Colossus Slayer", damage: { dice: "1d8", type: weapon.damage.type }, once: "colossus-slayer" }
          : undefined,
    },
  ],
  turnEffects: [{ id: "colossus-slayer", span: 1 }],
  follows: [
    {
      key: "horde",
      attack: true,
      offer: (character) => character.sheet?.featureChoices?.["hunter-hunters-prey"] === "horde-breaker" && hasFeature(character, "hunter-hunters-prey"),
      // A creature beside the one just attacked, not yet attacked this turn.
      next: ({ character, made, attack, struck, present, ask, rest }) => {
        if (!attack || !("attack" in made)) return undefined
        const original = present.find((other) => other.id === made.attack.target)
        const at = original && placedOf(original)
        const beside = present.filter((other) => {
          const there = placedOf(other)
          return attackable(character, other) && !struck.includes(other.id) && (!at || (!!there && within(there, at, 5))) && ask(attack, other, {}) !== undefined
        })
        const choice = at ? nearestEnemy(character, beside) : undefined
        return choice && ask(attack, choice, rest({ struck: [...struck, choice.id] }))
      },
    },
  ],
}
