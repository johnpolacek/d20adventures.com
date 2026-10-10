import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import tailwind from "@tailwindcss/postcss"
import { defineConfig } from "vite"

// The app in a browser tab, without Tauri (development only). The page's bridge calls arrive at /__preview and are
// answered as Rust would: game commands run the same runtime script against a scratch data folder, or the folder in
// D20_PREVIEW_DATA_DIR. Commands that start the GM's CLI are refused unless D20_PREVIEW_GM is set.
const GM_COMMANDS = ["start", "reply", "continue", "heroDraft", "paintHero"]
function preview() {
  const data = process.env.D20_PREVIEW_DATA_DIR ?? join(tmpdir(), "d20-desktop-preview")
  const runtime = fileURLToPath(new URL("./src-tauri/resources/runtime.cjs", import.meta.url))
  const game = (command) =>
    new Promise((done, fail) => {
      mkdirSync(data, { recursive: true })
      const child = spawn(process.execPath, [runtime, join(data, "adventure.sqlite")], { cwd: data, stdio: ["pipe", "pipe", "ignore"] })
      let out = ""
      child.stdout.on("data", (chunk) => {
        out += chunk
      })
      child.on("error", fail)
      child.on("close", () => {
        try {
          done(JSON.parse(out))
        } catch {
          fail(new Error("The local GM returned an unreadable response."))
        }
      })
      child.stdin.end(`${JSON.stringify(command)}\n`)
    })
  const answer = async (cmd, args) => {
    if (cmd === "game_command") {
      if (GM_COMMANDS.includes(args?.command?.kind) && !process.env.D20_PREVIEW_GM) throw new Error("The preview does not run the GM.")
      return game(args.command)
    }
    if (cmd === "account_info") return { required: false, linked: false }
    if (cmd === "account_command") return { account: { linked: false } }
    if (cmd === "host_running") return { adventureId: null, event: null }
    if (cmd === "is_fullscreen" || cmd === "toggle_fullscreen") return false
    return null
  }
  return {
    name: "d20-desktop-preview",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__preview", (req, res) => {
        let body = ""
        req.on("data", (chunk) => {
          body += chunk
        })
        req.on("end", () => {
          Promise.resolve()
            .then(() => JSON.parse(body))
            .then(({ cmd, args }) => answer(cmd, args))
            .then((value) => res.setHeader("Content-Type", "application/json").end(JSON.stringify(value ?? null)))
            .catch((error) => {
              res.statusCode = 500
              res.end(error instanceof Error ? error.message : String(error))
            })
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [preview()],
  resolve: {
    alias: [
      { find: /^@\/lib\/utils$/, replacement: fileURLToPath(new URL("./src/utils.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../../", import.meta.url)) },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  clearScreen: false,
  build: { target: "safari16" },
})
