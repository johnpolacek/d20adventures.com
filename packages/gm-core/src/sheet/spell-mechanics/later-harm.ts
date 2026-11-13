import { spellById } from "@d20/srd/spells"
import { withSpellEffect } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

/**
 * Phantasmal Killer. "On a failed save, the target takes 4d10 Psychic damage and has Disadvantage on ability checks and
 * attack rolls for the duration. On a successful save, the target takes half as much damage, and the spell ends." The
 * effect holds the slot as its `amount`, for the damage its save at the end of each turn deals again on a failure
 * (./repeated-saves).
 */
export const phantasmalKiller: SpellRules = {
  spells: ["phantasmal-killer"],
  held: {
    amount: (slot) => slot,
    attacks: "disadvantage",
    checkModes: (_, check) => (check.kind === "save" ? [] : [{ mode: "disadvantage", from: "Phantasmal Killer" }]),
  },
  // It takes one creature, so a success ends the spell and its caster's Concentration on it.
  passedSave: (cast) => {
    const caster = cast.find(cast.caster.id)
    if (caster?.concentration?.spell !== cast.spell.id) return
    const { concentration: _, ...rest } = caster
    cast.put(rest)
  },
}

/**
 * Vitriolic Sphere. "On a failed save, a creature takes 10d4 Acid damage and another 5d4 Acid damage at the end of its
 * next turn." The later burn is held on each who failed until the end of their next turn, as Acid Arrow's is.
 */
export const vitriolicSphere: SpellRules = {
  spells: ["vitriolic-sphere"],
  failedSave: (cast, target) => {
    const now = cast.find(target.id)
    if (now && !now.dead) cast.put(withSpellEffect(now, { spell: cast.spell.id, by: cast.caster.id, turns: now.isComplete ? 2 : 1 }))
  },
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "vitriolic-sphere" && entry.turns === 1)
    const target = round.find(was.id)
    const spell = spellById.get("vitriolic-sphere")
    const burn = spell?.damage?.find((entry) => entry.timing && entry.dice)
    if (!effect || !target || target.dead || !spell || !burn?.dice) return
    const amount = round.hurt(was.id, burn.dice, "acid")
    round.tell(target.id, spell.name, `Vitriolic Sphere's acid burns ${target.name} again for ${amount} acid damage.${round.standing(was.id)}`)
  },
}
