import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { type Check, checkBonus, combineModes, resolveCheck, sheetModes } from "../check"
import { checkModesFrom } from "../conditions"
import { checkModesFromSpells, endConcentration, spellEnded } from "../spell-effects"
import type { RoundBearer, RoundContext, SpellRules } from "../spell-rules"
import { creatureTypeOf } from "./enchantments"

/**
 * Spells that take a creature out of the encounter for a while and bring it back (../../utils/turn-actors `isAway`).
 * While it is away it takes no turn, no one can target, attack or catch it in an area, and it stands in no one's way.
 * It keeps its place on the floor, and comes back to it as the spell ends: its caster's Concentration lost, its
 * duration run out, or the story gone on to another encounter. Coming back to a space someone else now holds, and the
 * nearest open space it then takes, is the game master's to tell.
 */

// Those Banishment sends home for good when it lasts its full minute: "an Aberration, a Celestial, an Elemental, a
// Fey, or a Fiend".
const HOMEBOUND = ["aberration", "celestial", "elemental", "fey", "fiend"]

// The effect of a spell that holds one away, on them.
const awayBy = (was: RoundBearer, spell: string) => was.spellEffects?.find((effect) => effect.spell === spell && effect.away)

// Whether the spell that holds one away has ended with no one to end it: its caster gone, dead, or no longer
// concentrating on it. Then it lets them go, back to the space they left, and it is told.
function letGo(round: RoundContext, was: RoundBearer, spell: Spell, by: string): boolean {
  if (round.holds(spell, by)) return false
  const now = round.find(was.id)
  if (!now) return true
  for (const entry of now.conditions ?? []) if (entry.spell === spell.id) round.conditions.push({ target: was.id, condition: entry.id, ends: true })
  round.put(spellEnded(now, (id) => id === spell.id))
  round.tell(was.id, spell.name, `${spell.name} has ended, and ${was.name} reappears in the space they left.`)
  return true
}

// One taken away by a spell's cast, in words for the game master.
const goneWords = (name: string, where: string, until: string) => `${name} vanishes to ${where}. They are out of the fight: no one can reach them, and they take no turn ${until}.`

/**
 * Banishment: "One creature that you can see within range must succeed on a Charisma saving throw or be transported to
 * a harmless demiplane for the duration. While there, the target has the Incapacitated condition. When the spell ends,
 * the target reappears in the space it left". A higher slot takes one more creature for each level, from its data. "If
 * the target is an Aberration, a Celestial, an Elemental, a Fey, or a Fiend, the target doesn't return if the spell
 * lasts for 1 minute": as the last round of the minute turns, that one leaves the fight for good (`fled`), sent to a
 * plane of its kind, which is the game master's to name.
 */
export const banishment: SpellRules = {
  spells: ["banishment"],
  held: { away: true },
  cast: (cast) => {
    for (const id of cast.targets) {
      const target = cast.find(id)
      if (!target || !awayBy(target, cast.spell.id)) continue
      // Away as long as it is Incapacitated there: the condition's count of turns is the effect's.
      const held = target.conditions?.find((entry) => entry.spell === cast.spell.id && entry.id === "incapacitated")
      const spellEffects = target.spellEffects?.map((effect) => (effect.spell === cast.spell.id && held?.turns ? { ...effect, turns: held.turns } : effect))
      cast.put({ ...target, ...(spellEffects ? { spellEffects } : {}) })
      cast.facts.push(goneWords(target.name, "a harmless demiplane, Incapacitated there", `until ${cast.caster.name}'s Banishment ends, when they reappear in the space they left`))
    }
  },
  whileAway: (round, was) => {
    const effect = awayBy(was, "banishment")
    const spell = spellById.get("banishment")
    if (!effect || !spell || letGo(round, was, spell, effect.by)) return
    // Its last round: the duration's turns end as the next round begins.
    if (effect.turns === 1 && HOMEBOUND.includes(creatureTypeOf(was))) {
      const now = round.find(was.id)
      if (!now) return
      round.put({ ...spellEnded(now, (id) => id === spell.id), fled: true })
      for (const entry of now.conditions ?? []) if (entry.spell === spell.id) round.conditions.push({ target: was.id, condition: entry.id, ends: true })
      round.tell(was.id, spell.name, `${spell.name} has lasted its full minute, and ${was.name} does not return: they are sent to a plane of their own kind, and leave the fight for good.`)
      return
    }
    round.tell(was.id, spell.name, `${was.name} is still away on ${spell.name}'s demiplane, Incapacitated, and takes no turn until it ends.`)
  },
}

// "When it does so, it makes a DC 20 Intelligence (Investigation) check": the DC, from the spell's words.
const mazeDc = (): number => Number(/DC (\d+) Intelligence \(Investigation\)/.exec(spellById.get("maze")?.description ?? "")?.[1] ?? 20)

// An ability check one makes on their own, with what their sheet, conditions and spells put on it.
function rolledCheck(round: RoundContext, who: RoundBearer, check: Check, dc: number) {
  const mode = combineModes([...sheetModes(who, check), ...checkModesFrom(who, check), ...checkModesFromSpells(who, check)].map((source) => source.mode))
  const dice = mode === "normal" ? [round.d20()] : [round.d20(), round.d20()]
  return resolveCheck({ dice, bonus: checkBonus(who, check), dc, mode })
}

/**
 * Maze: "You banish a creature that you can see within range into a labyrinthine demiplane. The target remains there
 * for the duration or until it escapes the maze. The target can take a Study action to try to escape. When it does so,
 * it makes a DC 20 Intelligence (Investigation) check. If it succeeds, it escapes, and the spell ends." There is no
 * save. The engine takes the Study action for it on each of its turns, as the round turns, since it is all it can do
 * there. "When the spell ends, the target reappears in the space it left".
 */
export const maze: SpellRules = {
  spells: ["maze"],
  held: { away: true },
  cast: (cast) => {
    for (const id of cast.targets) {
      const target = cast.find(id)
      if (target && awayBy(target, cast.spell.id))
        cast.facts.push(goneWords(target.name, "a labyrinthine demiplane", `but to search for a way out, with an Intelligence (Investigation) check against DC ${mazeDc()} on each of their turns`))
    }
  },
  whileAway: (round, was) => {
    const effect = awayBy(was, "maze")
    const spell = spellById.get("maze")
    const now = round.find(was.id)
    if (!effect || !spell || !now || letGo(round, was, spell, effect.by)) return
    const thrown = rolledCheck(round, now, { kind: "skill", skill: "investigation" }, mazeDc())
    const words = `Intelligence (Investigation) ${thrown.total} against DC ${thrown.dc}`
    if (!thrown.success) {
      round.tell(was.id, spell.name, `${was.name} searches ${spell.name} for a way out and does not find one (${words}). They are still away.`)
      return
    }
    // It escapes, and the spell ends: its caster's Concentration on it with it.
    const caster = round.find(effect.by)
    if (caster?.concentration?.spell === spell.id) round.replace(endConcentration(round.everyone(), caster.id).characters)
    else round.put(spellEnded(now, (id) => id === spell.id))
    round.tell(was.id, spell.name, `${was.name} finds the way out of ${spell.name} (${words}), and the spell ends: they reappear in the space they left.`)
  },
}
