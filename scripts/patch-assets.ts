// Search, inspect, and fetch CC0 3D props, PBR materials, and HDRIs from Patch's public asset API
// (https://patch.gg/api/v1) with SHA-256 verification and automatic README.md attribution.
//
//   pnpm patch:assets search barrel --type=model --max-tris=5000
//   pnpm patch:assets search cobblestone --type=material
//   pnpm patch:assets info polyhaven:Barrel_01
//   pnpm patch:assets fetch polyhaven:Barrel_01 --to=public/stage/props --variant=web
//
// Defaults match packages/stage/AGENTS.md: CC0-1.0 only and textures <= 2048 px (never 4K/8K).
// No login or API key is required for read/download.

import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

const API = "https://patch.gg/api/v1"

type SearchHit = {
  id: string
  type: string
  title: string
  source: string
  license: string
  ai?: boolean
  fit?: {
    variant?: string
    mb?: number
    triangles?: number
    texture_px?: number
    dims_m?: number[]
    real_width_m?: number
  }
}

type AssetFile = {
  role?: string
  name?: string
  path?: string
  sha256?: string
  size?: number
  url: string
}

type AssetVariant = {
  name?: string
  variant?: string
  mb?: number
  size?: number
  facts?: {
    triangles?: number
    texture_px?: number
    compression?: string
  }
  files?: AssetFile[]
}

type AssetDetail = {
  id: string
  title: string
  type?: string
  source?: { id?: string; name?: string; url?: string }
  license?: { spdx?: string; name?: string; url?: string; duties?: string[] }
  credit?: string
  variants?: AssetVariant[]
}

const args = process.argv.slice(2)
const [cmd, ...rest] = args
const positional = rest.filter((a) => !a.startsWith("--"))
const flag = (name: string) => {
  const prefix = `--${name}=`
  const hit = rest.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}
const has = (name: string) => rest.includes(`--${name}`)

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Patch API ${res.status} for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`)
  }
  return (await res.json()) as T
}

function fmtDims(fit?: SearchHit["fit"]): string {
  if (fit?.dims_m?.length === 3) return `${fit.dims_m.map((n) => n.toFixed(2)).join("×")}m`
  if (fit?.real_width_m) return `${fit.real_width_m.toFixed(2)}m tile`
  return "-"
}

async function search() {
  const q = positional.join(" ").trim()
  const type = flag("type")
  const source = flag("source")
  const license = flag("license") ?? "CC0-1.0"
  const limit = flag("limit") ?? "12"
  const maxTris = flag("max-tris")
  const maxTex = flag("max-tex") ?? "2048"
  const noAi = has("no-ai")

  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (type) params.set("type", type)
  if (source) params.set("source", source)
  if (license && license !== "any") params.set("license", license)
  if (limit) params.set("limit", limit)
  if (noAi) params.set("ai", "false")
  if (maxTris) params.append("where", `triangles<=${maxTris}`)
  if (maxTex && maxTex !== "any" && type !== "audio" && type !== "music") params.append("where", `texture_px<=${maxTex}`)

  const url = `${API}/assets/search?${params.toString()}`
  const data = await getJson<{ total: number; hits?: SearchHit[] }>(url)
  const hits = data.hits ?? []
  console.log(`Found ${data.total} asset(s) (showing ${hits.length}, license=${license}${maxTex !== "any" ? `, tex<=${maxTex}` : ""}):`)
  if (!hits.length) {
    if (q.includes(" ")) console.log("Tip: Patch search matches all terms. Try a single noun (e.g. 'barrel', 'lantern', 'cobblestone').")
    return
  }
  console.log(`${"id".padEnd(44)} ${"type".padEnd(9)} ${"source".padEnd(11)} ${"tris".padEnd(8)} ${"tex".padEnd(6)} ${"MB".padEnd(6)} size`)
  for (const h of hits) {
    const tris = h.fit?.triangles !== undefined ? String(h.fit.triangles) : "-"
    const tex = h.fit?.texture_px !== undefined ? `${h.fit.texture_px}` : "-"
    const mb = h.fit?.mb !== undefined ? h.fit.mb.toFixed(2) : "-"
    console.log(`${h.id.padEnd(44)} ${h.type.padEnd(9)} ${h.source.slice(0, 11).padEnd(11)} ${tris.padEnd(8)} ${tex.padEnd(6)} ${mb.padEnd(6)} ${fmtDims(h.fit)}`)
  }
}

async function info() {
  const id = positional[0]
  if (!id) throw new Error("Usage: pnpm patch:assets info <asset-id>")
  const asset = await getJson<AssetDetail>(`${API}/assets/${encodeURIComponent(id)}`)
  console.log(`${asset.id} — ${asset.title}`)
  console.log(`  source:  ${asset.source?.name ?? "?"} (${asset.source?.url ?? ""})`)
  console.log(`  license: ${asset.license?.spdx ?? "?"} (${asset.license?.name ?? ""})`)
  if (asset.license?.duties?.length) console.log(`  duties:  ${asset.license.duties.join(", ")}`)
  if (asset.credit) console.log(`  credit:  ${asset.credit}`)
  console.log("  variants:")
  for (const v of asset.variants ?? []) {
    const name = v.name ?? v.variant ?? "default"
    const mb = v.mb !== undefined ? `${v.mb.toFixed(2)} MB` : v.size ? `${(v.size / 1e6).toFixed(2)} MB` : "?"
    const tris = v.facts?.triangles !== undefined ? `${v.facts.triangles} tris` : ""
    const tex = v.facts?.texture_px !== undefined ? `${v.facts.texture_px}px` : ""
    const comp = v.facts?.compression ? `[${v.facts.compression}]` : ""
    const files = (v.files ?? []).map((f) => f.name ?? basename(f.url)).join(", ")
    console.log(`    - ${name.padEnd(10)} ${mb.padEnd(9)} ${[tris, tex, comp].filter(Boolean).join(" ").padEnd(26)} (${files})`)
  }
}

async function recordCredit(dir: string, asset: AssetDetail, variantName: string, savedFiles: string[]) {
  const readmePath = join(dir, "README.md")
  const existing = existsSync(readmePath) ? await readFile(readmePath, "utf8") : "# Stage Assets\n\nAssets downloaded for this folder, with source and license.\n\n| Files | Asset | License | Credit |\n|---|---|---|---|\n"
  if (existing.includes(`\`${asset.id}\``)) return false
  const spdx = asset.license?.spdx ?? "unknown"
  const credit = (asset.credit ?? `${asset.title} (${asset.source?.url ?? asset.id})`).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()
  const fileList = savedFiles.map((f) => `\`${f}\``).join(", ")
  const line = `| ${fileList} | \`${asset.id}\` (${variantName}) | ${spdx} | ${credit} |\n`
  const prefix = existing.endsWith("\n") ? existing : `${existing}\n`
  await writeFile(readmePath, prefix + line, "utf8")
  return true
}

