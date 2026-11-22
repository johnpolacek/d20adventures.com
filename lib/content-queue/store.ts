/**
 * Reads and writes the post ideas in content/queue: YAML frontmatter, then
 * "## Name" sections. Used by /admin/content on localhost.
 */
import fs from "node:fs"
import path from "node:path"
import { parse, stringify } from "yaml"

const QUEUE = path.join(process.cwd(), "content/queue")

export const STATUSES = ["idea", "draft", "scheduled", "posted", "shelved"] as const
// Older names, read as the status that replaced them.
const RENAMED: Record<string, QueueStatus> = { drafted: "draft", approved: "draft", folded: "shelved", cut: "shelved" }
export type QueueStatus = (typeof STATUSES)[number]

/** Platform drafts every idea can carry, in the order they show. */
export const PLATFORMS = ["X", "Reddit"] as const

export type QueueSection = { name: string; body: string }

export type QueueItem = {
  slug: string
  title: string
  longTitle: string
  status: QueueStatus
  rank: number
  tier: number
  score: number
  scores: { hook: number; payoff: number; spread: number }
  audience: string
  formats: string[]
  asset: string
  mined: string
  commits: string[]
  sessions: string[]
  into?: string
  // The /updates post this idea became, by its slug.
  post?: string
  posted: Record<string, string>
  sections: QueueSection[]
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/

function fileOf(slug: string): string {
  if (!SLUG.test(slug)) throw new Error(`bad slug: ${slug}`)
  return path.join(QUEUE, `${slug}.md`)
}

function parseItem(slug: string, text: string): QueueItem {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const meta = (m ? parse(m[1]) : {}) ?? {}
  const body = m ? m[2] : text
  const sections: QueueSection[] = []
  for (const part of body.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n")
    const name = (nl === -1 ? part : part.slice(0, nl)).trim()
    sections.push({ name, body: nl === -1 ? "" : part.slice(nl + 1).trim() })
  }
  const scores = { hook: 0, payoff: 0, spread: 0, ...(meta.scores ?? {}) }
  return {
    slug,
    title: String(meta.title ?? slug),
    longTitle: String(meta.longTitle ?? ""),
    status: STATUSES.includes(meta.status) ? meta.status : (RENAMED[meta.status] ?? "idea"),
    rank: Number(meta.rank ?? 999),
    tier: Number(meta.tier ?? 3),
    score: Number(meta.score ?? scores.hook + scores.payoff + scores.spread),
    scores,
    audience: String(meta.audience ?? ""),
    formats: Array.isArray(meta.formats) ? meta.formats.map(String) : [],
    asset: String(meta.asset ?? ""),
    mined: String(meta.mined ?? ""),
    commits: Array.isArray(meta.commits) ? meta.commits.map(String) : [],
    sessions: Array.isArray(meta.sessions) ? meta.sessions.map(String) : [],
    ...(meta.into ? { into: String(meta.into) } : {}),
    ...(meta.post ? { post: String(meta.post) } : {}),
    posted: meta.posted && typeof meta.posted === "object" ? meta.posted : {},
    sections,
  }
}

function serialize(item: QueueItem): string {
  const { slug: _slug, sections, ...meta } = item
  const front = stringify(meta, { lineWidth: 0 }).trimEnd()
  const body = sections.map((s) => `## ${s.name}\n\n${s.body.trim()}`).join("\n\n")
  return `---\n${front}\n---\n\n${body}\n`
}

export function listQueue(): QueueItem[] {
  if (!fs.existsSync(QUEUE)) return []
  return fs
    .readdirSync(QUEUE)
    .filter((f) => f.endsWith(".md") && !f.includes(".remote."))
    .map((f) => parseItem(f.slice(0, -3), fs.readFileSync(path.join(QUEUE, f), "utf8")))
    .sort((a, b) => a.rank - b.rank || b.score - a.score)
}

export function readItem(slug: string): QueueItem {
  return parseItem(slug, fs.readFileSync(fileOf(slug), "utf8"))
}

export function writeItem(item: QueueItem): void {
  fs.writeFileSync(fileOf(item.slug), serialize(item))
}

/** Gives the listed slugs ranks 1..n in order. Folded and cut ideas are left at 90 and up. */
export function writeOrder(slugs: string[]): void {
  slugs.forEach((slug, i) => {
    const item = readItem(slug)
    if (item.rank !== i + 1) writeItem({ ...item, rank: i + 1 })
  })
}
