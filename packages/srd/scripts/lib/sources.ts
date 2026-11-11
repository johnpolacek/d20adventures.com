import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** The package root, `packages/srd`. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export type UpstreamName = "5e-bits" | "open5e"

type Lock = {
  official: { text: string; textSha256: string; pages: number }
  upstream: Record<UpstreamName, { repo: string; commit: string; path: string; files: Record<string, string> }>
}

export const lock: Lock = JSON.parse(readFileSync(resolve(root, "sources/sources.lock.json"), "utf8"))

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex")

/** Where a pinned upstream file is cached by `pnpm sources`. */
export const cachePath = (source: UpstreamName, file: string) => resolve(root, ".cache", source, file)

/** The raw URL of a pinned upstream file. */
export function upstreamUrl(source: UpstreamName, file: string) {
  const { repo, commit, path } = lock.upstream[source]
  return `${repo.replace("https://github.com/", "https://raw.githubusercontent.com/")}/${commit}/${path}/${file}`
}

/**
 * Read a pinned upstream JSON file from the cache. The file must match the hash in the lock, so a build can only
 * read the exact bytes that were reviewed.
 */
export function readUpstream<T = unknown>(source: UpstreamName, file: string): T {
  const expected = lock.upstream[source].files[file]
  if (!expected) throw new Error(`${source}/${file} is not in sources.lock.json`)
  const path = cachePath(source, file)
  if (!existsSync(path)) throw new Error(`${source}/${file} is not cached. Run: pnpm --filter @d20/srd sources`)
  const text = readFileSync(path, "utf8")
  if (sha256(text) !== expected) throw new Error(`${source}/${file} does not match its locked hash. Run: pnpm --filter @d20/srd sources`)
  return JSON.parse(text)
}

/**
 * Whether every pinned file of an upstream source is cached. The cache is not in Git, so a fresh clone has none
 * until `pnpm sources` runs. Checks against the official text never need it. Cross-checks do, and skip without it.
 */
export const hasUpstream = (source: UpstreamName) => Object.keys(lock.upstream[source].files).every((file) => existsSync(cachePath(source, file)))

/** The base source: 5e-bits/5e-database, `src/2024/en`. Pass the name without the `5e-SRD-` prefix, e.g. "Spells". */
export const readBase = <T = any>(name: string): T[] => readUpstream<T[]>("5e-bits", `5e-SRD-${name}.json`)

/** The second source: Open5e `srd-2024` Django fixtures. Each row is `{ model, pk, fields }`. */
export const readOpen5e = <T = any>(name: string): { model: string; pk: string; fields: T }[] => readUpstream("open5e", `${name}.json`)
