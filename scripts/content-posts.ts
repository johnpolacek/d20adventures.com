/**
 * Update post picker: reads the mined ideas in content/queue, asks the local Claude CLI which deserve a post on
 * /updates, and drafts the best into content/updates with draft: true. Runs after `pnpm content:mine`, locally only.
 *
 *   pnpm content:posts            judge new ideas, draft up to one post
 *   pnpm content:posts --max 2    draft up to two
 *   pnpm content:posts --dry      judge and print, write nothing
 *   pnpm content:posts --rejudge  judge ideas that already have a verdict too
 *   pnpm content:posts --draft <slug>   skip judging and draft that idea
 *
 * The drafter reads the commits, the code, and a dossier of the idea's sessions (scrubbed) with every picture in them,
 * and puts the pictures it uses in public/images/updates/<post>/ for pnpm stage:sync to upload once John checks it.
 *
 * Each judged idea gets an "Update verdict" section, so it isn't judged twice. A drafted idea becomes status draft
 * with post set, and ideas folded into it become shelved with into set. Nothing is committed, published or posted.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { briefFor } from "../lib/content-queue/brief"
import { listQueue, readItem, writeItem, type QueueItem } from "../lib/content-queue/store"
import { syncQueue } from "../lib/content-queue/sync"
import { buildDossier } from "./content-dossier"
import { CONTEXT, claude, parseJsonArray, titleGuide } from "./content-mine"

const REPO = path.resolve(__dirname, "..")
const UPDATES = path.join(REPO, "content/updates")
const SHARED_WRITING = "/Users/johnpolacek/Projects/johnpolacek-com-nextjs/writing"
const VERDICT = "Update verdict"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const DRY = process.argv.includes("--dry")
const REJUDGE = process.argv.includes("--rejudge")
const MAX = Number(arg("max") ?? 1)
const ONLY = arg("draft")
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

// The drafting agent reads the repo and the idea's dossier: its sessions, scrubbed, and the pictures in them. It never
// gets the raw session logs, which could hold keys.
function draftPrompt(lead: QueueItem, folded: QueueItem[], verdict: Verdict, slug: string, dossier: string): string {
  const merged: QueueItem = {
    ...lead,
    title: verdict.title || lead.title,
    longTitle: verdict.longTitle || lead.longTitle,
    commits: [...new Set([lead, ...folded].flatMap((i) => i.commits))],
    sessions: [],
    sections: lead.sections.map((s) => ({
      ...s,
      body: [s.body, ...folded.map((f) => part(f, s.name))].filter(Boolean).join("\n\n"),
    })),
  }
  const pictures = `public/images/updates/${slug}`
  return `${briefFor(merged)}

Why it was picked for /updates: ${verdict.reason}

For this run:
- Read the commits with git show and git log, and the code they touch.
- Read ${dossier}/sessions.md: John's prompts and the agents' replies while he built it, scrubbed. His prompts hold the reasons, what went wrong and what he wanted. Use his words for the human moments, and quote him only verbatim.
- Look at the pictures listed in ${dossier}/images.md. Open each that might fit with Read. Pasted ones are what John saw and shared, screenshots are what the agent checked.
- Use the pictures that show what a paragraph says: a before and after, a bug, the result. Skip near duplicates, half-loaded pages and plain terminal text.
- Never use a picture that shows anything private: email, messages, other apps or tabs, names of real people besides John, keys, account pages, or a desktop. When unsure, leave it out.
- For each picture you use, convert it into ${pictures}/ with a short kebab-case name: \`mkdir -p ${pictures}\`, then \`cwebp -q 85 -resize <w> 0 <src> -o ${pictures}/<name>.webp\`, at most 1600 wide. Measure it with \`sips -g pixelWidth -g pixelHeight\`. Reference it as https://d20-public.s3.us-east-1.amazonaws.com/images/updates/${slug}/<name>.webp with its real width and height, and set the frontmatter image to the strongest one.
- Write exactly one post, content/updates/${slug}.md, with date: ${new Date().toISOString().slice(0, 10)} and draft: true.
- Right after the frontmatter, put an HTML comment listing what is still missing: pictures or clips the post wants that the dossier didn't have, and how to make them.
- Don't upload, commit, publish or post. When done, reply with one line: the post and how many pictures it uses.`
}

function draftAgent(prompt: string, dossier: string): Promise<string> {
  const dirs = ["--add-dir", dossier, ...(fs.existsSync(SHARED_WRITING) ? ["--add-dir", SHARED_WRITING] : [])]
  const allowed = [
    "Read Grep Glob Write Edit",
    "Bash(git show:*) Bash(git log:*) Bash(git diff:*) Bash(curl -s https://johnpolacek.com/voice.md)",
    "Bash(mkdir -p public/images/updates/*) Bash(cwebp:*) Bash(sips -g:*)",
  ].join(" ")
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "json", "--tools", "Read,Grep,Glob,Write,Edit,Bash", "--allowedTools", allowed, "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "project", ...dirs],
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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

function setVerdict(item: QueueItem, text: string): QueueItem {
  const body = `${new Date().toISOString().slice(0, 10)}: ${text}`
  const sections = item.sections.filter((s) => s.name !== VERDICT)
  return { ...item, sections: [...sections, { name: VERDICT, body }] }
}

async function draft(lead: QueueItem, folded: QueueItem[], verdict: Verdict) {
  let slug = slugify(verdict.title || lead.title)
  while (fs.existsSync(path.join(UPDATES, `${slug}.md`))) slug += "-2"
  console.log(`drafting ${slug}${folded.length ? `, with ${folded.map((f) => f.slug).join(", ")}` : ""}`)
  const t = Date.now()
  const group = [lead, ...folded]
  const d = buildDossier(slug, [...new Set(group.flatMap((i) => i.sessions))], [...new Set(group.flatMap((i) => i.commits))])
  console.log(`  dossier: ${d.turns} turns, ${d.images} pictures at ${d.dir}`)
  const reply = await draftAgent(draftPrompt(lead, folded, verdict, slug, d.dir), d.dir)
  const file = path.join(UPDATES, `${slug}.md`)
  if (!fs.existsSync(file)) throw new Error(`no draft written for ${slug}: ${reply.slice(0, 400)}`)
  if (!/^draft:\s*true/m.test(fs.readFileSync(file, "utf8"))) console.warn(`  ${slug}.md is missing draft: true, check it before pushing`)
  writeItem({ ...setVerdict(readItem(lead.slug), `post. ${verdict.reason}`), status: "draft", post: slug })
  for (const f of folded) writeItem({ ...setVerdict(readItem(f.slug), `folded into ${slug}.`), status: "shelved", into: lead.slug })
  console.log(`  wrote content/updates/${slug}.md (${Math.round((Date.now() - t) / 1000)}s): ${reply.trim().slice(0, 200)}`)
  console.log(`  after checking it: pnpm stage:sync public/images/updates/${slug}`)
}

async function main() {
  await syncQueue()
  const queue = listQueue()
  const bySlug = new Map(queue.map((i) => [i.slug, i]))

  if (ONLY) {
    const lead = bySlug.get(ONLY)
    if (!lead) throw new Error(`no idea named ${ONLY} in content/queue`)
    await draft(lead, [], { slug: ONLY, post: true, reason: "picked by hand." })
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
      await draft(bySlug.get(v.slug)!, folded, v)
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
