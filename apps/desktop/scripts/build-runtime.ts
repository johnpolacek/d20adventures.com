import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { adventureList } from "../runtime/game"

const require = createRequire(import.meta.url)
const { loadLocalWikiAdventureRuntime } = require("../../../lib/wiki-adventures/local-runtime.ts")
const { CATALOG } = require("../../../lib/store/catalog.ts") as typeof import("../../../lib/store/catalog")
const app = fileURLToPath(new URL("../", import.meta.url))
const root = resolve(app, "../..")
process.chdir(root)
// The bundled adventures, keyed by plan id. Each save plays one of them.
// D20_BUNDLE=free bundles only the free starter, as a store build does. Others then download as story packs.
const ALL = CATALOG.map((e) => e.id)
const FREE = CATALOG.filter((e) => e.free).map((e) => e.id)
const ADVENTURES = process.env.D20_BUNDLE === "free" ? FREE : ALL
const runtimes = Object.fromEntries(ALL.map((id) => [id, loadLocalWikiAdventureRuntime("realm-of-myr", id)]))
const packs = Object.fromEntries(ADVENTURES.map((id) => [id, runtimes[id]]))
// Every adventure for sale, bundled or not, so the new game screen can show the ones still locked.
const catalog = adventureList(runtimes).map(({ id, title, teaser, players }) => {
  const entry = CATALOG.find((e) => e.id === id)
  return { id, title, teaser, players, priceCents: entry?.priceCents ?? 0, free: entry?.free ?? false, listPriceCents: entry?.listPriceCents }
})
await mkdir(resolve(app, "src-tauri/resources"), { recursive: true })
await rm(resolve(app, "src-tauri/resources/pack.json"), { force: true })
await writeFile(resolve(app, "src-tauri/resources/packs.json"), JSON.stringify(packs))
await writeFile(resolve(app, "src-tauri/resources/catalog.json"), JSON.stringify(catalog))
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
// The host worker runs beside the app while it hosts a website game.
await build({
  entryPoints: [resolve(app, "runtime/host-main.ts")],
  outfile: resolve(app, "src-tauri/resources/host.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  define: { "process.env.NODE_ENV": '"production"' },
})
console.log(`Bundled ${ADVENTURES.join(", ")}, the local GM runtime, and Stageview assets.`)
