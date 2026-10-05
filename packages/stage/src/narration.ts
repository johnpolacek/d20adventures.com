import type { StagingShot } from "./spec/staging"

// Which view fits each paragraph of a turn's narration, so the camera follows the story as the player reads on.
//
// A paragraph is about whoever it refers to most: each name counts twice (once as a possessive: "Lyra's escorts" are
// not Lyra), and each pronoun counts once for the character it points back to (the nearest one of that gender named
// before it in the paragraph, else the one the previous paragraph was about). "For her part, she had studied…" after a
// paragraph about Lyra is about Lyra. A staging's entrance cue ("the cabin door opened") names whoever enters there, so
// "A figure emerges… He is tall" is about them.
//   - One character clearly leads (twice the references of the next): their own shot, or a shot on them.
//   - Several share it: the staging's group shot that frames most of them.
//   - Nobody: the set or staging shot whose label best matches the paragraph's words, through a small thesaurus
//     (a paragraph about the "riverboat" finds "The tug").
//   - Nothing matches: the staging's opening shot for the first paragraph, otherwise stay put (null).

export interface NarrationStage {
  cast: { id: string; name: string }[]
  set: { shots: Record<string, { label?: string }> }
  staging: { shot?: string; shots: Record<string, StagingShot>; entrances?: { cast: string; when: string }[] } | null
}
export type NarrationShot = string | { subject: string }
type Gender = "f" | "m"
// What the reader knows of each cast member: gender for pronouns, and words they go by unnamed ("the elf", "the
// soldier"): race, class and the like.
export type NarrationPeople = Record<string, { gender?: Gender; words?: string[] } | undefined>
export interface NarrationLine {
  id: string
  text: string
}
export interface NarrationBeat {
  view: NarrationShot | null
  // Who speaks in the paragraph, in order, each with their quoted words.
  speech: NarrationLine[]
}

const TITLES = /^(madam|master|mistress|sergeant|sir|lady|lord|captain|brother|sister|father|mother)$/
// A first word that describes rather than names ("Elven Archer"): such a character is only known by the full name.
const DESCRIPTORS = /^(elven|elvish|dwarven|human|halfling|gnomish|orcish|old|young|tall|hooded|the|a|an)$/
const PRONOUNS: Record<Gender, RegExp> = { f: /\b(she|her|hers|herself)\b/gi, m: /\b(he|him|his|himself)\b/gi }
// Someone the paragraph brings in without a name ("A figure emerges… He is tall"): later pronouns are theirs, not the
// previous paragraph's character's, unless the words fit that character ("the lead elf" after a paragraph about Aelar).
const STRANGER =
  /\b(a|an|the|another|one)\s+(\w+\s+)?(figure|man|woman|elf|dwarf|halfling|gnome|orc|stranger|guard|soldier|person|someone|creature|beast|boy|girl|rider|sailor|smuggler|captain|leader)\b/gi
// Words that mean the same place or thing in a shot label and in narration.
const THESAURUS: string[][] = [
  ["boat", "riverboat", "tug", "vessel", "deck", "saloon", "stern", "bow", "barge"],
  ["river", "water", "mordava", "current", "fork", "stream"],
  ["pier", "gangway", "dock", "jetty", "landing", "planks"],
  ["reeds", "rushes", "hiding", "hides", "hidden", "crouch", "crouches"],
  ["woods", "wood", "trees", "forest", "trail", "path", "undergrowth"],
  ["bank", "shore", "riverbank", "hill", "hillside", "slope"],
  ["crate", "chest", "box", "cargo", "shipment", "lid"],
  ["door", "doorway", "threshold", "entrance"],
  ["helm", "wheel", "pilothouse"],
  ["cabin", "room", "hold", "inside", "interior"],
  ["city", "kordavos", "towers", "castle", "rooftops"],
  ["quay", "harbour", "harbor", "docks", "wharf", "waterfront"],
  ["ships", "ship", "sails", "masts"],
  ["gate", "gates", "gatehouse", "checkpoint"],
  ["line", "queue", "crowd", "travellers", "travelers"],
  ["ramparts", "walls", "battlements", "guards"],
  ["stones", "circle", "standing", "monoliths"],
  ["camp", "fire", "campfire", "embers"],
  ["square", "market", "stalls", "festival"],
]
const STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "at", "up", "close", "view", "shot"])
const words = (text: string) => (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w))
const expand = (w: string) => THESAURUS.find((group) => group.includes(w)) ?? [w]

