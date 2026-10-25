import { z } from "zod"
import type { StoryBeat } from "./beats"
import { findCharacter, type StoryScene } from "./clean"
import { nameOf, privateTo, type StoryNames, scriptLine } from "./render"

// What each character knows beyond the round in front of them: facts, each with everyone who knows it, by character
// id. A prompt that plays one character reads only that character's. The GM's prompts read them all.
//
// Both sources come at the end of a round. Each run of private beats is a fact for those in it, and the round's GM
// records what characters learned. Facts merge by id, and the knowers of one only grow.
export type KnownFact = { id: string; text: string; knownBy: string[] }

const id = z.string().min(1).max(80)
// The stored shape, for stores that check what they keep.
export const knownFactSchema = z.object({ id, text: z.string().min(1).max(2000), knownBy: z.array(id).max(40) })

// What the round's GM returns beside its beats.
export const learnedField = {
  knowledge: z
    .array(
      z.object({
        id: z.string().describe("a short new id in lowercase words joined by hyphens, or the id of a listed fact that more characters now know"),
        text: z.string().describe("one sentence: what they know, as they know it"),
        knownBy: z.array(z.string()).describe("the id of every character who knows it now"),
      })
    )
    .catch([])
    .describe("what characters learned this round that matters later, or an empty list"),
}
export type Learned = z.infer<typeof learnedField.knowledge>

// A hero's name, heard: a fact with this id, known to everyone who has heard it. Names are kept in the ledger beside
// the facts, never shown among them. See names.ts.
export const nameId = (hero: string) => `name-${hero}`
export const isName = (fact: { id: string }) => fact.id.startsWith("name-")

// How many facts a prompt shows, the newest: one character's, or the GM's.
const MINE = 12
const ALL = 20
// Of those, private beats kept whole fill at most this many while recorded facts wait. A round's private chatter
// ("Drink up, friend...") pushed the clues the GM recorded out of the newest twenty.
const CHATTER = 4
const isPrivateBeats = (fact: { id: string }) => /^r[^-]+-private-\d+$/.test(fact.id)
// The newest `n` facts in their order, recorded ones before private beats.
function newest<T extends { id: string }>(facts: T[], n: number): T[] {
  const privates = facts.filter(isPrivateBeats)
  const recorded = facts.filter((f) => !isPrivateBeats(f)).slice(-Math.max(n - privates.length, n - CHATTER))
  const kept = new Set([...recorded, ...privates.slice(-(n - recorded.length))])
  return facts.filter((f) => kept.has(f))
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")

// Facts merged by id. A fact learned again moves to the end, as the newest, with its latest text and every knower.
export function mergeKnowledge(known: readonly KnownFact[] = [], learned: readonly KnownFact[] = []): KnownFact[] {
  const out = known.map((f) => ({ ...f, knownBy: [...f.knownBy] }))
  for (const fact of learned) {
    const i = out.findIndex((f) => f.id === fact.id)
    const was = i < 0 ? undefined : out.splice(i, 1)[0]
    out.push({ id: fact.id, text: fact.text || was?.text || "", knownBy: [...new Set([...(was?.knownBy ?? []), ...fact.knownBy])] })
  }
  return out
}

// The facts a round's GM recorded, checked: each knower is someone in the scene, by id or name, or someone a listed
// fact names already. A fact with no text or no knowers is dropped. A name's id is made the hero's own.
export function cleanLearned(output: Learned | undefined, scene: StoryScene, known: readonly KnownFact[] = []): KnownFact[] {
  const before = new Set(known.flatMap((f) => f.knownBy))
  return (output ?? []).flatMap((f) => {
    const text = (f.text ?? "").replace(/\s+/g, " ").trim()
    const knownBy = [...new Set((f.knownBy ?? []).flatMap((k) => findCharacter(scene, k)?.id ?? (before.has(k) ? [k] : [])))]
    const named = /^name-/i.test(f.id ?? "") ? f.id.slice(5).trim() : undefined
    const hero = named ? (findCharacter(scene, named) ?? findCharacter(scene, named.replace(/-/g, " "))) : undefined
    const fid = hero ? nameId(hero.id) : slug(f.id ?? "") || slug(text)
    return text && fid && knownBy.length ? [{ id: fid, text, knownBy }] : []
  })
}

// A round's private beats as facts: one for each set of characters who shared any, in order. A whisper and its answer
// are one fact even with an open beat between them. `round` keeps the ids apart from other rounds'.
export function privateFacts(story: readonly StoryBeat[], names: StoryNames, round: number | string): KnownFact[] {
  const facts = new Map<string, KnownFact>()
  for (const beat of story) {
    const knownBy = privateTo(beat)?.filter((k, i, all) => all.indexOf(k) === i)
    if (!knownBy) continue
    const key = [...knownBy].sort().join(" ")
    const fact = facts.get(key)
    if (fact) fact.text += ` ${scriptLine(beat, names, false)}`
    else facts.set(key, { id: `r${round}-private-${facts.size + 1}`, text: scriptLine(beat, names, false), knownBy })
  }
  return [...facts.values()]
}

// One character's facts, for a prompt that plays them. Nothing when they know none.
export function knowledgeNote(known: readonly KnownFact[] | undefined, who: { id: string; name: string }): string {
  const facts = newest(
    (known ?? []).filter((f) => !isName(f) && f.knownBy.includes(who.id)),
    MINE
  )
  if (!facts.length) return ""
  return `WHAT ${who.name.toUpperCase()} KNOWS from earlier in the adventure, besides what the narrative shows. Anything else, ${who.name} knows only if the narrative or the premise shows it:
${facts.map((f) => `- ${f.text}`).join("\n")}`
}

// Every fact with who knows it, for the GM's prompts. With `ids`, each fact's id too, so the GM can spread one. A
// knower not in `names` reads as someone not here.
export function ledgerNote(known: readonly KnownFact[] | undefined, names: StoryNames, ids = false): string {
  const facts = newest(
    (known ?? []).filter((f) => !isName(f)),
    ALL
  )
  if (!facts.length) return ""
  const knowers = (f: KnownFact) => {
    const here = f.knownBy.filter((k) => names[k])
    const away = f.knownBy.length - here.length
    return [...here.map((k) => nameOf(names, k)), ...(away ? [`${away} not here`] : [])].join(", ")
  }
  return `WHO KNOWS WHAT. Facts from earlier, each with everyone who knows it. No one else knows a fact until the story shows them seeing, hearing or being told it:
${facts.map((f) => `- ${ids ? `[${f.id}] ` : ""}${f.text} Known to: ${knowers(f)}.`).join("\n")}`
}
