/**
 * Content miner: reads the week's commits and agent sessions, asks the local
 * Claude CLI which moments are worth sharing, and writes ranked ideas to
 * content/queue. Runs locally only. Raw logs never leave this machine except
 * as scrubbed, trimmed snippets sent to `claude -p` on John's subscription.
 *
 *   pnpm content:mine                  since the last run, or 7 days
 *   pnpm content:mine --since 2026-11-14
 *   pnpm content:mine --dry            collect and print sizes, no model calls
 *   pnpm content:mine --day 2026-11-20 one day only
 *   pnpm content:mine --day 2026-11-20 --print   try the prompt, write nothing
 */
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { syncQueue } from "../lib/content-queue/sync"

const REPO = path.resolve(__dirname, "..")
const QUEUE = path.join(REPO, "content/queue")
const MARKER = path.join(QUEUE, ".mined.json")
const CLAUDE_DIR = path.join(os.homedir(), ".claude/projects", REPO.replace(/[/.]/g, "-"))
const CODEX_DIR = path.join(os.homedir(), ".codex/sessions")
const TZ = "America/Chicago"
const DAY_BUDGET = 150_000 // characters of digest per model call
const PROMPT_MAX = 1500
const REPLY_MAX = 1200

type Commit = { hash: string; date: string; subject: string; body: string; stat: string }
type Exchange = { source: "claude" | "codex"; session: string; date: string; prompt: string; reply: string }
type Candidate = {
  title: string
  longTitle: string
  point: string
  hook: string
  payoff: string
  spread: string
  numbers: string[]
  visual: string
  audience: "players" | "devs" | "both"
  formats: string[]
  scores: { hook: number; payoff: number; spread: number }
  commits: string[]
  sessions: string[]
  quotes: string[]
  slug?: string
}

// ---------- args ----------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const DRY = process.argv.includes("--dry")
const PRINT = process.argv.includes("--print") // ask the model, print the day ideas, write nothing
const MODEL = arg("model") ?? "opus"
const TOP = Number(arg("top") ?? 12)

function readMarker(): { through?: string } {
  try {
    return JSON.parse(fs.readFileSync(MARKER, "utf8"))
  } catch {
    return {}
  }
}

const onlyDay = arg("day")
const since = onlyDay
  ? new Date(`${onlyDay}T00:00:00-06:00`)
  : new Date(arg("since") ?? readMarker().through ?? Date.now() - 7 * 86_400_000)
const until = onlyDay ? new Date(since.getTime() + 86_400_000) : new Date()

// ---------- scrub ----------

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abpr]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /(?:pk|sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /((?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z_]*\s*[=:]\s*)\S{8,}/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,
]

export function scrub(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, keep) => (typeof keep === "string" && m.startsWith(keep) ? `${keep}[redacted]` : "[redacted]"))
  }
  return out.replaceAll(os.homedir(), "~")
}