// The names a cast member goes by in narration: their full name and first name, skipping a title.
const callNames = (name: string) => {
  const parts = name.split(/\s+/)
  const first = parts.find((w) => !TITLES.test(w.toLowerCase()))
  if (first && DESCRIPTORS.test(first.toLowerCase())) return [name.toLowerCase()]
  return [...new Set([name, first].filter((n): n is string => Boolean(n)))].map((n) => n.toLowerCase())
}
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// Speech tags round a quote: "…," Silas replies / "…" asked the elf / Aelar says, "…".
const VERBS =
  "says|said|replies|replied|asks|asked|answers|answered|whispers|whispered|calls|called|growls|growled|mutters|muttered|snaps|snapped|adds|added|continues|continued|shouts|shouted|hisses|hissed|murmurs|murmured|barks|barked|insists|insisted|declares|declared|offers|offered|warns|warned|tells|told|interjects|interjected|laughs|laughed|sneers|sneered|demands|demanded"
const WORDS = "[\\w’']+(?:\\s+[\\w’']+){0,2}"
const QUOTE = /[“"]([^”"]{1,400})[”"]/g
const AFTER = new RegExp(`^[\\s,.!?…—-]*(?:(${WORDS})\\s+(?:${VERBS})\\b|(?:${VERBS})\\s+(${WORDS}))`, "i")
const BEFORE = new RegExp(`(${WORDS})\\s+(?:${VERBS})\\b[^“"]{0,40}$`, "i")
const LOOSE = new Set(["the", "a", "an", "lead", "old", "young", "tall", "other", "first", "second", "one", "of", "his", "her"])
const positions = (text: string, re: RegExp) => [...text.matchAll(new RegExp(re.source, "gi"))].map((m) => m.index ?? 0)

// Views for a turn's paragraphs, in order. `genders` maps cast ids to "f" or "m" so pronouns find their character.
export function narrationShots(paragraphs: string[], stage: NarrationStage, genders: Record<string, Gender | undefined> = {}): (NarrationShot | null)[] {
  return readNarration(paragraphs, stage, Object.fromEntries(Object.entries(genders).map(([id, gender]) => [id, { gender }]))).map((b) => b.view)
}

// A turn's paragraphs read in order: the view for each, and who speaks in it.
export function readNarration(paragraphs: string[], stage: NarrationStage, people: NarrationPeople = {}): NarrationBeat[] {
  const genders = Object.fromEntries(Object.entries(people).map(([id, p]) => [id, p?.gender]))
  const staged = Object.entries(stage.staging?.shots ?? {})
  let previous: Partial<Record<Gender, string>> = {}
  return paragraphs.map((text, index) => {
    const beat = (view: NarrationShot | null): NarrationBeat => ({ view, speech })
    const lower = text.toLowerCase()
    // Every name mention, in order. A full name and its first name at the same spot count once.
    const mentions: { id: string; at: number; weight: number }[] = []
    for (const c of stage.cast) {
      const spots = new Map<number, number>()
      for (const n of callNames(c.name))
        for (const at of positions(lower, new RegExp(`\\b${literal(n)}\\b`))) spots.set(at, Math.min(spots.get(at) ?? 2, /^['’]s\b/.test(lower.slice(at + n.length)) ? 1 : 2))
      const sorted = [...spots].sort((a, b) => a[0] - b[0]).filter(([at], i, all) => i === 0 || at - all[i - 1][0] > 2)
      for (const [at, weight] of sorted) mentions.push({ id: c.id, at, weight })
    }
    for (const e of stage.staging?.entrances ?? []) {
      const at = lower.indexOf(e.when.toLowerCase())
      if (at >= 0 && stage.cast.some((c) => c.id === e.cast)) mentions.push({ id: e.cast, at, weight: 2 })
    }
    mentions.sort((a, b) => a.at - b.at)
    const refs = new Map<string, number>()
    const add = (id: string, n: number) => refs.set(id, (refs.get(id) ?? 0) + n)
    for (const m of mentions) add(m.id, m.weight)
    const strangers = [...lower.matchAll(new RegExp(STRANGER.source, "gi"))].map((m) => ({ at: m.index ?? 0, noun: m[3] }))
    const fits = (id: string, noun: string) => Boolean(people[id]?.words?.includes(noun))
    for (const g of ["f", "m"] as Gender[])
      for (const at of positions(lower, PRONOUNS[g])) {
        const before = mentions.filter((m) => m.at < at && genders[m.id] === g)
        const named = mentions.filter((m) => genders[m.id] === g)
        const was = previous[g]
        const carried = was && !strangers.some((s) => s.at < at && !fits(was, s.noun)) ? was : undefined
        const who = before.length ? before[before.length - 1].id : named.length ? named[0].id : carried
        if (who) add(who, 1)
      }
    const ranked = [...refs].sort((a, b) => b[1] - a[1] || (mentions.find((m) => m.id === a[0])?.at ?? 1e9) - (mentions.find((m) => m.id === b[0])?.at ?? 1e9))
    // Who says each quote: the speech tag beside it ("Silas replies", "asked the elf", "she said"), else the cast member
    // named nearest to it. Several quotes from one speaker run together.
    const spoken = new Map<string, string[]>()
    for (const q of text.matchAll(QUOTE)) {
      const start = q.index ?? 0
      const end = start + q[0].length
      const tag = text.slice(end, end + 80).match(AFTER) ?? text.slice(Math.max(0, start - 80), start).match(BEFORE)
      const phrase = (tag?.[1] ?? tag?.[2] ?? "").toLowerCase()
      let who: string | undefined
      if (phrase) {
        who = stage.cast.find((c) => callNames(c.name).some((n) => new RegExp(`\\b${literal(n)}\\b`).test(phrase)))?.id
        const pronoun = phrase.split(/\s+/)[0]
        const g: Gender | undefined = /^(she|her)$/.test(pronoun) ? "f" : /^(he|him)$/.test(pronoun) ? "m" : undefined
        if (!who && g) {
          const before = mentions.filter((m) => m.at < start && genders[m.id] === g)
          who = before.length ? before[before.length - 1].id : previous[g]
        }
        if (!who) {
          const asked = phrase.split(/\s+/).filter((w) => !LOOSE.has(w))
          const fits = stage.cast.filter((c) => asked.some((w) => people[c.id]?.words?.includes(w) || callNames(c.name).includes(w)))
          who = fits.find((c) => mentions.some((m) => m.id === c.id))?.id ?? fits[0]?.id
        }
      }
      if (!who && mentions.length) who = [...mentions].sort((a, b) => Math.abs(a.at - start) - Math.abs(b.at - start))[0].id
      if (who) spoken.set(who, [...(spoken.get(who) ?? []), q[1].trim()])
    }
    // A quote cut before its speech tag ends on a comma ("I have it here,” Silas says): it reads as a full stop.
    const speech = [...spoken].map(([id, lines]) => ({ id, text: lines.map((l) => l.replace(/,$/, ".")).join(" ") }))
    previous = {}
    for (const [id] of ranked) {
      const g = genders[id]
      if (g && !previous[g]) previous[g] = id
    }
    if (ranked.length) {
      const [top, second] = ranked
      const single = (id: string): NarrationShot => staged.find(([, s]) => "subject" in s && s.subject === id)?.[0] ?? { subject: id }
      if (!second || top[1] >= 2 * second[1]) return beat(single(top[0]))
      const together = new Set(ranked.filter(([, n]) => n * 2 >= top[1]).map(([id]) => id))
      let best: { key: string; score: number } | null = null
      for (const [key, s] of staged) {
        if (!("subjects" in s)) continue
        const hits = s.subjects.filter((id) => together.has(id)).length
        const score = hits - 0.25 * (s.subjects.length - hits)
        if (hits >= 2 && (!best || score > best.score)) best = { key, score }
      }
      return beat(best ? best.key : single(top[0]))
    }
    const said = new Set(words(text))
    const label = (key: string, l?: string) => [...words(key.replace(/[-_]/g, " ")), ...words(l ?? "")]
    const candidates = [
      ...Object.entries(stage.set.shots).map(([key, s]) => ({ key, words: label(key, s.label) })),
      ...staged.filter(([, s]) => !("subject" in s) && !("subjects" in s)).map(([key, s]) => ({ key, words: label(key, (s as { label?: string }).label) })),
    ]
    let place: { key: string; score: number } | null = null
    for (const c of candidates) {
      const hits = new Set(c.words.flatMap(expand).filter((w) => said.has(w)))
      if (hits.size && (!place || hits.size > place.score)) place = { key: c.key, score: hits.size }
    }
    if (place) return beat(place.key)
    return beat(index === 0 ? (stage.staging?.shot ?? null) : null)
  })
}
