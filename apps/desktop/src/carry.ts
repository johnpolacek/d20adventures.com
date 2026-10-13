import type { AdventureInfo } from "../runtime/game"
import type { Hero, PartyChoice } from "../runtime/heroes"

// The party a new game opens with. Starting fresh, it is the adventure's suggested party, the player on the first hero
// and the AI on the rest. Continuing from an adventure just finished, the heroes who can go on keep their seats and
// whoever played them, and the suggested party fills the places left.
export function openingParty(
  info: Pick<AdventureInfo, "party" | "premades" | "options" | "players"> | undefined,
  heroes: readonly Pick<Hero, "id" | "race" | "archetype">[],
  carried: readonly PartyChoice[] = []
): PartyChoice[] {
  if (!info) return []
  const [min, max] = info.players
  const fits = (h: Pick<Hero, "race" | "archetype">) => Boolean(info.options?.races.includes(h.race) && info.options.archetypes.includes(h.archetype))
  const seatable = new Set([...info.premades.map((p) => p.id), ...heroes.filter(fits).map((h) => h.id)])
  const kept = carried.filter((c) => seatable.has(c.id)).slice(0, max)
  if (!kept.length) return info.party.map((id, i) => ({ id, ai: i > 0 }))
  const size = Math.min(max, Math.max(min, kept.length, info.party.length))
  const fill = info.party
    .filter((id) => !kept.some((c) => c.id === id))
    .slice(0, size - kept.length)
    .map((id) => ({ id, ai: true }))
  const party = [...kept, ...fill]
  // Someone has to play: a party the AI ran alone gives its first hero to the player.
  return party.some((c) => !c.ai) ? party : party.map((c, i) => ({ ...c, ai: i > 0 }))
}

// Who played the adventure a save holds, for the next one's party.
export function partyOf(save: { adventure: { currentTurnId: string }; turns: { _id: string; characters: { id: string; type: string; controlledBy?: "ai" }[] }[] }): PartyChoice[] {
  const turn = save.turns.find((t) => t._id === save.adventure.currentTurnId) ?? save.turns.at(-1)
  return (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => ({ id: c.id, ai: c.controlledBy === "ai" }))
}
