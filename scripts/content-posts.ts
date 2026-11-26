/**
 * Update post picker: reads the mined ideas in content/queue, asks the local Claude CLI which deserve a post on
 * /updates, and plans each one inside its idea. Runs after `pnpm content:mine`, locally only.
 *
 *   pnpm content:posts            judge new ideas, plan up to three
 *   pnpm content:posts --max 5    plan up to five
 *   pnpm content:posts --dry      judge and print, write nothing
 *   pnpm content:posts --rejudge  judge ideas that already have a verdict too
 *   pnpm content:posts --plan <slug>   skip judging and plan that idea
 *
 * It writes no post. John fleshes a planned idea out with an LLM, from the brief on /admin/content (owner decision,
 * 2026-11-25: "lets keep it at the idea stage, then i can flesh it out with the LLM"). The planner reads the commits,
 * the code, and a dossier of the idea's sessions (scrubbed) with every picture in them, kept in
 * content/queue/dossiers/<slug>/, and adds to the idea: the angle, the stories with John's words and their sources,
 * the pictures worth using, questions only John can answer, and title ideas. The idea's own title stays.
 *
 * Each judged idea gets an "Update verdict" section, so it isn't judged twice. Ideas folded into a planned one become
 * shelved with into set. Nothing is committed, published or posted.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { listQueue, readItem, writeItem, type QueueItem, type QueueSection } from "../lib/content-queue/store"
import { syncQueue } from "../lib/content-queue/sync"
import { buildDossier } from "./content-dossier"
import { CONTEXT, claude, parseJsonArray, section, titleGuide } from "./content-mine"

const REPO = path.resolve(__dirname, "..")
const UPDATES = path.join(REPO, "content/updates")
const VERDICT = "Update verdict"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const DRY = process.argv.includes("--dry")
const REJUDGE = process.argv.includes("--rejudge")
const MAX = Number(arg("max") ?? 3)
const ONLY = arg("plan")
const MODEL = arg("model") ?? "opus"

type Verdict = { slug: string; post: boolean; reason: string; with?: string[]; title?: string; longTitle?: string }

const BAR = `An /updates post is a writeup someone outside the project would want to read, not a changelog. It earns a post when a stranger doing similar work (running an AI game master, making game art with AI, building with coding agents, playing D&D with an AI) walks away with something they can use or would tell a friend about:
- a technique, prompt, setting or step that worked, with what failed first,
- a real number that decides something: a cost, a speed, a count,
- a problem many people hit, and the fix,
- a result surprising enough to argue about.
It needs enough real material for 500 words or more, from commits that exist. A single bug fix, a polish pass, content added to an adventure, a refactor, or a feature only this project's players notice is not a post. Those stay as short social posts or nothing.
Most ideas don't earn a post. Say yes rarely. Several ideas about one subject can be one post: name the lead idea and list the others in "with".
An idea that a published or drafted post already covers is a no, unless it adds enough for a post of its own.`

// Every post on the site, published or draft, so the judge doesn't pick what is already written.
function existingPosts(): string {
  return fs
    .readdirSync(UPDATES)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = fs.readFileSync(path.join(UPDATES, f), "utf8")
      const title = text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? f
      const description = text.match(/^description:\s*"?(.*?)"?\s*$/m)?.[1] ?? ""
      const draft = /^draft:\s*true/m.test(text) ? " (draft)" : ""
      const headings = [...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]).join("; ")
      return `- ${title}${draft}: ${description}${headings ? ` Sections: ${headings}.` : ""}`
    })
    .join("\n")
}

function part(item: QueueItem, name: string): string {
  return item.sections.find((s) => s.name === name)?.body.trim() ?? ""
}

function judgePrompt(items: QueueItem[]): string {
  const ideas = items.map((i) => ({
    slug: i.slug,
    title: i.title,
    point: part(i, "Point"),
    payoff: part(i, "Payoff"),
    spread: part(i, "Why it spreads"),
    facts: part(i, "Facts"),
    scores: i.scores,
    commits: i.commits.length,
  }))
  return `${CONTEXT}

These ideas were mined from John's commits and agent sessions. Decide which deserve a post on /updates at d20adventures.com.

${BAR}

Posts already on the site:
${existingPosts() || "(none)"}

How to title a post, from John's voice guide:
${titleGuide()}

Return only a JSON array with one verdict per idea, shaped {"slug": the idea's slug, "post": true | false, "reason": one plain sentence a reader of the queue can check, "with": [slugs of other ideas folded into this post], "title": the post's short title when post is true, "longTitle": its long title when post is true}. Ideas folded into another get post false and a reason naming the lead idea. Best post first.

Ideas:
${JSON.stringify(ideas, null, 1)}`
}

// Dates in the queue are Chicago days, as the miner writes them.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date())

// What John has learned about posts that work, grown from his own write-ups.
function patterns(): string {
  return section(fs.readFileSync(path.join(REPO, "docs/writing-voice.md"), "utf8"), "Patterns that work") || "(none yet)"
}

type Plan = {
  title: string
  longTitle: string
  angle: string
  stories: { moment: string; quote?: string; numbers?: string[]; sources: string[] }[]
  pictures: { file: string; shows: string }[]
  questions: string[]
}

// The planning agent reads the repo and the idea's dossier, never the raw session logs, which could hold keys. It
// writes nothing: its plan comes back as JSON.
function planPrompt(group: QueueItem[], verdict: Verdict, dossier: string): string {
  const ideas = group.map((i) => ({
    slug: i.slug,
    title: i.title,
    sections: Object.fromEntries(i.sections.filter((s) => s.name !== VERDICT).map((s) => [s.name, s.body])),
    commits: i.commits,
  }))
  return `${CONTEXT}

This idea was picked for a post on /updates: ${verdict.reason}
Don't write the post. John writes it with an LLM. Your job is the material he starts from, gathered so he doesn't have to dig.

Patterns that worked in John's posts so far:
${patterns()}

How to title a post, from John's voice guide:
${titleGuide()}

Gather:
- Read each commit with git show, and the code it touches where the detail matters.
- Read ${dossier}/sessions.md: John's prompts and the agents' replies while he built it, scrubbed. His prompts hold what went wrong, what surprised him and what he wanted.
- Look at the pictures listed in ${dossier}/images.md. Open each that might fit with Read. Pasted ones are what John saw, screenshots are what an agent checked.

Return only a JSON object:
{"title": the short title, "longTitle": the long title,
 "angle": two or three sentences: who would read this, and the one thing they walk away with,
 "stories": [the 2 to 5 strongest moments, in the order a post would tell them, each {"moment": what happened in plain words, "quote": John's exact words from sessions.md if he said something that shows it, else "", "numbers": [numbers from commits or sessions that matter to it], "sources": [commit hashes, or "session <id> <time>"]}],
 "pictures": [up to 8, best first, each {"file": the path as images.md lists it, "shows": what a reader sees in it and which story it goes with}],
 "questions": [2 to 4 things only John knows that would make the post better: why he cared, what he felt, what he'd tell someone trying the same]}
Never invent a fact, number, motive or quote. Skip pictures that show anything private: email, messages, other apps or tabs, real people besides John, keys, account pages or a desktop. Skip near duplicates and half-loaded screens.

The idea${group.length > 1 ? "s, the first leading" : ""}:
${JSON.stringify(ideas, null, 1)}`
}

function planAgent(prompt: string, dossier: string): Promise<string> {
  const allowed = "Read Grep Glob Bash(git show:*) Bash(git log:*) Bash(git diff:*)"
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "json", "--tools", "Read,Grep,Glob,Bash", "--allowedTools", allowed, "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "project", "--add-dir", dossier],
      { cwd: REPO, stdio: ["pipe", "pipe", "pipe"] }
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

function parsePlan(text: string): Plan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error(`no JSON object in the plan: ${text.slice(0, 300)}`)
  return JSON.parse(raw.slice(start, end + 1))
}

const PLAN_SECTIONS = ["Title ideas", "Angle", "Stories", "Pictures", "Questions for John"]

function planSections(plan: Plan, dossier: string): QueueSection[] {
  const rel = path.relative(REPO, dossier)
  const stories = plan.stories
    .map((s, i) => {
      const lines = [`${i + 1}. ${s.moment}`]
      if (s.quote) lines.push(`   > ${s.quote}`)
      if (s.numbers?.length) lines.push(`   Numbers: ${s.numbers.join("; ")}`)
      if (s.sources?.length) lines.push(`   Sources: ${s.sources.join(", ")}`)
      return lines.join("\n")
    })
    .join("\n\n")
  const pictures = plan.pictures.map((p) => `- ${rel}/${p.file}: ${p.shows}`).join("\n")
  return [
    { name: "Title ideas", body: `- ${plan.title}\n- Long: ${plan.longTitle}` },
    { name: "Angle", body: plan.angle },
    { name: "Stories", body: stories || "(none found)" },
    { name: "Pictures", body: `${pictures || "(none in the sessions)"}\n\nAll of them, with the sessions: ${rel}/` },
    { name: "Questions for John", body: plan.questions.map((q) => `- ${q}`).join("\n") },
  ]
}

function setVerdict(item: QueueItem, text: string): QueueItem {
  const body = `${today()}: ${text}`
  const sections = item.sections.filter((s) => s.name !== VERDICT)
  return { ...item, sections: [...sections, { name: VERDICT, body }] }
}

async function plan(lead: QueueItem, folded: QueueItem[], verdict: Verdict) {
  console.log(`planning ${lead.slug}${folded.length ? `, with ${folded.map((f) => f.slug).join(", ")}` : ""}`)
  const t = Date.now()
  const group = [lead, ...folded]
  const d = buildDossier(lead.slug, [...new Set(group.flatMap((i) => i.sessions))], [...new Set(group.flatMap((i) => i.commits))])
  console.log(`  dossier: ${d.turns} turns, ${d.images} pictures at ${path.relative(REPO, d.dir)}`)
  const p = parsePlan(await planAgent(planPrompt(group, verdict, d.dir), d.dir))
  const item = readItem(lead.slug)
  const kept = item.sections.filter((s) => !PLAN_SECTIONS.includes(s.name) && s.name !== VERDICT)
  writeItem({
    ...item,
    // The idea keeps its title, which John may have picked. The planner's go in Title ideas beside it.
    longTitle: item.longTitle || p.longTitle,
    formats: [...new Set([...item.formats, "update"])],
    commits: [...new Set(group.flatMap((i) => i.commits))],
    sessions: [...new Set(group.flatMap((i) => i.sessions))],
    sections: [...kept, ...planSections(p, d.dir), { name: VERDICT, body: `${today()}: post. ${verdict.reason}` }],
  })
  for (const f of folded) writeItem({ ...setVerdict(readItem(f.slug), `folded into ${lead.slug}.`), status: "shelved", into: lead.slug })
  console.log(`  "${p.title}": ${p.stories.length} stories, ${p.pictures.length} pictures, ${p.questions.length} questions (${Math.round((Date.now() - t) / 1000)}s)`)
}

async function main() {
  await syncQueue()
  const queue = listQueue()
  const bySlug = new Map(queue.map((i) => [i.slug, i]))

  if (ONLY) {
    const lead = bySlug.get(ONLY)
    if (!lead) throw new Error(`no idea named ${ONLY} in content/queue`)
    await plan(lead, [], { slug: ONLY, post: true, reason: "picked by hand." })
    return syncQueue()
  }

  // An idea is judged once, except a yes that waited past --max, which goes again with the next batch.
  const judged = (i: QueueItem) => part(i, VERDICT) && !part(i, VERDICT).includes("post, waiting")
  const open = queue.filter((i) => i.status === "idea" && !i.post && !i.into && (REJUDGE || !judged(i)))
  const openSlugs = new Set(open.map((i) => i.slug))
  if (!open.length) return console.log("no new ideas to judge. Run pnpm content:mine first.")
  console.log(`judging ${open.length} ideas`)
  const verdicts = parseJsonArray<Verdict>(await claude(judgePrompt(open))).filter((v) => openSlugs.has(v.slug))
  for (const v of verdicts) v.with = (v.with ?? []).filter((s) => openSlugs.has(s) && s !== v.slug)

  for (const v of verdicts) console.log(`  ${v.post ? "POST" : "no  "} ${v.slug}: ${v.reason}${v.with?.length ? ` (with ${v.with.join(", ")})` : ""}`)
  if (DRY) return console.log("dry run, nothing written")

  const picks = verdicts.filter((v) => v.post).slice(0, MAX)
  const folding = new Set(picks.flatMap((v) => v.with ?? []).filter((s) => !picks.some((p) => p.slug === s)))
  for (const v of verdicts) {
    if (v.post || folding.has(v.slug)) continue
    writeItem(setVerdict(readItem(v.slug), `no. ${v.reason}`))
  }
  // Ideas judged worth a post but past --max keep a yes verdict and wait for the next run.
  for (const v of verdicts.filter((v) => v.post).slice(MAX)) writeItem(setVerdict(readItem(v.slug), `post, waiting. ${v.reason}`))

  for (const v of picks) {
    const folded = (v.with ?? []).map((s) => bySlug.get(s)).filter((i): i is QueueItem => !!i && i.slug !== v.slug)
    try {
      await plan(bySlug.get(v.slug)!, folded, v)
    } catch (e) {
      console.error(`  ${v.slug}: failed, ${(e as Error).message}`)
    }
  }
  if (!picks.length) console.log("nothing earned a post this time")
  await syncQueue()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
