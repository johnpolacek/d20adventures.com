import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import type { Packs } from "./game"
import { type HostPost, hostLoop, remoteStore } from "./host"
import { localLlm } from "./llm"
import { loadPacks } from "./packs"

// The host worker: a long-lived process while the host's app hosts a game. Rust starts it with one line of JSON
// on stdin and stops it by closing stdin or with SIGTERM. Each stdout line is an event for the app.
console.log = console.warn = console.error = () => {}
const bundled: Packs = JSON.parse(readFileSync(join(__dirname, "packs.json"), "utf8"))
type Start = { adventureId: string; provider: string; token: string; site: string; data: string }
let stopped = false
let wake: (() => void) | undefined
const stop = () => {
  stopped = true
  wake?.()
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
const parentWatch = setInterval(() => process.ppid === 1 && stop(), 2000)
const emit = (event: unknown) => process.stdout.write(`${JSON.stringify(event)}\n`)

async function main() {
  const lines = createInterface({ input: process.stdin })
  let start: Start | undefined
  for await (const line of lines) {
    start = JSON.parse(line) as Start
    break
  }
  // Closing stdin stops the worker.
  process.stdin.on("end", stop)
  if (!start) return
  const scratch = mkdtempSync(join(start.data, "host-"))
  const model = localLlm(start.provider, scratch, undefined, false)
  try {
    const post: HostPost = async (path, body) => {
      const res = await fetch(`${start.site}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${start.token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `The website answered ${res.status}.`)
      return json
    }
    const packs = await loadPacks(bundled, start.data)
    await hostLoop({
      adventureId: start.adventureId,
      post,
      store: remoteStore(post),
      packs,
      llm: model.llm,
      emit,
      stopped: () => stopped,
      wait: (ms) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms)
          wake = () => {
            clearTimeout(timer)
            resolve()
          }
        }),
    })
  } finally {
    model.close()
    rmSync(scratch, { recursive: true, force: true })
    clearInterval(parentWatch)
  }
}
void main().then(
  () => process.exit(0),
  (error) => {
    emit({ type: "offline", error: error instanceof Error ? error.message : String(error) })
    process.exit(1)
  }
)
