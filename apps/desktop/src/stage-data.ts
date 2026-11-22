// The window's scenes, from the adventure packages the app carries (scripts/build-runtime.ts copies each package's
// stage/ to /adventures/<id>/stage). main.tsx waits for them before it shows anything.
import { addScenes, type SceneEntry, sceneFiles } from "./scenes"

const get = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json() as Promise<unknown>
}

async function loadAdventure(id: string) {
  const base = `/adventures/${id}/stage`
  const scenes = (await get(`${base}/scenes.json`)) as Record<string, SceneEntry>
  const need = sceneFiles(scenes)
  const load = (dir: string, names: string[]) => Promise.all(names.map(async (n) => [n, await get(`${base}/${dir}/${n}.json`)] as const)).then(Object.fromEntries)
  const [sets, stagings] = await Promise.all([load("sets", need.sets), load("stagings", need.stagings)])
  addScenes({ scenes, sets, stagings })
}

export async function loadStages() {
  const ids = (await get("/adventures/index.json")) as string[]
  await Promise.all(ids.map(loadAdventure))
}
