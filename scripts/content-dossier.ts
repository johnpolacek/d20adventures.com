/**
 * A dossier for drafting one post: the full agent sessions behind an idea, scrubbed, and every picture in them.
 * Written to content/queue/dossiers/<slug>/, out of Git with the rest of the queue. The queue sync copies only the
 * files at its top level, so the session pictures stay on this machine.
 *
 *   <dir>/sessions.md      John's prompts and every reply the agent wrote, in order, tool output left out
 *   <dir>/images/*.{png,jpg,webp}   pictures John pasted, screenshots the agent took, image files it opened
 *   <dir>/images.md        one line per picture: where it came from, when, and the prompt it answered
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cleanPrompt, readLines, scrub, textOf } from "./content-mine"

const REPO = path.resolve(__dirname, "..")
const CLAUDE_DIR = path.join(os.homedir(), ".claude/projects", REPO.replace(/[/.]/g, "-"))
const CODEX_DIR = path.join(os.homedir(), ".codex/sessions")
const SESSION_BUDGET = 400_000 // characters of sessions.md
const SCREENSHOT_MAX = 60 // agent screenshots per dossier, sampled evenly. Pasted pictures are all kept.
// Sessions run for hours across many topics. Keep what falls from a while before each of the idea's commits to just after.
const BEFORE = 3 * 3600_000
const AFTER = 30 * 60_000
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }

type Picture = { kind: "pasted" | "screenshot" | "file"; session: string; at: string; prompt: string; data?: string; type?: string; file?: string }
type Turn = { session: string; at: string; who: "John" | "Agent"; text: string }

function claudeFiles(short: string): string[] {
  if (!fs.existsSync(CLAUDE_DIR)) return []
  return fs
    .readdirSync(CLAUDE_DIR)
    .filter((n) => n.startsWith(short) && n.endsWith(".jsonl"))
    .map((n) => path.join(CLAUDE_DIR, n))
}

function codexFile(short: string): string | undefined {
  if (!fs.existsSync(CODEX_DIR)) return
  const stack = [CODEX_DIR]
  while (stack.length) {
    const dir = stack.pop()!
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name.endsWith(".jsonl") && e.name.includes(short)) return p
    }
  }
}

function readClaude(file: string, session: string, turns: Turn[], pics: Picture[]) {
  let prompt = ""
  for (const row of readLines(file) as any[]) {
    if (row.isSidechain) continue
    const content = row.message?.content
    const blocks: any[] = Array.isArray(content) ? content : []
    if (row.type === "user" && !row.isMeta) {
      const raw = textOf(content, ["text"])
      const clean = raw && cleanPrompt(raw)
      if (clean) {
        prompt = clean
        turns.push({ session, at: row.timestamp, who: "John", text: scrub(clean) })
      }
      for (const b of blocks) {
        if (b?.type === "image" && b.source?.data) pics.push({ kind: "pasted", session, at: row.timestamp, prompt, data: b.source.data, type: b.source.media_type })
        if (b?.type === "tool_result" && Array.isArray(b.content)) {
          for (const c of b.content) {
            if (c?.type === "image" && c.source?.data) pics.push({ kind: "screenshot", session, at: row.timestamp, prompt, data: c.source.data, type: c.source.media_type })
          }
        }
      }
    } else if (row.type === "assistant") {
      const text = textOf(content, ["text"]).trim()
      if (text) turns.push({ session, at: row.timestamp, who: "Agent", text: scrub(text) })
      for (const b of blocks) {
        const file = b?.type === "tool_use" ? String(b.input?.file_path ?? "") : ""
        if (/\.(png|jpe?g|webp)$/i.test(file) && fs.existsSync(file)) pics.push({ kind: "file", session, at: row.timestamp, prompt, file })
      }
    }
  }
}

function readCodex(file: string, session: string, turns: Turn[], pics: Picture[]) {
  let prompt = ""
  for (const row of readLines(file) as any[]) {
    if (row.type !== "response_item" || row.payload?.type !== "message") continue
    const role = row.payload.role
    if (role === "user") {
      const clean = cleanPrompt(textOf(row.payload.content, ["input_text"]))
      if (clean) {
        prompt = clean
        turns.push({ session, at: row.timestamp, who: "John", text: scrub(clean) })
      }
      for (const b of row.payload.content ?? []) {
        const url = b?.type === "input_image" ? String(b.image_url ?? "") : ""
        const m = url.match(/^data:(image\/\w+);base64,(.+)$/)
        if (m) pics.push({ kind: "pasted", session, at: row.timestamp, prompt, type: m[1], data: m[2] })
      }
    } else if (role === "assistant") {
      const text = textOf(row.payload.content, ["output_text"]).trim()
      if (text) turns.push({ session, at: row.timestamp, who: "Agent", text: scrub(text) })
    }
  }
}

function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  return Array.from({ length: max }, (_, i) => items[Math.floor((i * items.length) / max)])
}

function commitTimes(commits: string[]): number[] {
  return commits.flatMap((c) => {
    try {
      return [new Date(execFileSync("git", ["show", "-s", "--format=%cI", c], { cwd: REPO, encoding: "utf8" }).trim()).getTime()]
    } catch {
      return []
    }
  })
}

/**
 * Builds the dossier for these session ids ("claude:xxxxxxxx", "codex:xxxxxxxx"), narrowed to the hours around these
 * commits when there are any, and returns its folder.
 */
