import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import type { Pack } from "./game"
import type { Save } from "./store"

// Story memory: what happened in the adventures a playthrough has already finished, carried into the next one. A
// chapter is cut from what the finished save already holds, so no model is asked for a recap.
export type Chapter = {
  adventureId: string
  title: string
  // The last scenes it passed through, which say how it ended.
  ending: string
  heroes: { id: string; name: string }[]
  // The end of the GM's own running summary.
  summary: string
  // Threads left open, as "Title: text".
  open: string[]
  // What its heroes learned, each with the heroes who know it. Saves from before the ledger have none.
  known?: { text: string; knownBy: string[] }[]
}
const SUMMARY = 1200
const THREADS = 4
const THREAD = 220
const KNOWN = 12

// The last whole paragraphs that fit, or the last whole sentences of a paragraph too long to fit.
function ending(text: string, limit: number) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const kept: string[] = []
  for (const p of paragraphs.reverse()) {
    if (kept.join("\n\n").length + p.length > limit) break
    kept.unshift(p)
  }
  if (kept.length) return kept.join("\n\n")
  const last = paragraphs[0] ?? ""
  const cut = last.slice(-limit)
  const sentence = cut.search(/(?<=[.!?])\s+\S/)
  return (sentence >= 0 ? cut.slice(sentence) : cut).trim()
}
const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`)

export function chapterOf(save: Save): Chapter {
  const turns = [...save.turns].sort((a, b) => a.order - b.order)
  const last = turns.find((t) => t._id === save.adventure.currentTurnId) ?? turns.at(-1)
  const scenes = turns.map((t) => t.title).filter((title, i, all) => title !== all[i - 1])
  const resolved = new Set(save.adventure.resolvedThreadIds)
  const open = (save.adventure.openThreads as { id: string; title?: string; text?: string }[]).filter((t) => !resolved.has(t.id) && (t.title || t.text))
  const heroes = (last?.characters ?? []).filter((c) => c.type === "pc").map((c) => ({ id: c.id, name: c.name }))
  const known = (save.adventure.knowledge ?? [])
    .map((f) => ({ text: f.text, knownBy: f.knownBy.filter((k) => heroes.some((h) => h.id === k)) }))
    .filter((f) => f.knownBy.length)
    .slice(-KNOWN)
  return {
    adventureId: save.adventure.planId,
    title: save.adventure.title,
    ending: scenes.slice(-3).join(", then "),
    heroes,
    summary: ending(save.adventure.adventureSummaryMarkdown ?? "", SUMMARY),
    open: open.slice(-THREADS).map((t) => clip([t.title, t.text].filter(Boolean).join(": "), THREAD)),
    ...(known.length ? { known } : {}),
  }
}

// What a chapter's heroes learned. With `hero`, only what that hero knows. For the GM, each fact with who knows it.
function knownNote(c: Chapter, hero?: string) {
  const names = (ids: string[]) => ids.map((id) => c.heroes.find((h) => h.id === id)?.name ?? id).join(", ")
  const facts = (c.known ?? []).filter((f) => !hero || f.knownBy.includes(hero))
  if (!facts.length) return ""
  return hero
    ? `What ${names([hero])} learned there: ${facts.map((f) => f.text).join(" | ")}`
    : `What its heroes learned, with who knows it: ${facts.map((f) => `${f.text} (${names(f.knownBy)})`).join(" | ")}`
}

// The story so far as the GM reads it, or nothing. With `hero`, only the chapters that hero lived and what that hero
// learned in them: a prompt written from one hero's side must not hand them what happened to others.
export function storyNote(story: Chapter[] | undefined, hero?: string): string {
  const chapters = (story ?? []).filter((c) => !hero || c.heroes.some((h) => h.id === hero))
  if (!chapters.length) return ""
  const told = chapters.map((c, i) =>
    [
      `${i + 1}. ${c.title}. Its last scenes: ${c.ending}. Heroes: ${c.heroes.map((h) => h.name).join(", ") || "none"}.`,
      c.summary,
      c.open.length ? `Left open: ${c.open.join(" | ")}` : "",
      knownNote(c, hero),
    ]
      .filter(Boolean)
      .join("\n")
  )
  return `THE STORY SO FAR. The adventures this playthrough has already finished, oldest first. They are settled fact. Where this adventure's notes assume something else about those events, what is written here wins, and the notes' details change to fit. A hero knows only a chapter that names them. The other heroes know none of it until the story shows them being told.\n\n${told.join("\n\n")}`
}

// The adventure's premise with the story so far added, which is how every prompt that carries one gets the other.
export const premiseWithStory = (premise: string | undefined, story: Chapter[] | undefined, hero?: string) => [premise?.trim(), storyNote(story, hero)].filter(Boolean).join("\n\n") || undefined

export function withStory(pack: Pack, story: Chapter[] | undefined): Pack {
  if (!story?.length) return pack
  const manifest = { ...pack.artifacts.manifest, premise: premiseWithStory(pack.artifacts.manifest.premise, story) }
  return { ...pack, artifacts: { ...pack.artifacts, manifest } }
}

// The chapters a new game opens with: the finished save's own, and one for the adventure it holds. Only a finished
// adventure hands its story on, and only to the adventure it names as next.
export function storyInto(plan: string, before: Save | null, next: string | undefined): Chapter[] | undefined {
  if (!before || before.adventure.status !== "completed" || next !== plan) return undefined
  return [...(before.story ?? []), chapterOf(before)]
}

// A hero who goes on keeps what they held: it joins the new sheet's own gear. Wounds and conditions stay behind,
// since time passes between adventures.
export function carryGear(characters: TurnCharacter[], before: Save) {
  const turns = [...before.turns].sort((a, b) => a.order - b.order)
  const last = turns.find((t) => t._id === before.adventure.currentTurnId) ?? turns.at(-1)
  const name = (item: { name: string }) => item.name.trim().toLowerCase()
  for (const c of characters) {
    const was = c.type === "pc" ? last?.characters.find((p) => p.type === "pc" && p.id === c.id) : undefined
    if (!was) continue
    const held = structuredClone(was.equipment ?? [])
    c.equipment = [...held, ...(c.equipment ?? []).filter((item) => !held.some((h) => name(h) === name(item)))]
  }
}
