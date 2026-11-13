/**
 * Who is on which side. The adventure says it, never the engine or the model: an encounter marks an NPC who fights
 * beside the heroes `party` and a bystander `none`, and the mark rides on the NPC in the turn as `side`. An unmarked NPC
 * is a foe. A hero is always of the party. A bystander is in no one's fight: no one's enemy and no one's ally by rule,
 * though a hero may still attack one by name and a spell's area still takes one who stands in it.
 *
 * This file imports nothing: the browser may load it.
 */

/** The marks an encounter may give an NPC. */
export const SIDES = ["party", "none"] as const
export type Side = (typeof SIDES)[number]

/** What the side rules read of a character. A hero is "pc", an NPC "npc". */
export type Sided = { id?: string; type?: string; side?: Side }

/** Where one stands: with the party, a foe of it, or with no one. */
export const sideOf = (character: Sided): "party" | "foe" | "none" => (character.type === "npc" ? (character.side ?? "foe") : "party")

/** Whether two are enemies by rule: one with the party and one a foe of it. A bystander is no one's enemy. */
export function areEnemies(a: Sided, b: Sided): boolean {
  const one = sideOf(a)
  const other = sideOf(b)
  return one !== "none" && other !== "none" && one !== other
}

/** Whether two are on the same side, allies by rule: both with the party, or both its foes. One is on their own side. A bystander has no allies. */
export function sameSide(a: Sided, b: Sided): boolean {
  if (a === b || (a.id !== undefined && a.id === b.id)) return true
  const one = sideOf(a)
  return one !== "none" && one === sideOf(b)
}

/** An NPC's mark in a word or two, beside their name in a list of who is here: "with the party", "a bystander". None for a hero or a foe. */
export const sideWord = (character: Sided): string | undefined =>
  character.type !== "npc" ? undefined : character.side === "party" ? "with the party" : character.side === "none" ? "a bystander" : undefined

/**
 * Who is with whom, in a few words for the model, or none when no one here is marked: "Astrid Blackthorn is with the
 * party. Marta is a bystander, in no one's fight." An encounter with no mark tells nothing new.
 */
export function sidesWords(characters: readonly (Sided & { name: string })[]): string | undefined {
  const named = (side: Side) => characters.filter((character) => character.type === "npc" && character.side === side).map((character) => character.name)
  const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0])
  const party = named("party")
  const none = named("none")
  const lines = [
    party.length ? `${listed(party)} ${party.length > 1 ? "are" : "is"} with the party.` : "",
    none.length ? `${listed(none)} ${none.length > 1 ? "are bystanders" : "is a bystander"}, in no one's fight.` : "",
  ].filter(Boolean)
  return lines.length ? lines.join(" ") : undefined
}
