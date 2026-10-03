import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { locate } from "../../desktop-spike/harness/cli.mjs"
import { commandSchema, game, type Pack } from "./game"
import { localLlm } from "./llm"
import { LocalStore } from "./store"

// stdout is only the IPC reply. Existing core debugging must not expose game prompts.
console.log = console.warn = console.error = () => {}
const pack: Pack = JSON.parse(readFileSync(join(__dirname, "pack.json"), "utf8"))
const savePath = process.argv[2]
const scratch = mkdtempSync(join(dirname(savePath), "session-"))
let store: LocalStore | undefined
let model: ReturnType<typeof localLlm> | undefined
let finished = false
function cleanup() {
  if (finished) return
  finished = true
  model?.close()
  store?.close()
  rmSync(scratch, { recursive: true, force: true })
}
process.on("SIGTERM", () => {
  cleanup()
  process.exit(0)
})
process.on("SIGINT", () => {
  cleanup()
  process.exit(0)
})
const parentWatch = setInterval(() => {
  if (process.ppid === 1) {
    cleanup()
    process.exit(0)
  }
}, 2000)
const deadline = setTimeout(() => {
  cleanup()
  process.exit(1)
}, 480_000)
const lines = createInterface({ input: process.stdin })
async function main() {
  for await (const line of lines) {
    try {
      const command = commandSchema.parse(JSON.parse(line))
      store = new LocalStore(savePath, pack.artifacts.graph.encounterTransitions)
      store.acquire()
      model = localLlm(command.kind === "start" ? command.provider : (store.state?.provider ?? "claude"), scratch)
      const state = await game(store, pack, model.llm)(command)
      const providers = ["claude", "codex", "grok", "gemini"].filter((name) => {
        try {
          locate(name)
          return true
        } catch {
          return false
        }
      })
      process.stdout.write(`${JSON.stringify({ state, providers })}\n`)
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "The game action failed.", state: store?.reload() ?? null })}\n`)
    } finally {
      clearInterval(parentWatch)
      clearTimeout(deadline)
      cleanup()
      lines.close()
    }
    break
  }
}
void main()