function clip(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max)} …`
}

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso))
}

function inRange(iso: string | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= since.getTime() && t < until.getTime()
}

// ---------- commits ----------

function collectCommits(): Commit[] {
  const out = execFileSync(
    "git",
    ["log", `--since=${since.toISOString()}`, `--until=${until.toISOString()}`, "--no-merges", "--shortstat", "--format=%x1e%H%x1f%cI%x1f%s%x1f%b%x1f"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  return out
    .split("\x1e")
    .filter((s) => s.trim())
    .map((rec) => {
      const [hash, date, subject, body, stat] = rec.split("\x1f")
      return {
        hash: hash.slice(0, 8),
        date,
        subject,
        body: clip(body.replace(/Co-Authored-By:.*$/gim, ""), 600),
        stat: (stat ?? "").trim(),
      }
    })
}

// ---------- sessions ----------

const NOISE_PREFIXES = [
  "<command-",
  "<local-command",
  "<task-notification",
  "<bash-input",
  "<bash-stdout",
  "<bash-stderr",
  "# AGENTS.md",
  "<environment_context>",
  "<user_instructions>",
  "Caveat:",
]

function cleanPrompt(raw: string): string | null {
  const text = raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<user-rules>[\s\S]*?<\/user-rules>/g, "")
    .replace(/<breadcrumb-memory>[\s\S]*?<\/breadcrumb-memory>/g, "")
    .trim()
  // One-letter answers to lettered options carry no story on their own.
  if (text.length < 4 || NOISE_PREFIXES.some((p) => text.startsWith(p))) return null
  if (text.startsWith("[Request interrupted")) return null
  return text
}

function textOf(content: unknown, kinds: string[]): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((b) => b && kinds.includes(b.type) && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
}

function readLines(file: string): unknown[] {
  const rows: unknown[] = []
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // partial line from a live session
    }
  }
  return rows
}

function pushExchange(list: Exchange[], ex: Exchange | null) {
  if (ex && ex.prompt) list.push({ ...ex, prompt: clip(scrub(ex.prompt), PROMPT_MAX), reply: clip(scrub(ex.reply), REPLY_MAX) })
}

function collectClaude(): Exchange[] {
  if (!fs.existsSync(CLAUDE_DIR)) return []
  const list: Exchange[] = []
  for (const name of fs.readdirSync(CLAUDE_DIR)) {
    if (!name.endsWith(".jsonl")) continue
    const file = path.join(CLAUDE_DIR, name)
    if (fs.statSync(file).mtimeMs < since.getTime()) continue
    const session = name.replace(".jsonl", "").slice(0, 8)
    let cur: Exchange | null = null
    for (const row of readLines(file) as any[]) {
      if (row.isSidechain || !inRange(row.timestamp)) continue
      if (row.type === "user" && !row.isMeta) {
        const raw = textOf(row.message?.content, ["text"])
        const prompt = raw && cleanPrompt(raw)
        if (!prompt) continue
        pushExchange(list, cur)
        cur = { source: "claude", session, date: row.timestamp, prompt, reply: "" }
      } else if (row.type === "assistant" && cur) {
        const text = textOf(row.message?.content, ["text"]).trim()
        if (text) cur.reply = text // keep the last text before the next prompt
      }
    }
    pushExchange(list, cur)
  }
  return list
}

function collectCodex(): Exchange[] {
  if (!fs.existsSync(CODEX_DIR)) return []
  const list: Exchange[] = []
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".jsonl") && fs.statSync(p).mtimeMs >= since.getTime()) files.push(p)
    }
  }
  walk(CODEX_DIR)
  for (const file of files) {
    const rows = readLines(file) as any[]
    const meta = rows.find((r) => r.type === "session_meta")
    if (meta?.payload?.cwd !== REPO) continue
    const session = String(meta.payload.id ?? path.basename(file)).slice(0, 8)
    let cur: Exchange | null = null
    for (const row of rows) {
      if (row.type !== "response_item" || row.payload?.type !== "message" || !inRange(row.timestamp)) continue
      const role = row.payload.role
      if (role === "user") {
        const prompt = cleanPrompt(textOf(row.payload.content, ["input_text"]))
        if (!prompt) continue
        pushExchange(list, cur)
        cur = { source: "codex", session, date: row.timestamp, prompt, reply: "" }
      } else if (role === "assistant" && cur) {
        const text = textOf(row.payload.content, ["output_text"]).trim()
        if (text) cur.reply = text
      }
    }
    pushExchange(list, cur)
  }
  return list
}

// ---------- digest ----------

function digestDay(day: string, commits: Commit[], exchanges: Exchange[]): string {
  const parts: string[] = [`# ${day}`, "", "## Commits", ""]
  for (const c of commits) {
    parts.push(`- ${c.hash} ${c.subject}${c.stat ? ` (${c.stat})` : ""}`)
    if (c.body.trim()) parts.push(`  ${c.body.trim().replace(/\n+/g, " ")}`)
  }
  parts.push("", "## Agent sessions", "")
  let text = parts.join("\n")
  // Prompts carry the human intent, so they get room first. Replies shrink to fit.
  let replyMax = REPLY_MAX
  const render = () =>
    exchanges
      .map((e) => `### ${e.source}:${e.session} ${e.date.slice(11, 16)}Z\nJohn: ${e.prompt}\nAgent: ${clip(e.reply, replyMax)}`)
      .join("\n\n")
  let body = render()
  while (text.length + body.length > DAY_BUDGET && replyMax > 150) {
    replyMax = Math.floor(replyMax * 0.6)
    body = render()
  }
  text += body
  return text.length > DAY_BUDGET ? `${text.slice(0, DAY_BUDGET)}\n…(cut)` : text
}

// ---------- model ----------

export function claude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "json", "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", ""],
      { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "pipe"] }
    )
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err || out}`.slice(0, 800)))
      try {
        const parsed = JSON.parse(out)
        if (parsed.is_error) return reject(new Error(String(parsed.result).slice(0, 800)))
        resolve(String(parsed.result ?? ""))
      } catch {
        resolve(out)
      }
    })
    child.stdin.end(prompt)
  })
}

export function parseJsonArray<T>(text: string): T[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf("[")
  const end = raw.lastIndexOf("]")
  if (start === -1 || end === -1) throw new Error(`no JSON array in model output: ${text.slice(0, 300)}`)
  return JSON.parse(raw.slice(start, end + 1))
}

export const CONTEXT = `D20 Adventures (d20adventures.com) is John Polacek's solo-built tabletop RPG where an AI game master runs D&D-style adventures, with a painted 3D encounter stage, a desktop app that runs locally, and adventures authored as markdown. John builds it with AI coding agents. Audiences: tabletop and AI RPG players, and indie and AI-assisted developers.`

