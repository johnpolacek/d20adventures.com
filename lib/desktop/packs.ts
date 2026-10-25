import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PackIndex } from "@d20/gm-core/packs"
import { readJsonFromS3 } from "@/lib/s3-utils"

// Story packs live in the private data bucket under desktop-packs/, written by scripts/desktop-packs.ts.
// DESKTOP_PACKS_DIR serves the same layout from a local folder for development.
const S3_PREFIX = "desktop-packs"
const INDEX_TTL_MS = 60 * 1000
let cached: { at: number; index: PackIndex } | null = null

async function readText(name: string): Promise<string | null> {
  const dir = process.env.DESKTOP_PACKS_DIR
  try {
    if (dir) return await readFile(join(dir, name), "utf8")
    if (!process.env.AWS_BUCKET_DATA) return null
    return JSON.stringify(await readJsonFromS3(`${S3_PREFIX}/${name}`))
  } catch {
    return null
  }
}

export async function packIndex(): Promise<PackIndex> {
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.index
  const text = await readText("index.json")
  const index = text ? (JSON.parse(text) as PackIndex) : {}
  cached = { at: Date.now(), index }
  return index
}

export const packBody = (id: string) => (/^[a-z0-9-]+$/.test(id) ? readText(`${id}.json`) : Promise.resolve(null))
