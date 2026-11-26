import { spawn } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

// The playtest scorecard: every plan, played some times each, summed into one table. One run of a plan is noisy, as the
// path drifts with the GM, so a change is judged on the sum. The code is bundled when the sweep starts, so the source
// can be edited while it runs, and the next sweep plays the edit.
//   pnpm --dir apps/desktop playtest:sweep [<plan> ...] [--runs 2] [--jobs 4] [--label name]
//   pnpm --dir apps/desktop playtest:sweep --score <label>
//   pnpm --dir apps/desktop playtest:sweep --compare <before scorecard.json> <after scorecard.json>
// Each sweep writes scorecard.json beside its runs, under .logs/sweeps/<label>.

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const valued = new Set(["--jobs", "--runs", "--label", "--compare"])
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1] ?? ""))

type Kind = { n: number; avgMs: number; maxMs: number }
type Summary = {
  plan: string
  ended: string
  calls?: Record<string, Kind>
  deadContinues?: number
  repeats?: { speaker: string; text: string; turns: number[] }[]
  rulings?: unknown[]
  errors?: string[]
  minutes?: number
}
// A GM prompt, told by its opening words, with its calls' time and output tokens.
type Prompt = { n: number; avgMs: number; maxMs: number; avgOut: number }
type Card = {
  label: string
  runs: number
  plans: string[]
  ended: Record<string, number>
  calls: Record<string, Kind>
  deadContinues: number
  repeats: number
  rulings: number
  errors: number
  minutes: number
  prompts: Record<string, Prompt>
  each: { plan: string; run: number; ended: string; minutes?: number; dead?: number; repeats: string[]; errors: string[] }[]
}

const add = (into: Record<string, Kind>, k: string, v: Kind) => {
  const t = (into[k] ??= { n: 0, avgMs: 0, maxMs: 0 })
  t.avgMs = Math.round((t.avgMs * t.n + v.avgMs * v.n) / (t.n + v.n || 1))
  t.n += v.n
  t.maxMs = Math.max(t.maxMs, v.maxMs)
}

// The prompts a run's GM trace holds, by the first words after its opening blank lines.
function promptsOf(file: string, into: Record<string, Prompt>) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue
    const t = JSON.parse(line) as { ms: number; head: string; output: number }
    // A prompt that opens on a label ("Adventure:", "Context:", "Encounter Intro:") is told by the label alone.
    const head = t.head.trim().replace(/\s+/g, " ")
    const label = head.match(/^([A-Z][\w ]{0,20}):/)?.[1]
    const k = label ? `${label}:` : head.slice(0, 40)
    const p = (into[k] ??= { n: 0, avgMs: 0, maxMs: 0, avgOut: 0 })
    p.avgMs = Math.round((p.avgMs * p.n + t.ms) / (p.n + 1))
    p.avgOut = Math.round((p.avgOut * p.n + t.output) / (p.n + 1))
    p.n++
    p.maxMs = Math.max(p.maxMs, t.ms)
  }
}

function score(label: string, out: string, plans: string[], runs: number): Card {
  const card: Card = { label, runs, plans, ended: {}, calls: {}, deadContinues: 0, repeats: 0, rulings: 0, errors: 0, minutes: 0, prompts: {}, each: [] }
  for (const plan of plans)
    for (let r = 1; r <= runs; r++) {
      const dir = join(out, `run${r}`, plan)
      const file = join(dir, "summary.json")
      const s: Summary = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { plan, ended: "no summary" }
      const ended = s.ended.startsWith("crashed") ? "crashed" : s.ended
      card.ended[ended] = (card.ended[ended] ?? 0) + 1
      for (const [k, v] of Object.entries(s.calls ?? {})) add(card.calls, k, v)
      card.deadContinues += s.deadContinues ?? 0
      card.repeats += s.repeats?.length ?? 0
      card.rulings += s.rulings?.length ?? 0
      card.errors += s.errors?.length ?? 0
      card.minutes = Math.round((card.minutes + (s.minutes ?? 0)) * 10) / 10
      promptsOf(join(dir, "gm-trace.jsonl"), card.prompts)
      card.each.push({ plan, run: r, ended: s.ended, minutes: s.minutes, dead: s.deadContinues, repeats: (s.repeats ?? []).map((x) => `${x.speaker}: ${x.text}`), errors: s.errors ?? [] })
    }
  return card
}

const sec = (ms?: number) => (ms === undefined ? "-" : `${(ms / 1000).toFixed(1)}s`)