// The title lessons live in the voice guide, so what John teaches there reaches every run.
export function titleGuide(): string {
  const doc = fs.readFileSync(path.join(REPO, "docs/writing-voice.md"), "utf8")
  return doc.match(/\*\*Titles\.\*\*[\s\S]*?(?=\n\*\*Frontmatter\.\*\*)/)?.[0].trim() ?? ""
}

const SHAREABLE = `Judge every idea as a stranger scrolling a feed would. Three questions:
- Hook: would they stop scrolling? Lead with the moment, not with "I built" or "I did". A rules gotcha D&D players recognize, a funny fail, a surprising number, or a question they want to answer.
- Payoff: what do they walk away with? A price table they can reuse, a trick that fixes their own bug, a rules answer, a clip worth watching.
- Spread: why would they pass it on? They want to argue, it's useful to a friend, it's funny, or they'll bookmark it.
What spreads best here: rules gotchas and AI GM mistakes players recognize, cost and speed tables, funny visual fails with a fix, clever tricks for AI 3D and AI agents.
Not worth sharing: refactors, renames, cleanups, token or theme plumbing, config, dependency bumps, loading fixes, and pretty shots with no story beyond a ScreenshotSaturday clip.
Score hook, payoff and spread each 1 to 5. Use the whole range: most ideas are 2s and 3s, a 5 is rare.
Every idea must be grounded in the material. Never invent a fact, number, motive or opinion, and never generalize past what the material shows.

How to title an idea, from John's voice guide:
${titleGuide()}`

const CANDIDATE_SHAPE = `{"title": the short title, "longTitle": the long title, "point": one sentence on what happened, "hook": the opening line of a post, plain words, under 30 words, "payoff": what the reader walks away with, "spread": why they would pass it on, "numbers": [verified numbers from the material], "visual": what screenshot or clip would show it, or "" if none, "audience": "players" | "devs" | "both", "formats": any of ["x", "bluesky", "reddit", "update", "screenshot-saturday"], "scores": {"hook": 1-5, "payoff": 1-5, "spread": 1-5}, "commits": [short hashes], "sessions": ["claude:xxxxxxxx" ids], "quotes": [up to 2 short verbatim lines from John that show the human moment]}`

function mapPrompt(digest: string): string {
  return `${CONTEXT}

Below is one day of John's work: git commits and his conversations with coding agents. Find the moments worth sharing publicly.

${SHAREABLE}

Return only a JSON array of 0 to 6 ideas, best first. Several commits about one thing are one idea. Shape:
${CANDIDATE_SHAPE}

${digest}`
}

// The site's published posts, title, summary and section headings, so the miner doesn't suggest what already shipped.
function publishedPosts(): string {
  const dir = path.join(REPO, "content/updates")
  if (!fs.existsSync(dir)) return ""
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8")
      if (/^draft:\s*true/m.test(text)) return ""
      const title = text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? f
      const description = text.match(/^description:\s*"?(.*?)"?\s*$/m)?.[1] ?? ""
      const headings = [...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]).join("; ")
      return `- ${title}: ${description}${headings ? ` Sections: ${headings}.` : ""}`
    })
    .filter(Boolean)
    .join("\n")
}

function reducePrompt(cands: Candidate[], existing: string[]): string {
  return `${CONTEXT}

These ideas were mined from separate days of John's work. Merge ideas that are the same story, combining their evidence. Ideas that are each one incident of a bigger subject (several AI game master mistakes, several 3D figure fixes) become one idea about that subject, with the incidents as its examples. Drop any idea that repeats one already in the queue, or that a published post already covers. An idea that only adds a little to a published post is dropped too. Rank what remains by hook plus payoff plus spread and keep the best ${TOP}. Rewrite any hook that starts with what John did instead of the moment itself.

${SHAREABLE}

Already in the queue:
${existing.length ? existing.map((t) => `- ${t}`).join("\n") : "(empty)"}

Already published on the site, with each post's sections:
${publishedPosts() || "(none)"}

Return only a JSON array, best first, each item shaped:
${CANDIDATE_SHAPE.replace(/^\{/, '{"slug": short-kebab-case, ')}

Ideas:
${JSON.stringify(cands, null, 1)}`
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}

// ---------- queue files ----------

type QueueItem = { file: string; title: string; rank: number }

function readQueue(): QueueItem[] {
  if (!fs.existsSync(QUEUE)) return []
  return fs
    .readdirSync(QUEUE)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => {
      const text = fs.readFileSync(path.join(QUEUE, f), "utf8")
      const title = text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? f
      const rank = Number(text.match(/^rank:\s*(\d+)/m)?.[1] ?? 999)
      return { file: f, title, rank }
    })
}

