// The scenes StagePlay shows, from one of two sources, loaded before it renders.
//
// - `packages`: the adventure packages the desktop app carries (scripts/build-runtime.ts copies each package's stage/
//   to /adventures/<id>/stage). main.tsx loads it, and the stage plays the packages' looks and figures.
// - `repo`: the stage compiled from packages/stage/src, which the website and its dev pages load (useScenes), and
//   scripts such as stage-plans.ts. The stage plays the repo's own looks and figures.
import { useEffect, useState } from "react"
import type { Look } from "@/asset-library/looks"
import { appFilesHost } from "./files"
import { type AdventureStage, addScenes, type SceneEntry, sceneFiles } from "./scenes"

type Source = "packages" | "repo"
let source: Source = "packages"
const loaded = new Map<Source, Promise<void>>()

const get = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json() as Promise<unknown>
}

async function fromPackage(id: string, base = `/adventures/${id}/stage`): Promise<AdventureStage> {
  const scenes = (await get(`${base}/scenes.json`)) as Record<string, SceneEntry>
  const need = sceneFiles(scenes)
  const load = (dir: string, names: string[]) => Promise.all(names.map(async (n) => [n, await get(`${base}/${dir}/${n}.json`)] as const)).then(Object.fromEntries)
  const [sets, stagings, portraits] = await Promise.all([load("sets", need.sets), load("stagings", need.stagings), get(`${base}/portraits.json`).catch(() => undefined)])
  return { id, scenes, sets, stagings, portraits: portraits as AdventureStage["portraits"] }
}

async function fromRepo(): Promise<AdventureStage[]> {
  const { CARD_PORTRAITS, NPC_PORTRAITS, SCENE_FILES, SETS, STAGINGS } = await import("@d20/stage/sets")
  const npcs = Object.fromEntries((await NPC_PORTRAITS()).map((id) => [id, `/stage/portraits/${id}.webp`]))
  return Promise.all(
    Object.entries(SCENE_FILES).map(async ([id, loadScenes]) => {
      const scenes = (await loadScenes()) as Record<string, SceneEntry>
      const need = sceneFiles(scenes)
      const sets = Object.fromEntries(await Promise.all(need.sets.filter((s) => SETS[s]).map(async (s) => [s, await SETS[s]()] as const)))
      const stagings = Object.fromEntries(
        await Promise.all(need.stagings.filter((k) => STAGINGS[`${id}/${k}`]).map(async (k) => [k, await STAGINGS[`${id}/${k}`]()] as const))
      )
      return { id, scenes, sets, stagings, portraits: { cards: (await CARD_PORTRAITS[id]?.()) ?? {}, npcs } }
    })
  )
}

// A creator's own packages in the app's data folder, through the app's file server (src-tauri/src/files.rs). They are
// added last, so one with a bundled adventure's id takes its place.
let creators: Promise<{ address: string | null; ids: string[] }> | null = null
const creatorIds = () =>
  (creators ??= (async () => {
    const address = await appFilesHost()
    if (!address) return { address, ids: [] as string[] }
    return { address, ids: (await get(`${address}/creator/index.json`).catch(() => [])) as string[] }
  })())
async function fromCreator(): Promise<AdventureStage[]> {
  const { address, ids } = await creatorIds()
  const stages = await Promise.all(ids.map((id) => fromPackage(id, `${address}/creator/${id}/stage`).catch(() => null)))
  return stages.filter((s): s is AdventureStage => s !== null)
}

/** Loads the scenes once, from the packages (the desktop app) or the repo (the website, scripts). */
export function loadStages(from: Source = "packages") {
  source = from
  if (!loaded.has(from))
    loaded.set(
      from,
      (async () => {
        const stages = from === "repo" ? await fromRepo() : [...(await Promise.all(((await get("/adventures/index.json")) as string[]).map((id) => fromPackage(id)))), ...(await fromCreator())]
        // Added in the catalog's order, which decides where a portrait is found first.
        for (const stage of stages) addScenes(stage)
      })()
    )
  return loaded.get(from)!
}

// The played looks of every package's sets, and each adventure's figures, for asset-library/play.ts.
const looks: Record<string, Look> = {}
const casts: Record<string, Promise<Record<string, string>>> = {}
let packageLooks: Promise<void> | null = null
const loadLooks = () =>
  (packageLooks ??= (async () => {
    const bundled = (await get("/adventures/index.json")) as string[]
    const { address, ids } = await creatorIds()
    // A creator's looks after the bundled ones, so theirs win.
    const files = [...bundled.map((id) => `/adventures/${id}/stage/looks.json`), ...ids.map((id) => `${address}/creator/${id}/stage/looks.json`)]
    const all = await Promise.all(files.map((f) => get(f).catch(() => ({}))))
    for (const l of all) Object.assign(looks, l as Record<string, Look>)
  })())

/** asset-library/play.ts, playing the packages' looks and figures in the app and the repo's elsewhere. */
export async function loadPlay() {
  if (source === "repo") return import("@/asset-library/play")
  const [play] = await Promise.all([import("@/asset-library/play"), loadLooks()])
  play.playFrom({
    looks,
    figures: (adventure) =>
      (casts[adventure] ??= creatorIds().then(({ address, ids }) =>
        (ids.includes(adventure) ? get(`${address}/creator/${adventure}/stage/figures.json`) : get(`/adventures/${adventure}/stage/figures.json`)).catch(() => ({}))
      ) as Promise<Record<string, string>>),
  })
  return play
}

/** Whether the scenes have loaded, from the source given. The website's StagePlay waits on it. */
export function useScenes(from: Source) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void loadStages(from).then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [from])
  return ready
}
