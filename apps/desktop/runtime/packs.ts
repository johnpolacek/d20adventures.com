import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { packVersion, readPack, sha256Hex } from "@d20/gm-core/packs"
import type { Pack, Packs } from "./game"

// Story packs downloaded for owned adventures sit in the app data folder beside the save, one file per adventure.
// A downloaded pack takes the place of a bundled one: the website is the source of truth when it was last reached.
export const packDir = (data: string) => join(data, "packs")

async function downloaded(data: string): Promise<Record<string, { version: string; runtime: Pack }>> {
  let names: string[] = []
  try {
    names = readdirSync(packDir(data)).filter((n) => /^[a-z0-9-]+\.json$/.test(n))
  } catch {
    return {}
  }
  const found: Record<string, { version: string; runtime: Pack }> = {}
  for (const name of names) {
    const id = name.slice(0, -5)
    try {
      const pack = await readPack(JSON.parse(readFileSync(join(packDir(data), name), "utf8")), id)
      if (pack) found[id] = { version: pack.version, runtime: pack.runtime as Pack }
    } catch {
      // A damaged file is skipped. The next sync downloads it again.
    }
  }
  return found
}

export async function loadPacks(bundled: Packs, data: string): Promise<Packs> {
  const packs = { ...bundled }
  for (const [id, pack] of Object.entries(await downloaded(data))) packs[id] = pack.runtime
  return packs
}

type Owned = { id: string; owned: boolean; pack?: { version: string } }

/** Downloads the current story pack of each owned adventure the app lacks. Returns the ids that changed. */
export async function syncPacks(opts: { library: Owned[]; bundled: Packs; data: string; fetchPack: (id: string) => Promise<Response> }): Promise<{ updated: string[]; failed: string[] }> {
  const have = await downloaded(opts.data)
  const updated: string[] = []
  const failed: string[] = []
  for (const entry of opts.library) {
    if (!entry.owned || !entry.pack) continue
    const want = entry.pack.version
    if (have[entry.id]?.version === want) continue
    const file = join(packDir(opts.data), `${entry.id}.json`)
    if (opts.bundled[entry.id] && (await packVersion(opts.bundled[entry.id])) === want) {
      // The app already ships this version. Drop an older download so the bundled one plays.
      if (have[entry.id]) {
        rmSync(file, { force: true })
        updated.push(entry.id)
      }
      continue
    }
    try {
      const res = await opts.fetchPack(entry.id)
      const body = await res.text()
      if (!res.ok || res.headers.get("x-pack-sha256") !== (await sha256Hex(body))) throw new Error("incomplete download")
      const pack = await readPack(JSON.parse(body), entry.id)
      if (!pack || pack.version !== want) throw new Error("unexpected pack")
      mkdirSync(packDir(opts.data), { recursive: true })
      // Write then rename, so a game reading packs never sees half a file.
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, body)
      renameSync(tmp, file)
      updated.push(entry.id)
    } catch {
      failed.push(entry.id)
    }
  }
  return { updated, failed }
}
