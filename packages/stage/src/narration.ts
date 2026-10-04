import type { StagingShot } from "./spec/staging"

// Which view fits each paragraph of a turn's narration, so the camera follows the story as the player reads on.
//
// A paragraph is about whoever it refers to most: each name counts twice, and each pronoun counts once for the character
// it points back to (the nearest one of that gender named before it in the paragraph, else the one the previous
// paragraph was about). "For her part, she had studied…" after a paragraph about Lyra is about Lyra.
//   - One character clearly leads (twice the references of the next): their own shot, or a shot on them.
//   - Several share it: the staging's group shot that frames most of them.
//   - Nobody: the set or staging shot whose label best matches the paragraph's words, through a small thesaurus
//     (a paragraph about the "riverboat" finds "The tug").
//   - Nothing matches: the staging's opening shot for the first paragraph, otherwise stay put (null).

export interface NarrationStage {
  cast: { id: string; name: string }[]
  set: { shots: Record<string, { label?: string }> }
  staging: { shot?: string; shots: Record<string, StagingShot> } | null
}
export type NarrationShot = string | { subject: string }
type Gender = "f" | "m"

const TITLES = /^(madam|master|mistress|sergeant|sir|lady|lord|captain|brother|sister|father|mother)$/
// A first word that describes rather than names ("Elven Archer"): such a character is only known by the full name.
const DESCRIPTORS = /^(elven|elvish|dwarven|human|halfling|gnomish|orcish|old|young|tall|hooded|the|a|an)$/
const PRONOUNS: Record<Gender, RegExp> = { f: /\b(she|her|hers|herself)\b/gi, m: /\b(he|him|his|himself)\b/gi }
// Someone the paragraph brings in without a name ("A figure emerges… He is tall"): later pronouns are theirs, not the
// previous paragraph's character's.
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
const positions = (text: string, re: RegExp) => [...text.matchAll(new RegExp(re.source, "gi"))].map((m) => m.index ?? 0)

// Views for a turn's paragraphs, in order. `genders` maps cast ids to "f" or "m" so pronouns find their character.
export function narrationShots(paragraphs: string[], stage: NarrationStage, genders: Record<string, Gender | undefined> = {}): (NarrationShot | null)[] {
  const staged = Object.entries(stage.staging?.shots ?? {})
  let previous: Partial<Record<Gender, string>> = {}
  return paragraphs.map((text, index) => {
    const lower = text.toLowerCase()
    // Every name mention, in order. A full name and its first name at the same spot count once.
    const mentions: { id: string; at: number }[] = []
    for (const c of stage.cast) {
      const spots = new Set<number>()
      for (const n of callNames(c.name)) for (const at of positions(lower, new RegExp(`\\b${literal(n)}\\b`))) spots.add(at)
      const sorted = [...spots].sort((a, b) => a - b).filter((at, i, all) => i === 0 || at - all[i - 1] > 2)
      for (const at of sorted) mentions.push({ id: c.id, at })
    }
    const refs = new Map<string, number>()
    const add = (id: string, n: number) => refs.set(id, (refs.get(id) ?? 0) + n)
    for (const m of mentions) add(m.id, 2)
    const strangers = positions(lower, STRANGER)
    for (const g of ["f", "m"] as Gender[])
      for (const at of positions(lower, PRONOUNS[g])) {
        const before = mentions.filter((m) => m.at < at && genders[m.id] === g)
        const named = mentions.filter((m) => genders[m.id] === g)
        const carried = strangers.some((s) => s < at) ? undefined : previous[g]
        const who = before.length ? before[before.length - 1].id : named.length ? named[0].id : carried
        if (who) add(who, 1)
      }
    const ranked = [...refs].sort((a, b) => b[1] - a[1] || (mentions.find((m) => m.id === a[0])?.at ?? 1e9) - (mentions.find((m) => m.id === b[0])?.at ?? 1e9))
    previous = {}
    for (const [id] of ranked) {
      const g = genders[id]
      if (g && !previous[g]) previous[g] = id
    }
    if (ranked.length) {
      const [top, second] = ranked
      const single = (id: string): NarrationShot => staged.find(([, s]) => "subject" in s && s.subject === id)?.[0] ?? { subject: id }
      if (!second || top[1] >= 2 * second[1]) return single(top[0])
      const together = new Set(ranked.filter(([, n]) => n * 2 >= top[1]).map(([id]) => id))
      let best: { key: string; score: number } | null = null
      for (const [key, s] of staged) {
        if (!("subjects" in s)) continue
        const hits = s.subjects.filter((id) => together.has(id)).length
        const score = hits - 0.25 * (s.subjects.length - hits)
        if (hits >= 2 && (!best || score > best.score)) best = { key, score }
      }
      return best ? best.key : single(top[0])
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
    if (place) return place.key
    return index === 0 ? (stage.staging?.shot ?? null) : null
  })
}
