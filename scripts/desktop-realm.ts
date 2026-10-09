// Snapshots a setting's card from the website into the desktop app: its name, description and painting, so the
// Settings page works offline. Explore opens the website's page. Re-run after editing the setting there.
//   node --env-file=.env.local --import tsx scripts/desktop-realm.ts realm-of-myr
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { readJsonFromS3 } from "../lib/s3-utils"
import { getImageUrl } from "../lib/utils"
import type { Setting } from "../types/setting"

const id = process.argv[2] ?? "realm-of-myr"
const out = join("public/stage/realm", id)
async function painting(path: string, name: string, width: number) {
  const response = await fetch(getImageUrl(path))
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  const file = `${name}.jpg`
  await sharp(Buffer.from(await response.arrayBuffer()))
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(out, file))
  return `/stage/realm/${id}/${file}`
}

async function main() {
  const setting = (await readJsonFromS3(`settings/${id}/setting-data.json`)) as Setting
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  const realm = { id, name: setting.name, description: setting.description, image: await painting(setting.image, "realm", 1920) }
  await writeFile(join(out, "realm.json"), `${JSON.stringify(realm, null, 2)}\n`)
  console.log(`Wrote ${out}.`)
}

void main()
