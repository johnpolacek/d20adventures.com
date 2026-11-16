import { existsSync } from "node:fs"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { adventureList } from "../runtime/game"

const require = createRequire(import.meta.url)
const { loadLocalWikiAdventureRuntime } = require("../../../lib/wiki-adventures/local-runtime.ts")
const { SHIPPED } = require("../../../asset-library/shipped.ts") as typeof import("../../../asset-library/shipped")
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
const { cityMapFor } = require("../../../lib/citymap/index.ts") as typeof import("../../../lib/citymap")
// Each pack carries the city map its encounters stand on, so the GM keeps to it.
const packs = Object.fromEntries(ADVENTURES.map((id) => [id, { ...runtimes[id], cityMap: cityMapFor(id) }]))
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
// The header's logo.
await cp(resolve(root, "public/images/d20.jpg"), resolve(app, "public/images/d20.jpg"))
// The figures the played looks stand (asset-library/play.ts), at the path the site serves them from. They are not in
// git: the asset library's own copy is taken when it is here, else the published one, kept between builds.
const FIGURE_SITE = process.env.D20_FIGURES_FROM ?? "https://d20adventures.com"
const cache = resolve(root, "node_modules/.cache/d20-figures")
const missing: string[] = []
for (const id of SHIPPED)
  for (const lod of ["lod0", "lod1"]) {
    const name = `${id}/${lod}.glb`
    const to = resolve(app, `public/asset-library/characters/${name}`)
    await mkdir(resolve(to, ".."), { recursive: true })
    const own = resolve(root, `asset-library/characters/${name}`)
    if (existsSync(own)) {
      await cp(own, to)
      continue
    }
    const kept = resolve(cache, name)
    const tag = existsSync(`${kept}.etag`) ? (await readFile(`${kept}.etag`, "utf8")).trim() : ""
    try {
      const res = await fetch(`${FIGURE_SITE}/asset-library/characters/${name}`, { headers: tag && existsSync(kept) ? { "If-None-Match": tag } : {} })
      if (res.status !== 304) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await mkdir(resolve(kept, ".."), { recursive: true })
        await writeFile(kept, Buffer.from(await res.arrayBuffer()))
        await writeFile(`${kept}.etag`, res.headers.get("etag") ?? "")
      }
    } catch (error) {
      if (!existsSync(kept)) {
        missing.push(`${name} (${error instanceof Error ? error.message : error})`)
        continue
      }
    }
    await cp(kept, to)
  }
if (missing.length) console.warn(`No figure bundled for ${missing.join(", ")}: those cast members show as cards.`)
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
console.log(`Bundled ${ADVENTURES.join(", ")}, the local GM runtime, Stageview assets, and the figures of ${SHIPPED.join(", ")}.`)
