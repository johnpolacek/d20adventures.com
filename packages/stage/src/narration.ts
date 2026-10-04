import type { StagingShot } from "./spec/staging"

// Which view fits a paragraph of narration: the people it names, else the place it describes. Hosts call it as the
// player steps through a turn's narrative, so the camera follows the story.
//
//   - Two or more cast members named: the staging's group shot that frames most of them.
//   - One named: that character's own shot, or a shot on them.
//   - Nobody named: the set or staging shot whose label best matches the paragraph's words, through a small thesaurus
//     (a paragraph about the "riverboat" finds "The tug").
//   - Nothing matches: the staging's opening shot for the first paragraph, otherwise stay put (null).

export interface NarrationStage {
  cast: { id: string; name: string }[]
  set: { shots: Record<string, { label?: string }> }
  staging: { shot?: string; shots: Record<string, StagingShot> } | null
}
export type NarrationShot = string | { subject: string }

const TITLES = /^(madam|master|mistress|sergeant|sir|lady|lord|captain|brother|sister|father|mother)$/
// A first word that describes rather than names ("Elven Archer"): such a character is only known by the full name.
const DESCRIPTORS = /^(elven|elvish|dwarven|human|halfling|gnomish|orcish|old|young|tall|hooded|the|a|an)$/
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
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function narrationShot(text: string, stage: NarrationStage, { first = false } = {}): NarrationShot | null {
  const lower = text.toLowerCase()
  const at = (c: { name: string }) =>
    Math.min(
      ...callNames(c.name)
        .map((n) => lower.search(new RegExp(`\\b${escape(n)}\\b`)))
        .filter((i) => i >= 0),
      Infinity
    )
  const named = stage.cast
    .map((c) => ({ c, i: at(c) }))
    .filter((x) => x.i < Infinity)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c)
  const staged = Object.entries(stage.staging?.shots ?? {})
  if (named.length >= 2) {
    const ids = new Set(named.map((c) => c.id))
    let best: { key: string; score: number } | null = null
    for (const [key, s] of staged) {
      if (!("subjects" in s)) continue
      const hits = s.subjects.filter((id) => ids.has(id)).length
      const score = hits - 0.25 * (s.subjects.length - hits)
      if (hits >= 2 && (!best || score > best.score)) best = { key, score }
    }
    if (best) return best.key
  }
  if (named.length) {
    const own = staged.find(([, s]) => "subject" in s && s.subject === named[0].id)
    return own ? own[0] : { subject: named[0].id }
  }
  const said = new Set(words(text))
  let best: { key: string; score: number } | null = null
  const label = (key: string, l?: string) => [...words(key.replace(/[-_]/g, " ")), ...words(l ?? "")]
  const candidates = [
    ...Object.entries(stage.set.shots).map(([key, s]) => ({ key, words: label(key, s.label) })),
    ...staged.filter(([, s]) => !("subject" in s) && !("subjects" in s)).map(([key, s]) => ({ key, words: label(key, (s as { label?: string }).label) })),
  ]
  for (const c of candidates) {
    const hits = new Set(c.words.flatMap(expand).filter((w) => said.has(w)))
    if (hits.size && (!best || hits.size > best.score)) best = { key: c.key, score: hits.size }
  }
  if (best) return best.key
  return first ? (stage.staging?.shot ?? null) : null
}
