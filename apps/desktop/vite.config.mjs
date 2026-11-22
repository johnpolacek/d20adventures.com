import { spawn } from "node:child_process"
import { createReadStream, mkdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import tailwind from "@tailwindcss/postcss"
import { defineConfig } from "vite"

// The app in a browser tab, without Tauri (development only). The page's bridge calls arrive at /__preview and are
// answered as Rust would: game commands run the same runtime script against a scratch data folder, or the folder in
// D20_PREVIEW_DATA_DIR. Commands that start the GM's CLI are refused unless D20_PREVIEW_GM is set, and without it the
// CLIs are not asked for their models. D20_REQUIRE_ACCOUNT shows the link step, as it does in the app.
const GM_COMMANDS = ["start", "reply", "continue", "suggest", "heroDraft", "paintHero"]
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
    if (cmd === "game_command" || cmd === "suggest_command") {
      if (GM_COMMANDS.includes(args?.command?.kind) && !process.env.D20_PREVIEW_GM) throw new Error("The preview does not run the GM.")
      return game(args.command)
    }
    if (cmd === "model_command") return process.env.D20_PREVIEW_GM ? game({ kind: "model", provider: args?.provider }) : { model: {} }
    if (cmd === "account_info") return { required: Boolean(process.env.D20_REQUIRE_ACCOUNT), linked: false }
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

// While the app is being developed, the stage's files come from the workspace: public/stage and the asset library's
// figures (asset-library/characters, not in git), so new art and a rebuilt figure show on the next reload. One the
// workspace lacks is sent on to the asset host, as an adventure's downloaded files would be. The Tauri window reads
// the same through its d20:// files (src-tauri/src/files.rs). The built app is not touched.
const ASSET_HOST = "https://d1dkwd3w4hheqw.cloudfront.net"
const TYPES = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg" }
function figures() {
  const repo = fileURLToPath(new URL("../..", import.meta.url))
  return {
    name: "d20-desktop-stage-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0])
        const under = path.startsWith("/stage/") ? join(repo, "public") : path.startsWith("/asset-library/characters/") ? repo : null
        if (!under || path.includes("..")) return next()
        const file = join(under, path)
        const size = statSync(file, { throwIfNoEntry: false })?.size
        if (!size) {
          res.statusCode = 302
          res.setHeader("Location", `${ASSET_HOST}${path}`)
          return res.end()
        }
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
        res.setHeader("Content-Length", size)
        res.setHeader("Cache-Control", "no-store")
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [preview(), figures()],
  resolve: {
    // One React for the app and @d20/ui. Two copies break every hook.
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^@\/lib\/utils$/, replacement: fileURLToPath(new URL("./src/utils.ts", import.meta.url)) },
      // Only these folders of the repo root: the built looks, the city maps and the content they read. Site code is
      // out of reach, so the app gets its UI from @d20/ui.
      { find: /^@\/(asset-library|content|lib\/citymap)(\/.*)?$/, replacement: fileURLToPath(new URL("../../$1$2", import.meta.url)) },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  clearScreen: false,
  build: {
    target: "safari16",
    // The app loads from disk, so one large chunk costs nothing.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // "use client" in components shared with the website means nothing here, and its sourcemap lookups fail.
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" || warning.code === "SOURCEMAP_ERROR") return
        warn(warning)
      },
    },
  },
})