function table(cards: Card[]) {
  const rows: [string, ...string[]][] = [["", ...cards.map((c) => c.label)]]
  const row = (name: string, f: (c: Card) => string) => rows.push([name, ...cards.map(f)])
  row("runs", (c) => `${c.plans.length}×${c.runs}`)
  row("ended", (c) => Object.entries(c.ended).map(([k, v]) => `${k} ${v}`).join(", "))
  row("minutes played", (c) => String(c.minutes))
  row("dead continues", (c) => String(c.deadContinues))
  row("REPEAT lines", (c) => String(c.repeats))
  row("rulings", (c) => String(c.rulings))
  row("errors", (c) => String(c.errors))
  const kinds = [...new Set(cards.flatMap((c) => Object.keys(c.calls)))]
  for (const k of kinds) row(`${k} n / avg / max`, (c) => (c.calls[k] ? `${c.calls[k].n} / ${sec(c.calls[k].avgMs)} / ${sec(c.calls[k].maxMs)}` : "-"))
  // The GM prompts that take the most time in all, first.
  const total = (k: string) => Math.max(...cards.map((c) => (c.prompts[k] ? c.prompts[k].n * c.prompts[k].avgMs : 0)))
  const prompts = [...new Set(cards.flatMap((c) => Object.keys(c.prompts)))].sort((a, b) => total(b) - total(a)).slice(0, 8)
  for (const k of prompts) row(`"${k}" n / avg / out`, (c) => (c.prompts[k] ? `${c.prompts[k].n} / ${sec(c.prompts[k].avgMs)} / ${c.prompts[k].avgOut}` : "-"))
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
  for (const r of rows) console.log(r.map((cell, i) => cell.padEnd(widths[i])).join(" | "))
}

function detail(card: Card) {
  for (const e of card.each) {
    console.log(`${e.plan} run ${e.run}: ${e.ended}${e.minutes ? ` in ${e.minutes} min` : ""}, ${e.dead ?? "?"} dead`)
    for (const r of e.repeats) console.log(`  REPEAT ${r}`)
    for (const x of e.errors) console.log(`  ERROR ${x.slice(0, 160)}`)
  }
}

async function main() {
  if (argv.includes("--compare")) {
    const files = [opt("--compare")!, ...names]
    const cards = files.map((f) => JSON.parse(readFileSync(resolve(f), "utf8")) as Card)
    table(cards)
    return
  }
  // --score <label>: the scorecard of a sweep already run, again.
  if (argv.includes("--score")) {
    const label = names[0]
    const out = resolve(here, "../.logs/sweeps", label)
    const old = JSON.parse(readFileSync(join(out, "scorecard.json"), "utf8")) as Card
    const card = score(label, out, old.plans, old.runs)
    writeFileSync(join(out, "scorecard.json"), `${JSON.stringify(card, null, 2)}\n`)
    table([card])
    return
  }
  const all = Object.keys(JSON.parse(readFileSync(join(here, "playtest-plans.json"), "utf8")))
  const plans = names.length ? names : all
  for (const p of plans) if (!all.includes(p)) throw new Error(`No plan ${p}. Plans: ${all.join(", ")}`)
  const runs = Number(opt("--runs") ?? 2)
  const jobs = Math.max(1, Math.min(4, Number(opt("--jobs") ?? 4)))
  const label = opt("--label") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
  const out = resolve(here, "../.logs/sweeps", label)
  mkdirSync(out, { recursive: true })
  // The bundle sits beside playtest.ts, so the paths it finds from its own file are the same.
  const bundle = join(here, `.playtest-${label}.mjs`)
  await build({
    entryPoints: [join(here, "playtest.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  })
  // Written first, so a sweep cut short can be scored with --score.
  writeFileSync(join(out, "scorecard.json"), `${JSON.stringify({ label, runs, plans }, null, 2)}\n`)
  console.log(`sweep ${label}: ${plans.length} plans × ${runs} runs, ${jobs} at once, into ${out}`)
  const queue = Array.from({ length: runs }, (_, r) => plans.map((plan) => ({ plan, run: r + 1 }))).flat()
  const started = Date.now()
  try {
    await Promise.all(
      Array.from({ length: jobs }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const into = join(out, `run${job.run}`)
          mkdirSync(join(into, job.plan), { recursive: true })
          const engine = createWriteStream(join(into, job.plan, "engine.log"))
          const child = spawn(process.execPath, [...process.execArgv, bundle, job.plan, "--single", "--out", into], { stdio: ["ignore", "pipe", "pipe"] })
          child.stdout.pipe(engine)
          child.stderr.pipe(engine)
          await new Promise((done) => child.on("exit", done))
          const file = join(into, job.plan, "summary.json")
          const s = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Summary) : undefined
          console.log(`${job.plan} run ${job.run}: ${s?.ended ?? "no summary"}${s?.minutes ? ` in ${s.minutes} min` : ""} (${Math.round((Date.now() - started) / 60000)} min in)`)
        }
      })
    )
  } finally {
    rmSync(bundle, { force: true })
  }
  const card = score(label, out, plans, runs)
  writeFileSync(join(out, "scorecard.json"), `${JSON.stringify(card, null, 2)}\n`)
  detail(card)
  console.log("")
  table([card])
  console.log(`\nscorecard: ${join(out, "scorecard.json")}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
