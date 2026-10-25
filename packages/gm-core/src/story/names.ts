import type { StoryBeat } from "./beats"
import { isName, type KnownFact, mergeKnowledge, nameId } from "./knowledge"
import { privateTo } from "./render"

// Who has heard each hero's name, in an adventure whose heroes start as strangers (`strangers: true` on its page).
// A name is heard when a spoken line says it: a public line by everyone present, a private one by those in it. The
// round's GM may record a name heard another way. Earlier rounds' names are kept in the ledger, as facts with the id
// `name-<hero id>`. Heroes who come on together from the adventure just finished know each other's from the start.
//
// Narration names anyone, as the storyteller's view. In speech, no one says a name they have not heard.
type Who = { id: string; name: string; type?: string }
export type NamesHeard = (listener: string, hero: string) => boolean

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// A hero's name as it may be said: the whole of it, or its first word.
const sayings = (name: string) => [...new Set([name.trim(), name.trim().split(/\s+/)[0]])].filter((n) => n.length > 2)
const says = (text: string, name: string) => sayings(name).some((n) => new RegExp(`(?<!\\p{L})${literal(n)}(?!\\p{L})`, "u").test(text))

// The heroes' names a story's spoken lines said, as facts known to those who heard them.
export function heardNames(story: readonly StoryBeat[] | undefined, characters: readonly Who[]): KnownFact[] {
  const heroes = characters.filter((c) => c.type === "pc")
  const present = characters.map((c) => c.id)
  const facts = new Map<string, KnownFact>()
  for (const beat of story ?? []) {
    if (beat.kind !== "line") continue
    const hearers = privateTo(beat) ?? present
    for (const hero of heroes.filter((h) => says(beat.text, h.name))) {
      const fact = facts.get(hero.id) ?? { id: nameId(hero.id), text: `${hero.name}'s name`, knownBy: [] }
      fact.knownBy = [...new Set([...fact.knownBy, ...hearers.filter((id) => id !== hero.id)])]
      facts.set(hero.id, fact)
    }
  }
  return [...facts.values()].filter((f) => f.knownBy.length)
}

// Heroes who played an earlier adventure together, each group knowing its own names.
export function namesMetBefore(together: readonly (readonly string[])[], party: readonly Who[]): KnownFact[] {
  return party.flatMap((hero) => {
    const knownBy = [...new Set(together.filter((ids) => ids.includes(hero.id)).flat())].filter((id) => id !== hero.id && party.some((p) => p.id === id))
    return knownBy.length ? [{ id: nameId(hero.id), text: `${hero.name}'s name`, knownBy }] : []
  })
}

// Who has heard a hero's name: as the ledger keeps it, or in a line of the round so far. A hero knows their own.
export function namesHeard(known: readonly KnownFact[] | undefined, turn: { story?: readonly StoryBeat[]; characters: readonly Who[] }): NamesHeard {
  const names = mergeKnowledge((known ?? []).filter(isName), heardNames(turn.story, turn.characters))
  return (listener, hero) => listener === hero || names.some((f) => f.id === nameId(hero) && f.knownBy.includes(listener))
}

// The heroes present whose names one character has not heard.
export const unheardBy = (heard: NamesHeard | undefined, listener: string, characters: readonly Who[]): Who[] =>
  heard ? characters.filter((c) => c.type === "pc" && c.id !== listener && !heard(listener, c.id)) : []

// For a prompt that plays one character: the names they must not say. Nothing when they have heard every one.
export function unheardNote(heard: NamesHeard | undefined, who: Who, characters: readonly Who[]): string {
  const unheard = unheardBy(heard, who.id, characters)
  return unheard.length
    ? `NAMES ${who.name.toUpperCase()} HAS NOT HEARD: ${unheard.map((c) => c.name).join(", ")}. To ${who.name} these are strangers, known only by how they look and what they have said and done. ${who.name} does not say these names until the story shows them said where ${who.name} could hear, and may ask them.`
    : ""
}

// For the GM's prompts: each hero present whose name someone here has not heard, with who. Nothing when all have.
export function namesNote(heard: NamesHeard | undefined, characters: readonly Who[]): string {
  const lines = characters
    .filter((c) => c.type === "pc")
    .flatMap((hero) => {
      const not = characters.filter((c) => c.id !== hero.id && !heard?.(c.id, hero.id))
      return heard && not.length ? [`- ${hero.name}: not heard by ${not.map((c) => c.name).join(", ")}`] : []
    })
  return lines.length
    ? `NAMES NOT YET HEARD. The heroes began this adventure as strangers. In speech, no one says a hero's name before hearing it, and the GM's characters ask or go without. Narration may name anyone. A name is heard once someone says it aloud where the listener can hear:\n${lines.join("\n")}`
    : ""
}