function yamlList(items: string[]): string {
  return items.length ? `\n${items.map((i) => `  - ${JSON.stringify(i)}`).join("\n")}` : " []"
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function writeIdea(c: Candidate, rank: number, mined: string): string {
  let slug = slugify(c.slug || c.title) || `idea-${rank}`
  while (fs.existsSync(path.join(QUEUE, `${slug}.md`))) slug += "-2"
  const s = c.scores ?? { hook: 0, payoff: 0, spread: 0 }
  const total = s.hook + s.payoff + s.spread
  const md = `---
title: ${JSON.stringify(c.title)}
longTitle: ${JSON.stringify(c.longTitle ?? "")}
status: idea
rank: ${rank}
tier: ${total >= 12 ? 1 : total >= 9 ? 2 : 3}
score: ${total}
scores:
  hook: ${s.hook}
  payoff: ${s.payoff}
  spread: ${s.spread}
audience: ${c.audience}
formats:${yamlList(c.formats)}
asset: ${JSON.stringify(c.visual || "")}
mined: ${mined}
commits:${yamlList(c.commits)}
sessions:${yamlList(c.sessions)}
posted: {}
---

## Point

${c.point}

## Hook

${c.hook}

## Payoff

${c.payoff}

## Why it spreads

${c.spread}

## Facts

${c.numbers.length ? c.numbers.map((n) => `- ${n}`).join("\n") : "- (none found)"}

## John said

${c.quotes.length ? c.quotes.map((q) => `> ${q}`).join("\n>\n") : "(no quote)"}
`
  fs.writeFileSync(path.join(QUEUE, `${slug}.md`), md)
  return slug
}

// ---------- main ----------

async function main() {
  console.log(`mining ${since.toISOString()} → ${until.toISOString()}`)
  const commits = collectCommits()
  const exchanges = [...collectClaude(), ...collectCodex()].sort((a, b) => a.date.localeCompare(b.date))
  const days = new Map<string, { commits: Commit[]; exchanges: Exchange[] }>()
  const bucket = (d: string) => days.get(d) ?? days.set(d, { commits: [], exchanges: [] }).get(d)!
  for (const c of commits) bucket(dayOf(c.date)).commits.push(c)
  for (const e of exchanges) bucket(dayOf(e.date)).exchanges.push(e)
  const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
  const digests = ordered.map(([day, d]) => ({ day, text: digestDay(day, d.commits, d.exchanges), ...d }))

  for (const d of digests) {
    console.log(`${d.day}: ${d.commits.length} commits, ${d.exchanges.length} exchanges, ${Math.round(d.text.length / 1000)}k chars`)
  }
  if (DRY) {
    const out = path.join(os.tmpdir(), "content-mine-digest.md")
    fs.writeFileSync(out, digests.map((d) => d.text).join("\n\n"))
    console.log(`dry run, digest at ${out}`)
    return
  }
  if (!digests.length) return console.log("nothing to mine")
  await syncQueue() // rank after what is already in the bucket

  const perDay = await pool(digests, 3, async (d) => {
    const t = Date.now()
    try {
      const found = parseJsonArray<Candidate>(await claude(mapPrompt(d.text)))
      console.log(`${d.day}: ${found.length} ideas (${Math.round((Date.now() - t) / 1000)}s)`)
      return found
    } catch (e) {
      console.error(`${d.day}: failed, ${(e as Error).message}`)
      return []
    }
  })
  const all = perDay.flat()
  if (!all.length) return console.log("no ideas found")
  if (PRINT) {
    for (const c of all) console.log(`\n[${c.scores?.hook}/${c.scores?.payoff}/${c.scores?.spread}] ${c.title}\n  hook: ${c.hook}\n  payoff: ${c.payoff}\n  spread: ${c.spread}`)
    return
  }

  const queue = readQueue()
  const ranked = parseJsonArray<Candidate>(await claude(reducePrompt(all, queue.map((q) => q.title))))
  fs.mkdirSync(QUEUE, { recursive: true })
  // New ideas join after the live queue. Cut and folded ideas sit at 90 and up, out of the way.
  const startRank = queue.filter((q) => q.rank < 90).reduce((m, q) => Math.max(m, q.rank), 0) + 1
  const mined = new Date().toISOString().slice(0, 10)
  ranked.forEach((c, i) => console.log(`  ${startRank + i}. ${writeIdea(c, startRank + i, mined)} (${(c.scores?.hook ?? 0) + (c.scores?.payoff ?? 0) + (c.scores?.spread ?? 0)})`))
  if (!onlyDay) fs.writeFileSync(MARKER, `${JSON.stringify({ through: until.toISOString() }, null, 2)}\n`)
  console.log(`${ranked.length} ideas written to content/queue`)
  await syncQueue()
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
