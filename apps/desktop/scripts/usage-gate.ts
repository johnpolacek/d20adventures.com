import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"

// What a playtest or a probe run will spend, asked before it starts. The run's size and its tokens projected from past
// runs, and the Claude plan's usage window as the CLI last reported it (runtime/cli.mjs writes it to LIMIT_FILE on each
// call). Two full sweeps and two full probe runs once spent a week's usage in an afternoon.
// --yes skips the question. Without a terminal to ask in, the run stops after the summary: an agent shows it to the
// person and runs again with --yes once they agree.

const logs = resolve(fileURLToPath(new URL(".", import.meta.url)), "../.logs")
export const LIMIT_FILE = join(logs, "usage-limit.json")
export const PROBE_TRACE = join(logs, "check-probe-trace.jsonl")

type Line = { input?: number; written?: number; read?: number; output?: number }
type Cost = { calls: number; fresh: number; cached: number }
const lines = (file: string): Line[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Line]
      } catch {
        return []
      }
    })
const costOf = (calls: Line[]): Cost => ({
  calls: calls.length,
  fresh: calls.reduce((sum, c) => sum + (c.input ?? 0) + (c.written ?? 0) + (c.output ?? 0), 0),
  cached: calls.reduce((sum, c) => sum + (c.read ?? 0), 0),
})
const mean = (costs: Cost[]): Cost | undefined =>
  costs.length
    ? { calls: costs.reduce((s, c) => s + c.calls, 0) / costs.length, fresh: costs.reduce((s, c) => s + c.fresh, 0) / costs.length, cached: costs.reduce((s, c) => s + c.cached, 0) / costs.length }
    : undefined

/** One run of each plan, averaged over every past sweep that traced it: .logs/sweeps/<label>/run<n>/<plan>/gm-trace.jsonl. */
export function planCosts(plans: readonly string[]): Map<string, Cost | undefined> {
  const seen = new Map<string, Cost[]>(plans.map((plan) => [plan, []]))
  const sweeps = join(logs, "sweeps")
  if (existsSync(sweeps))
    for (const label of readdirSync(sweeps))
      for (const run of readdirSync(join(sweeps, label)).filter((name) => name.startsWith("run")))
        for (const plan of plans) {
          const file = join(sweeps, label, run, plan, "gm-trace.jsonl")
          const calls = existsSync(file) ? lines(file) : []
          if (calls.length) seen.get(plan)!.push(costOf(calls))
        }
  return new Map([...seen].map(([plan, costs]) => [plan, mean(costs)]))
}

/** One probe's call, averaged over the probes traced before. */
export function probeCost(): Cost | undefined {
  const calls = existsSync(PROBE_TRACE) ? lines(PROBE_TRACE) : []
  return calls.length ? { calls: 1, fresh: costOf(calls).fresh / calls.length, cached: costOf(calls).cached / calls.length } : undefined
}

type Window = { utilization?: number; resetsAt?: number; status?: string }
type Limit = { at: number; status?: string; rateLimitType?: string; resetsAt?: number; isUsingOverage?: boolean; unifiedWindows?: Record<string, Window> }

const when = (seconds?: number) => (seconds ? new Date(seconds * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "unknown")
const ago = (ms: number) => {
  const minutes = Math.round((Date.now() - ms) / 60000)
  return minutes < 60 ? `${minutes} min ago` : minutes < 2880 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`
}
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

/** The usage window lines, as the CLI last reported them. */
export function limitLines(): string[] {
  if (!existsSync(LIMIT_FILE)) return ["usage: not reported yet. The first call of this run records it."]
  const limit = JSON.parse(readFileSync(LIMIT_FILE, "utf8")) as Limit
  const windows = Object.entries(limit.unifiedWindows ?? {})
  const out = windows.length
    ? windows.map(([name, w]) => `usage: ${name.replace("_", "-")} window ${Math.round((w.utilization ?? 0) * 100)}% used, ${w.status ?? "unknown"}, resets ${when(w.resetsAt)}`)
    : [`usage: ${limit.rateLimitType ?? "window"} ${limit.status ?? "unknown"}, resets ${when(limit.resetsAt)}`]
  if (limit.isUsingOverage) out.push("usage: calls are billed as overage now")
  out.push(`usage: as reported ${ago(limit.at)}`)
  return out
}

/** Prints what the run will spend and asks to go on. Returns only when the run may start. */
export async function usageGate(what: string, projected: { calls: number; fresh: number; cached: number } | undefined, unknown: string[] = []): Promise<void> {
  process.env.D20_LIMIT_FILE = LIMIT_FILE
  console.log(`\n${what}`)
  console.log(
    projected
      ? `projected: about ${Math.round(projected.calls)} model calls, ${tokens(projected.fresh)} fresh tokens and ${tokens(projected.cached)} cache reads`
      : "projected: no past runs traced to project from"
  )
  if (unknown.length) console.log(`projected: no past trace for ${unknown.join(", ")}, so they are left out`)
  for (const line of limitLines()) console.log(line)
  if (process.argv.includes("--yes")) return
  if (!process.stdin.isTTY) {
    console.log("\nNot started. Show this to the person, and run again with --yes once they agree.")
    process.exit(2)
  }
  const ask = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await ask.question("Start? [y/N] ")).trim().toLowerCase()
  ask.close()
  if (answer !== "y" && answer !== "yes") {
    console.log("Not started.")
    process.exit(0)
  }
}