async function fetchAsset() {
  const id = positional[0]
  const toDir = flag("to")
  const wantVariant = flag("variant") ?? "web"
  const allowBy = has("allow-by")
  const allow4k = has("allow-4k")
  const dry = has("dry")

  if (!id || !toDir) throw new Error("Usage: pnpm patch:assets fetch <asset-id> --to=<dir> [--variant=web|web-lod1|web-lod2|preview] [--allow-by] [--allow-4k] [--dry]")

  const asset = await getJson<AssetDetail>(`${API}/assets/${encodeURIComponent(id)}`)
  const spdx = asset.license?.spdx ?? "unknown"
  if (spdx !== "CC0-1.0" && !(allowBy && spdx === "CC-BY-4.0")) {
    throw new Error(`Refusing ${id}: license is ${spdx} (CC0-1.0 required by default; pass --allow-by for CC-BY-4.0).`)
  }

  const variants = asset.variants ?? []
  const variant = variants.find((v) => (v.name ?? v.variant) === wantVariant)
  if (!variant) {
    const names = variants.map((v) => v.name ?? v.variant ?? "?").join(", ")
    throw new Error(`Variant "${wantVariant}" not found for ${id}. Available: ${names}`)
  }
  const texPx = variant.facts?.texture_px ?? 0
  if (texPx > 2048 && !allow4k) {
    throw new Error(`Refusing ${id} (${wantVariant}): texture is ${texPx}px (> 2048px limit in packages/stage/AGENTS.md; pick a smaller variant or pass --allow-4k).`)
  }
  const files = variant.files ?? []
  if (!files.length) throw new Error(`No files listed in variant "${wantVariant}" for ${id}.`)

  console.log(`${dry ? "[dry] " : ""}Fetching ${id} (${wantVariant}, ${spdx}${texPx ? `, ${texPx}px` : ""}) -> ${toDir}`)
  if (!dry) await mkdir(toDir, { recursive: true })

  const saved: string[] = []
  for (const f of files) {
    const filename = basename(f.name ?? f.path ?? new URL(f.url).pathname)
    const dest = join(toDir, filename)
    saved.push(filename)
    if (dry) {
      console.log(`  would download ${filename} (${f.size ? `${(f.size / 1e6).toFixed(2)} MB` : "?"})`)
      continue
    }
    const res = await fetch(f.url)
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${f.url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (f.sha256) {
      const digest = createHash("sha256").update(buf).digest("hex")
      if (digest !== f.sha256.toLowerCase()) {
        throw new Error(`SHA-256 mismatch for ${filename}: expected ${f.sha256}, got ${digest}`)
      }
    }
    await writeFile(dest, buf)
    console.log(`  saved ${dest} (${(buf.length / 1e6).toFixed(2)} MB${f.sha256 ? ", sha256 ok" : ""})`)
  }

  if (!dry) {
    const added = await recordCredit(toDir, asset, wantVariant, saved)
    console.log(added ? `  credited in ${join(toDir, "README.md")}` : `  already listed in ${join(toDir, "README.md")}`)
    if (toDir.startsWith("public/stage")) console.log(`  next: run \`pnpm stage:sync ${toDir}\` before pushing`)
  }
}

function usage() {
  console.log(`Patch public CC0 asset helper (no login required)

Usage:
  pnpm patch:assets search <query> [--type=model|material|hdri|audio|sprite] [--source=polyhaven] [--max-tris=5000] [--max-tex=2048] [--license=CC0-1.0] [--limit=12] [--no-ai]
  pnpm patch:assets info <asset-id>
  pnpm patch:assets fetch <asset-id> --to=<dir> [--variant=web|web-lod1|web-lod2|preview] [--allow-by] [--allow-4k] [--dry]`)
}

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h") return usage()
  if (cmd === "search") return search()
  if (cmd === "info") return info()
  if (cmd === "fetch") return fetchAsset()
  throw new Error(`Unknown command "${cmd}". Run with --help for usage.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
