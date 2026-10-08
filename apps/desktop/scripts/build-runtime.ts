import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const { loadLocalWikiAdventureRuntime } = createRequire(import.meta.url)("../../../lib/wiki-adventures/local-runtime.ts")
const app = fileURLToPath(new URL("../", import.meta.url))
const root = resolve(app, "../..")
process.chdir(root)
// The bundled adventures, keyed by plan id. Each save plays one of them.
// D20_BUNDLE=free bundles only the free starter, as a store build does. Others then download as story packs.
const ALL = ["march-of-davos", "the-midnight-summons", "covert-cargo", "the-road-to-kordavos"]
const FREE = ["the-midnight-summons"]
const ADVENTURES = process.env.D20_BUNDLE === "free" ? FREE : ALL
const packs = Object.fromEntries(ADVENTURES.map((id) => [id, loadLocalWikiAdventureRuntime("realm-of-myr", id)]))
await mkdir(resolve(app, "src-tauri/resources"), { recursive: true })
await rm(resolve(app, "src-tauri/resources/pack.json"), { force: true })
await writeFile(resolve(app, "src-tauri/resources/packs.json"), JSON.stringify(packs))
await build({
  entryPoints: [resolve(app, "runtime/main.ts")],
  outfile: resolve(app, "src-tauri/resources/runtime.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  define: { "process.env.NODE_ENV": '"production"' },
})
await rm(resolve(app, "public"), { recursive: true, force: true })
await mkdir(resolve(app, "public/images/app"), { recursive: true })
await cp(resolve(root, "public/stage"), resolve(app, "public/stage"), { recursive: true })
for (const name of ["backgrounds", "art"]) await cp(resolve(root, `public/images/app/${name}`), resolve(app, `public/images/app/${name}`), { recursive: true })
console.log(`Bundled ${ADVENTURES.join(", ")}, the local GM runtime, and Stageview assets.`)
