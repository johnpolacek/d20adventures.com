import { spellById } from "@d20/srd/spells"
import type { Master } from "../types/character"
import { statBlockById } from "./blocks"
import { withStartingHitPoints } from "./hit-points"
import { rollInitiative } from "./initiative"
import { masterOf } from "./masters"
import { type Point, standingRoom } from "./space"
import type { Summon } from "./spell-rules"

type Joined = { id: string; name: string; type: string; initiative?: number; position?: Point; isComplete?: boolean; master?: Master }

/**
 * Everyone with the creatures a cast summons joined (../spell-rules `summons`). Each is an NPC with its stat block at
 * its full Hit Points, bound to the caster, and standing beside the caster or the one it rose from. One that shares
 * its caster's Initiative is put right after them in the list, so it takes its turn right after theirs: the order is
 * sorted by Initiative and keeps the list's order between equals. One that rolls its own Initiative is put by it. One
 * summoned after its caster has acted this round acts this round too, right after them, unless it `waits` or its own
 * Initiative is above theirs.
 */
export function withSummoned<T extends Joined>(args: {
  characters: readonly T[]
  casterId: string
  spell: string
  summons: readonly Summon[]
  d20: () => number
  solids?: Parameters<typeof standingRoom>[0]
}): { characters: T[]; facts: string[] } {
  const caster = args.characters.find((character) => character.id === args.casterId)
  if (!caster || !args.summons.length) return { characters: [...args.characters], facts: [] }
  const name = spellById.get(args.spell)?.name ?? args.spell
  let characters = [...args.characters]
  const facts: string[] = []
  // A second casting calls fresh creatures: the ids count on from those this caster already called with it.
  const called = characters.filter((character) => character.master?.summoned && character.master.id === caster.id && character.master.spell === args.spell).length
  for (const [index, summon] of args.summons.entries()) {
    const block = statBlockById(summon.statBlock)
    if (!block) continue
    const from = characters.find((character) => character.id === summon.beside)?.position ?? caster.position
    const taken = characters.flatMap((character) => (character.position ? [character.position] : []))
    const position = from ? standingRoom(args.solids ?? [], taken, from, from) : undefined
    const base = {
      id: `${caster.id}-${args.spell}-${called + index + 1}`,
      name: summon.name,
      type: "npc" as const,
      image: "",
      archetype: block.name,
      race: block.type,
      appearance: `${block.name}, called by ${caster.name}'s ${name}.`,
      statBlock: summon.statBlock,
      master: masterOf(caster, args.spell, true),
      ...(position ? { position } : {}),
    }
    const initiative = summon.initiative === "after" ? (caster.initiative ?? 0) : rollInitiative({ type: "npc", statBlock: summon.statBlock }, args.d20())
    // One on its own Initiative above its caster's has had its place this round, and acts from the next.
    const waits = !!summon.waits || (summon.initiative === "own" && initiative > (caster.initiative ?? 0))
    const joined = withStartingHitPoints({ ...base, initiative, hasReplied: waits, isComplete: waits }) as unknown as T
    // Right after the caster and any it called before, or at the end, where Initiative alone puts it.
    const at =
      summon.initiative === "after"
        ? characters.findIndex((character) => character.id === caster.id) +
          1 +
          characters.filter((character) => character.master?.id === caster.id && character.initiative === caster.initiative).length
        : characters.length
    characters = [...characters.slice(0, at), joined, ...characters.slice(at)]
    facts.push(
      `${summon.name} appears beside ${characters.find((character) => character.id === summon.beside)?.name ?? caster.name}, called by ${caster.name}'s ${name}. It is ${caster.name}'s ally and obeys them, and it ${summon.initiative === "after" ? "takes its turn right after theirs" : `acts on its own Initiative, ${initiative}`}${waits ? ", from the next round" : ""}.`
    )
  }
  return { characters, facts }
}
