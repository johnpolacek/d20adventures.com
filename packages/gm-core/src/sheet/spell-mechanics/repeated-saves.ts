import { spellById } from "@d20/srd/spells"
import { isDown } from "../../utils/turn-actors"
import { spellEnded } from "../spell-effects"
import { type SpellRules, spellRule } from "../spell-rules"

/**
 * A save a spell's target repeats at the end of each of its turns, ending the spell on itself on a success, read from
 * the typed data of any spell: Hold Person, Blindness/Deafness, Ray of Enfeeblement, Slow, Hideous Laughter. A spell
 * whose rules say so is left out (`repeatsSave`).
 */
export const repeatedSaves: SpellRules = {
  spells: [],
  round: (round, was) => {
    const held = new Map<string, string | undefined>()
    for (const effect of was.spellEffects ?? []) held.set(effect.spell, effect.by)
    for (const entry of was.conditions ?? []) if (entry.spell) held.set(entry.spell, entry.source)
    for (const [id, by] of held) {
      const spell = spellById.get(id)
      const repeat = spell?.saves?.find((entry) => entry.when === "end-of-turn" && entry.onSuccess === "ends")
      const target = round.find(was.id)
      const caster = spell && round.holds(spell, by)
      if (!spell || !repeat || spellRule(id)?.repeatsSave === false || !target || target.dead || isDown(target) || !caster) continue
      // Made to end the conditions the spell holds them in.
      const holding = target.conditions?.filter((entry) => entry.spell === id).map((entry) => entry.id) ?? []
      const thrown = round.save(target, repeat.ability, caster, spell, holding)
      round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}${thrown.success ? `, and ${spell.name} ends on them` : ""}.`)
      if (!thrown.success) continue
      const now = round.find(was.id)
      if (!now) continue
      const ending = now.conditions?.filter((entry) => entry.spell === id).map((entry) => entry.id) ?? []
      round.put(spellEnded(now, (spellId) => spellId === id))
      for (const condition of ending) round.conditions.push({ target: was.id, condition, ends: true })
    }
  },
}

/** Fear's repeated save is made only "If the creature ends its turn in a space where it doesn't have line of sight to you": the engine does not read sight, so it is the game master's to tell. */
export const fear: SpellRules = { spells: ["fear"], repeatsSave: false }
