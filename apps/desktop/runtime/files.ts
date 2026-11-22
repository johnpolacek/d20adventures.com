// An adventure's art and figures, downloaded into the data folder (files/<path>) when it is played, from the asset
// host every package's files are published to. The window reads them through the app's d20:// files (src-tauri/src/
// files.rs) and asks for them in batches (src/files.ts), the scene about to show first, so play starts once its own
// files are in and the rest arrive behind it.
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { stageRoot } from "./scenes-node"

const HOST = (process.env.D20_ASSET_HOST ?? "https://d1dkwd3w4hheqw.cloudfront.net").replace(/\/$/, "")

interface Manifest {
  files: Record<string, { sha256: string; bytes: number }>
  figureFiles?: Record<string, { bytes: number }>
  needs?: Record<string, string[]>
}

const manifestOf = (adventureId: string): Manifest | null => {
  const file = join(stageRoot(), adventureId, "package.json")
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Manifest) : null
}

// The files the app carries with its window, which need no download (scripts/build-runtime.ts).
let carried: Set<string> | null = null
const bundled = () => {
  const file = join(stageRoot(), "bundled.json")
  carried ??= new Set(existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [])
  return carried
}

function have(data: string, path: string, bytes: number, exact: boolean) {
  if (bundled().has(path)) return true
  const file = join(data, "files", path)
  if (!existsSync(file)) return false
  return !exact || statSync(file).size === bytes
}

export type FilePlan = { need: { path: string; bytes: number }[]; rest: { path: string; bytes: number }[] }

/** What is still to download: the encounter's own files, then the rest of the adventure's. */
export function filesPlan(data: string, adventureId: string, encounterId?: string): FilePlan {
  const m = manifestOf(adventureId)
  if (!m) return { need: [], rest: [] }
  const all = new Map<string, { bytes: number; exact: boolean }>()
  for (const [path, f] of Object.entries(m.files)) all.set(path, { bytes: f.bytes, exact: true })
  for (const [path, f] of Object.entries(m.figureFiles ?? {})) all.set(path, { bytes: f.bytes, exact: false })
  const missing = (path: string) => {
    const f = all.get(path)
    return f && !have(data, path, f.bytes, f.exact) ? { path, bytes: f.bytes } : null
  }
  const first = new Set(encounterId ? (m.needs?.[encounterId] ?? []) : [])
  const need = [...first].map(missing).filter((f) => f !== null)
  const rest = [...all.keys()].filter((p) => !first.has(p)).map(missing).filter((f) => f !== null)
  return { need, rest }
}

/** Downloads these files of the adventure, four at a time. Each is checked against its hash where the package has one. */
export async function filesFetch(data: string, adventureId: string, paths: string[], get: typeof fetch = fetch) {
  const m = manifestOf(adventureId)
  const done: string[] = []
  const failed: string[] = []
  const queue = [...paths]
  const one = async (path: string) => {
    const known = m?.files[path] ?? m?.figureFiles?.[path]
    if (!known || !/^(stage|asset-library)\//.test(path) || path.split("/").includes("..")) return void failed.push(path)
    try {
      const res = await get(`${HOST}/${path}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const body = Buffer.from(await res.arrayBuffer())
      const sha = m?.files[path]?.sha256
      if (sha && createHash("sha256").update(body).digest("hex") !== sha) throw new Error("hash")
      const file = join(data, "files", path)
      mkdirSync(dirname(file), { recursive: true })
      // Written then renamed, so the window never reads half a file.
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, body)
      renameSync(tmp, file)
      done.push(path)
    } catch (error) {
      failed.push(path)
      // Each failure, with why, in the data folder's files.log.
      try {
        appendFileSync(join(data, "files.log"), `${new Date().toISOString()} ${adventureId} ${path}: ${error instanceof Error ? error.message : String(error)}\n`)
      } catch {}
    }
  }
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) await one(path)
    })
  )
  return { done, failed }
}
