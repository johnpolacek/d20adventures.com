import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { locate } from "../../desktop-spike/harness/cli.mjs"
import { describeModel } from "../../desktop-spike/harness/sessions.mjs"
import { accountCommand, accountCommandSchema } from "./account"
import { applyCharacterUpdates } from "./characters"
import { adventureList, type CatalogInfo, commandSchema, type GameCommand, game, type Packs, suggest, suggestCommandSchema, transitionsOf } from "./game"
import { creationOptions, type HeroCommand, type HeroDraft, heroCommand, heroCommandSchema } from "./heroes"
import { hostCommand, hostCommandSchema } from "./host-commands"
import { localLlm } from "./llm"
import { loadPacks } from "./packs"
import { LocalStore } from "./store"

// stdout is only the IPC reply. Existing core debugging must not expose game prompts.
console.log = console.warn = console.error = () => {}
const bundled: Packs = JSON.parse(readFileSync(join(__dirname, "packs.json"), "utf8"))
const catalog: CatalogInfo[] = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, "catalog.json"), "utf8"))
  } catch {
    return []
  }
})()
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
      // Host commands talk to the website too, reading only the hero roster.
      if (typeof input?.kind === "string" && input.kind.startsWith("host")) {
        const site = (process.env.D20_SITE_URL ?? "https://d20adventures.com").replace(/\/$/, "")
        const roster = new LocalStore(savePath)
        try {
          process.stdout.write(`${JSON.stringify(await hostCommand(hostCommandSchema.parse(input), site, () => roster.heroes()))}\n`)
        } finally {
          roster.db.close()
        }
        return
      }
      // The model one CLI runs as the GM, for the picker. It asks the CLI alone: no save, no prompt. Empty when the
      // CLI is missing, will not say, or takes too long.
      if (input?.kind === "model") {
        process.stdout.write(`${JSON.stringify({ model: await describeModel(String(input.provider), scratch).catch(() => ({})) })}\n`)
        return
      }
      // Suggested replies read the save and write nothing. They take no lock, so they can run beside a game action.
      if (input?.kind === "suggest") {
        const reader = new LocalStore(savePath)
        const save = reader.state
        reader.db.close()
        model = localLlm(save?.provider ?? "claude", scratch)
        const packs = await loadPacks(bundled, dirname(savePath))
        process.stdout.write(`${JSON.stringify({ suggestions: await suggest(save, packs, model.llm, suggestCommandSchema.parse(input)) })}\n`)
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
      process.stdout.write(
        `${JSON.stringify({ state, providers, adventures: adventureList(packs), catalog, heroes: store.heroes(), saves: store.saves(), options: creationOptions(packs), ...hero })}\n`
      )
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ error: error instanceof Error ? error.message : "The game action failed.", state: store?.reload() ?? null, heroes: store?.heroes(), saves: store?.saves() })}\n`
      )
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
