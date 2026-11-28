import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { NARRATOR_VOICES } from "@d20/ui/sound/narrator"
import { build } from "esbuild"
import { adventureList } from "../runtime/game"

const require = createRequire(import.meta.url)
const { loadLocalWikiAdventureRuntime } = require("../../../lib/wiki-adventures/local-runtime.ts")
const { PREMADE_FIGURES } = require("../src/figures.ts") as typeof import("../src/figures")
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
// An adventure's own art downloads when it is played (runtime/files.ts), so it leaves the bundle. What shows before any
// download stays: the stage's kit, the covers and maps, the premade heroes' art, and the title screen's scene.
const HOME = { adventure: "welcome-to-kordavos", encounter: "the-gates-of-kordavos" }
for (const dir of ["fixtures", "paintings", "art", "portraits"]) await rm(resolve(app, `public/stage/${dir}`), { recursive: true, force: true })
// Each bundled adventure's stage, from its package (scripts/adventure-packages.ts): the window fetches it at
// /adventures/<id>/stage (src/stage-data.ts), and the runtime reads it from resources (runtime/scenes-node.ts).
execFileSync(resolve(root, "node_modules/.bin/tsx"), [resolve(root, "scripts/adventure-packages.ts"), ...ADVENTURES, "--stage-only"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
await rm(resolve(app, "src-tauri/resources/adventures"), { recursive: true, force: true })
for (const into of ["public/adventures", "src-tauri/resources/adventures"]) {
  for (const id of ADVENTURES) await cp(resolve(root, `build/adventures/${id}/stage`), resolve(app, `${into}/${id}/stage`), { recursive: true })
  await writeFile(resolve(app, `${into}/index.json`), JSON.stringify(ADVENTURES))
}
// Each package's manifest, for the runtime to plan its downloads by.
for (const id of ADVENTURES) await cp(resolve(root, `build/adventures/${id}/package.json`), resolve(app, `src-tauri/resources/adventures/${id}/package.json`))
const home = JSON.parse(await readFile(resolve(root, `build/adventures/${HOME.adventure}/package.json`), "utf8")) as { needs: Record<string, string[]> }
const premade = Object.values(PREMADE_FIGURES).flatMap((f) => [f.art.front, f.art.back, f.art.portrait].map((p) => p.slice(1)))
const kept = [...(home.needs[HOME.encounter] ?? []), ...premade]
// The runtime counts these as present, so they are never downloaded (runtime/files.ts).
await writeFile(resolve(app, "src-tauri/resources/adventures/bundled.json"), JSON.stringify(kept))
for (const path of kept.filter((p) => p.startsWith("stage/"))) {
  const from = resolve(root, "public", path)
  if (!existsSync(from)) continue
  await mkdir(resolve(app, "public", path, ".."), { recursive: true })
  await cp(from, resolve(app, "public", path))
}
for (const name of ["backgrounds", "art"]) await cp(resolve(root, `public/images/app/${name}`), resolve(app, `public/images/app/${name}`), { recursive: true })
// The header's logo.
await cp(resolve(root, "public/images/d20.jpg"), resolve(app, "public/images/d20.jpg"))
// The title screen's figures, at the path the site serves them from, each with the figure.json that says how it
// moves. Every other figure downloads with its adventure. The models are not in git: the asset library's own copy is
// taken when it is here, else the published one, kept between builds.
const FIGURE_SITE = process.env.D20_FIGURES_FROM ?? "https://d20adventures.com"
const cache = resolve(root, "node_modules/.cache/d20-figures")
const missing: string[] = []
const SHIPPED = [...new Set(kept.filter((p) => p.startsWith("asset-library/characters/")).map((p) => p.split("/")[2]))]
for (const path of kept.filter((p) => p.startsWith("asset-library/characters/"))) {
    const name = path.slice("asset-library/characters/".length)
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
// The website link answers host commands while the app is open (runtime/link-main.ts).
await build({
  entryPoints: [resolve(app, "runtime/link-main.ts")],
  outfile: resolve(app, "src-tauri/resources/link.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  define: { "process.env.NODE_ENV": '"production"' },
})
// The narrator runs beside the app while it is open (runtime/narrator-main.ts). Its engine is native, so it is not
// bundled: this machine's build of it is copied in. The voices sit where Kokoro looks for them, beside its script.
const narrator = resolve(app, "src-tauri/resources/narrator")
await rm(narrator, { recursive: true, force: true })
await build({
  entryPoints: [resolve(app, "runtime/narrator-main.ts")],
  outfile: resolve(narrator, "run/narrator.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["onnxruntime-node", "onnxruntime-common"],
  // Kokoro needs no images, and sharp is native too.
  alias: { sharp: resolve(app, "runtime/no-sharp.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
})
const kokoro = await realpath(resolve(app, "node_modules/kokoro-js"))
const ort = await realpath(resolve(kokoro, "../../../onnxruntime-node@1.21.0/node_modules/onnxruntime-node"))
const ortCommon = await realpath(resolve(ort, "../onnxruntime-common"))
const modules = resolve(narrator, "node_modules")
await cp(ortCommon, resolve(modules, "onnxruntime-common"), { recursive: true })
for (const part of ["package.json", "dist"]) await cp(resolve(ort, part), resolve(modules, "onnxruntime-node", part), { recursive: true })
const binding = `bin/napi-v3/${process.platform}/${process.arch}`
await cp(resolve(ort, binding), resolve(modules, "onnxruntime-node", binding), { recursive: true })
for (const voice of NARRATOR_VOICES) await cp(resolve(kokoro, `voices/${voice.id}.bin`), resolve(narrator, `voices/${voice.id}.bin`))
console.log(`Bundled ${ADVENTURES.join(", ")}, the local GM runtime, the narrator, Stageview assets, and the figures of ${SHIPPED.join(", ")}.`)
