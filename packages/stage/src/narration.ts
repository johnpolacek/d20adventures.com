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
// A tag before the quote sits in its sentence ("Aelar says, “…”") or closes the one just before ("…” Silas asks. “…”").
// The nearest one to the quote counts: in "Thalbern asks, and Wollandora answers, “…”" it is Wollandora's.
const TAG = new RegExp(`(${WORDS})\\s+(?:${VERBS})\\b`, "gi")
const REST = /^[^“".!?…]{0,40}[.!?…]?\s*$/
const tagBefore = (lead: string) => {
  let phrase: string | undefined
  for (const m of lead.matchAll(TAG)) if (REST.test(lead.slice((m.index ?? 0) + m[0].length))) phrase = m[1]
  return phrase
}
// A name inside a quote is someone spoken to or of, not the speaker, unless the speaker is naming themselves.
const SELF = /\b(i am|i['’]m|name is|call me)\s+$/i
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
  // Who the paragraph before closed on: whoever its last sentence was about, or whoever spoke the quote it ended on.
  // An NPC's turn puts each spoken line on a line of its own, so a quote after a quote is the same voice going on.
  let closing: string | undefined
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
    // Who says each quote: the speech tag beside it ("Silas replies", "asked the elf", "she said"), else whoever the
    // sentence beside it is about, else the one other person in the scene, else the cast member named nearest to it.
    // Nobody speaks a quote that names them: "Thalbern, we have a problem." is said to Thalbern. Several quotes from one
    // speaker run together.
    // Whoever a pronoun points back to: the nearest of that gender named before it, else whoever the paragraph before
    // was about, else the only one of that gender in the scene.
    const antecedent = (g: Gender, at: number) => {
      const before = mentions.filter((m) => m.at < at && genders[m.id] === g)
      if (before.length) return before[before.length - 1].id
      const present = Object.keys(people).filter((id) => genders[id] === g)
      return previous[g] ?? (present.length === 1 ? present[0] : undefined)
    }
    // Who a sentence is about: the pronoun it opens on, else the name it opens on, else the first name in it that is
    // not a possessive. "Lyra adjusts her spectacles and gives Silas a small nod." is about Lyra, "At Lyra's nod, Silas
    // steps forward." about Silas. An opening pronoun is whoever the sentence before was about, if the gender fits
    // ("Garlan raises a hand toward Milos. His voice carries." is about Garlan), else the nearest one named before it.
    // A sentence that opens on "She" is never about a man it goes on to name.
    const refers = (g: Gender, at: number): string | undefined => {
      const before = text.slice(0, at).match(/[^.!?…“”"]+[.!?…\s]*$/)
      const prior = before?.[0].trim() ? subject(before.index ?? 0, at) : undefined
      return prior && genders[prior] === g ? prior : antecedent(g, at)
    }
    const subject = (from: number, to: number): string | undefined => {
      const lead = text
        .slice(from, to)
        .match(/^\s*(she|her|he|his)\b/i)?.[1]
        .toLowerCase()
      const g: Gender | undefined = lead ? (/^(she|her)$/.test(lead) ? "f" : "m") : undefined
      const led = g && refers(g, from)
      if (led) return led
      const inside = mentions.filter((m) => m.at >= from && m.at < to && (!g || !genders[m.id] || genders[m.id] === g))
      const opens = inside[0] && !text.slice(from, inside[0].at).trim()
      return (opens ? inside[0] : (inside.find((m) => m.weight === 2) ?? inside[0]))?.id
    }
    const spoken = new Map<string, string[]>()
    let last: string | undefined
    const quotes = [...text.matchAll(QUOTE)].map((q) => ({ start: q.index ?? 0, end: (q.index ?? 0) + q[0].length, words: q[1] }))
    for (const { start, end, words: said } of quotes) {
      const inside = mentions.filter((m) => m.at >= start && m.at < end)
      const self = inside.find((m) => m.weight === 2 && SELF.test(text.slice(start, m.at)))?.id
      const named = new Set(inside.filter((m) => m.id !== self).map((m) => m.id))
      const unnamed = (id: string | undefined) => (id && !named.has(id) ? id : undefined)
      // A tag after the quote: "…," Silas replies / "…" asked the elf. After a quote that ends on a full stop, "Aelar
      // laughs." is the next sentence, not a tag. A tag before the quote, cut at its last conjunction: in "Thalbern
      // meets Wollandora's gaze and asks quietly", nobody is named as the one asking, so the sentence's subject is.
      // A tag that leads into the quote on a comma or colon ("Wollandora asks, “…”") comes before one that follows it.
      const ahead = text.slice(Math.max(0, start - 80), start)
      const before = tagBefore(ahead)
      const after = /[,:]\s*$/.test(ahead) && before !== undefined ? null : text.slice(end, end + 80).match(AFTER)
      const tagged = after && (after[2] || !/[^.]\.$/.test(said.trim())) ? after : null
      const phrase = (tagged ? (tagged[1] ?? tagged[2]) : (before?.split(/\b(?:and|but|then|yet)\b/i).pop() ?? "")).toLowerCase().trim()
      let who: string | undefined = self
      if (!who && phrase) {
        // The name beside the verb: the first after "says", the last before "says".
        const names = stage.cast
          .flatMap((c) => callNames(c.name).map((n) => ({ id: c.id, at: phrase.search(new RegExp(`\\b${literal(n)}\\b`)) })))
          .filter((n) => n.at >= 0)
          .sort((a, b) => a.at - b.at)
        who = (tagged?.[2] ? names[0] : names[names.length - 1])?.id
        const pronoun = phrase.split(/\s+/)[0]
        const g: Gender | undefined = /^(she|her)$/.test(pronoun) ? "f" : /^(he|him)$/.test(pronoun) ? "m" : undefined
        if (!who && g) who = refers(g, start)
        if (!who) {
          const asked = phrase.split(/\s+/).filter((w) => !LOOSE.has(w))
          const fits = stage.cast.filter((c) => asked.some((w) => people[c.id]?.words?.includes(w) || callNames(c.name).includes(w)))
          who = fits.find((c) => mentions.some((m) => m.id === c.id))?.id ?? fits[0]?.id
        }
      }
      // No tag: the action beside the quote names its speaker, the sentence before it first, else the one after. A
      // quote that opens its paragraph follows on from the sentence that closed the paragraph before.
      if (!who) {
        const lead = text.slice(0, start).match(/[^.!?…“”"]+[.!?…:,—\s-]*$/)
        const trail = text.slice(end).match(/^[^.!?…“”"]+/)
        who = unnamed(lead ? subject(lead.index ?? 0, start) : undefined) ?? unnamed(trail ? subject(end, end + trail[0].length) : undefined)
        if (!who && !text.slice(0, start).trim()) who = unnamed(closing)
      }
      if (!who && named.size) {
        const others = Object.keys(people).filter((id) => !named.has(id))
        if (others.length === 1) who = others[0]
      }
      if (!who) {
        const outside = mentions.filter((m) => !named.has(m.id) && !quotes.some((o) => m.at >= o.start && m.at < o.end))
        who = outside.sort((a, b) => Math.abs(a.at - start) - Math.abs(b.at - start))[0]?.id
      }
      if (who) spoken.set(who, [...(spoken.get(who) ?? []), said.trim()])
      last = who
    }
    // A quote cut before its speech tag ends on a comma ("I have it here,” Silas says): it reads as a full stop.
    const speech = [...spoken].map(([id, lines]) => ({ id, text: lines.map((l) => l.replace(/,$/, ".")).join(" ") }))
    const tail = text.match(/[^.!?…“”"]+[.!?…\s]*$/)
    closing = tail?.[0].trim() ? subject(tail.index ?? 0, text.length) : quotes.length && quotes[quotes.length - 1].end === text.trimEnd().length ? last : undefined
    // Pronouns in the next paragraph point back to whoever this one was about, else to whoever spoke in it.
    previous = {}
    for (const id of [...ranked.map(([id]) => id), ...spoken.keys()]) {
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
