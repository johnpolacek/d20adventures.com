import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { cachePath, lock, sha256, type UpstreamName, upstreamUrl } from "./lib/sources"

// Download the pinned upstream files into .cache and check each against its locked hash.
let fetched = 0
for (const source of Object.keys(lock.upstream) as UpstreamName[]) {
  for (const [file, expected] of Object.entries(lock.upstream[source].files)) {
    const path = cachePath(source, file)
    if (existsSync(path) && sha256(readFileSync(path, "utf8")) === expected) continue
    const response = await fetch(upstreamUrl(source, file))
    if (!response.ok) throw new Error(`${source}/${file}: HTTP ${response.status}`)
    const text = await response.text()
    if (sha256(text) !== expected) throw new Error(`${source}/${file}: the download does not match its locked hash`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    fetched++
  }
}
console.log(`Upstream sources match the lock (${fetched} downloaded).`)
