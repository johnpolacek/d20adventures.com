import { spellById } from "@d20/srd/spells"
import { hasFled } from "../../utils/turn-actors"
import { damageOnSave } from "../save-rules"
import { areEnemies } from "../sides"
import { placedOf, within } from "../space"
import type { SpellRules } from "../spell-rules"
import { laterSave } from "./lasting-areas"

/**
 * The conjurings of the 2024 rules that call no creature to the encounter: their spirits are an area (../floor-areas)
 * or an aura round the caster, and touch only those the caster chooses, the caster's enemies.
 */

/**
 * Conjure Animals: "a Large pack of spectral, intangible animals in an unoccupied space you can see within range ...
 * Whenever the pack moves within 10 feet of a creature you can see and whenever a creature you can see enters a space
 * within 10 feet of the pack or ends its turn there, you can force that creature to make a Dexterity saving throw. On a
 * failed save, the creature takes 3d10 Slashing damage. A creature makes this save only once per turn." The pack is
 * put beside the one named, and within 10 feet of its Large space is within 15 feet of its centre.
 */
export const conjureAnimals: SpellRules = {
  spells: ["conjure-animals"],
  held: { byCaster: true },
  stays: {
    beside: true,
    area: () => ({ shape: "sphere", size: 15 }),
    when: ["enter", "end", "moved"],
    oncePerTurn: true,
    touches: (touch) => {
      const caster = touch.round.find(touch.area.by)
      if (caster && areEnemies(touch.creature, caster)) laterSave(touch)
    },
  },
}

/**
 * Conjure Woodland Beings: "nature spirits that flit around you in a 10-foot Emanation ... Whenever the Emanation
 * enters the space of a creature you can see and whenever a creature you can see enters the Emanation or ends its turn
 * there, you can force that creature to make a Wisdom saving throw. The creature takes 5d8 Force damage on a failed save
 * or half as much damage on a successful one. A creature makes this save only once per turn." It goes with its caster,
 * so it is read as Spirit Guardians is: as each round turns, each of the caster's enemies within 10 feet of them saves.
 */
export const conjureWoodlandBeings: SpellRules = {
  spells: ["conjure-woodland-beings"],
  held: { byCaster: true },
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "conjure-woodland-beings" && entry.by === was.id)
    const spell = spellById.get("conjure-woodland-beings")
    const caster = round.find(was.id)
    const at = caster && placedOf(caster)
    const part = spell?.damage?.[0]
    if (!effect || !spell || !part || !caster || !at || caster.concentration?.spell !== spell.id) return
    const above = Math.max(0, (effect.amount ?? spell.level) - spell.level)
    for (const other of round.everyone()) {
      const there = placedOf(other)
      if (other.id === caster.id || !areEnemies(other, caster) || other.dead || hasFled(other) || !there || !within(at, there, spell.range.area?.size ?? 10)) continue
      const thrown = round.save(other, "wis", caster, spell)
      const amount = round.hurt(other.id, `${5 + above}d8`, "force", (taken) => damageOnSave(other, { ability: "wis", success: thrown.success, half: true }, taken).amount)
      round.tell(other.id, spell.name, `${round.verdict(other, thrown, spell, caster)} and takes ${amount} force damage.${round.standing(other.id)}`)
    }
  },
}

export const conjures: SpellRules[] = [conjureAnimals, conjureWoodlandBeings]