export function buildDossier(slug: string, sessions: string[], commits: string[] = []): { dir: string; turns: number; images: number } {
  const dir = path.join(REPO, "content/queue/dossiers", slug)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, "images"), { recursive: true })
  const turns: Turn[] = []
  const pics: Picture[] = []
  for (const id of sessions) {
    const [kind, short] = id.split(":")
    if (!short) continue
    if (kind === "codex") {
      const f = codexFile(short)
      if (f) readCodex(f, id, turns, pics)
    } else for (const f of claudeFiles(short)) readClaude(f, id, turns, pics)
  }
  const times = commitTimes(commits)
  const near = (at: string) => {
    const t = new Date(at).getTime()
    return !times.length || times.some((c) => t >= c - BEFORE && t <= c + AFTER)
  }
  const nearTurns = turns.filter((t) => near(t.at))
  turns.splice(0, turns.length, ...nearTurns)
  const nearPics = pics.filter((p) => near(p.at))
  pics.splice(0, pics.length, ...nearPics)

  // Long replies shrink first, so every prompt and the shape of each reply fit.
  let replyMax = 6000
  const render = () =>
    turns
      .map((t) => `### ${t.who} · ${t.session} · ${t.at?.slice(0, 16)}Z\n\n${t.who === "Agent" && t.text.length > replyMax ? `${t.text.slice(0, replyMax)} …` : t.text}`)
      .join("\n\n")
  let text = render()
  while (text.length > SESSION_BUDGET && replyMax > 400) {
    replyMax = Math.floor(replyMax * 0.6)
    text = render()
  }
  fs.writeFileSync(path.join(dir, "sessions.md"), `# Sessions behind ${slug}\n\n${text.slice(0, SESSION_BUDGET)}\n`)

  const kept = [...pics.filter((p) => p.kind !== "screenshot"), ...sample(pics.filter((p) => p.kind === "screenshot"), SCREENSHOT_MAX)]
  kept.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const seen = new Set<string>()
  const lines: string[] = []
  for (const p of kept) {
    const body = p.file ? fs.readFileSync(p.file) : Buffer.from(p.data!, "base64")
    const hash = createHash("md5").update(body).digest("hex")
    if (seen.has(hash)) continue
    seen.add(hash)
    const ext = p.file ? path.extname(p.file).slice(1).toLowerCase() : (EXT[p.type ?? ""] ?? "png")
    const name = `${String(lines.length + 1).padStart(3, "0")}-${p.kind}.${ext}`
    fs.writeFileSync(path.join(dir, "images", name), body)
    const from = p.file ? `, opened from ${scrub(p.file)}` : ""
    lines.push(`- images/${name}: ${p.kind}${from}, ${p.session}, ${p.at?.slice(0, 16)}Z. Answering: ${scrub(p.prompt).replace(/\s+/g, " ").slice(0, 240)}`)
  }
  fs.writeFileSync(path.join(dir, "images.md"), `# Pictures behind ${slug}\n\n${lines.join("\n") || "(none)"}\n`)
  return { dir, turns: turns.length, images: lines.length }
}
