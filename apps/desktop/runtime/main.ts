import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { locate } from "../../desktop-spike/harness/cli.mjs"
import { accountCommand, accountCommandSchema } from "./account"
import { applyCharacterUpdates } from "./characters"
import { adventureList, commandSchema, type GameCommand, game, type Packs, transitionsOf } from "./game"
import { creationOptions, type HeroCommand, type HeroDraft, heroCommand, heroCommandSchema } from "./heroes"
import { localLlm } from "./llm"
import { loadPacks } from "./packs"
import { LocalStore } from "./store"

// stdout is only the IPC reply. Existing core debugging must not expose game prompts.
console.log = console.warn = console.error = () => {}
const bundled: Packs = JSON.parse(readFileSync(join(__dirname, "packs.json"), "utf8"))
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
      const input = JSON.parse(line)
      // Account commands talk to the website only. They never open the save, so they can run beside a game action.
      if (typeof input?.kind === "string" && input.kind.startsWith("account")) {
        const site = (process.env.D20_SITE_URL ?? "https://d20adventures.com").replace(/\/$/, "")
        const response = await accountCommand(accountCommandSchema.parse(input), site, fetch, { data: dirname(savePath), bundled })
        process.stdout.write(`${JSON.stringify(response)}\n`)
        return
      }
      const command = ["heroDraft", "saveHero", "deleteHero", "paintHero", "art"].includes(input?.kind) ? heroCommandSchema.parse(input) : commandSchema.parse(input)
      const packs = await loadPacks(bundled, dirname(savePath))
      store = new LocalStore(savePath, transitionsOf(packs))
      store.acquire()
      model = localLlm("provider" in command ? command.provider : (store.state?.provider ?? "claude"), scratch, (patch) => {
        applyCharacterUpdates(store!.current().characters, patch.characterUpdates)
      })
      let hero: { draft?: HeroDraft; art?: unknown } = {}
      if ("kind" in command && ["heroDraft", "saveHero", "deleteHero", "paintHero", "art"].includes(command.kind))
        hero = await heroCommand(command as HeroCommand, store, packs, model.llm, { data: dirname(savePath), scratch })
      else await game(store, packs, model.llm)(command as GameCommand)
      const state = store.state
      const providers = ["claude", "codex", "grok", "gemini"].filter((name) => {
        try {
          locate(name)
          return true
        } catch {
          return false
        }
      })
      process.stdout.write(`${JSON.stringify({ state, providers, adventures: adventureList(packs), heroes: store.heroes(), options: creationOptions(packs), ...hero })}\n`)
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "The game action failed.", state: store?.reload() ?? null, heroes: store?.heroes() })}\n`)
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
