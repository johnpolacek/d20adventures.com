// Art for story view, saved as WebP under public/stage. The desktop app can show only bundled images, and it copies
// public/stage, so story view finds them there, as hosted games on the website do.
// - Each encounter's painting, from the `image` in its frontmatter: public/stage/art/<adventure>/<encounter>.webp.
// - Each NPC's portrait, from the `image` on its sheet, cropped to the turn order's tall frame:
//   public/stage/portraits/<npc>.webp, listed in apps/desktop/src/npc-portraits.ts. Sheets with the stock avatar have none.
//
//   pnpm exec tsx scripts/stage-encounter-art.ts [adventure...] [--force]
//
// Without adventures, every Realm of Myr adventure. Files already saved are kept unless --force.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = "content/settings/realm-of-myr/adventures"
const NPCS = "content/settings/realm-of-myr/npcs"
const OUT = "public/stage/art"
const PORTRAITS = "public/stage/portraits"
const MANIFEST = "apps/desktop/src/npc-portraits.ts"
const args = process.argv.slice(2)
const force = args.includes("--force")
const chosen = args.filter((a) => !a.startsWith("--"))

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false
  )

async function main() {
  let saved = 0
  let bytes = 0
  const adventures = chosen.length ? chosen : (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const adventure of adventures) {
    const dir = path.join(ROOT, adventure, "encounters")
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md")).sort()) {
      const id = file.replace(/\.md$/, "")
      const image = (await readFile(path.join(dir, file), "utf8")).match(/^image:\s*"?([^"\n]+)"?\s*$/m)?.[1]
      const out = path.join(OUT, adventure, `${id}.webp`)
      if (!image) {
        console.log(`no art   ${adventure}/${id}`)
        continue
      }
      if (!force && (await exists(out))) continue
      const res = await fetch(image)
      if (!res.ok) {
        console.log(`failed   ${adventure}/${id}: ${res.status}`)
        continue
      }
      // At most 1600 px wide: the paintings are about 1456 px, and story view shows them softly drifting under the text.
      const webp = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 74 })
        .toBuffer()
      await mkdir(path.dirname(out), { recursive: true })
      await writeFile(out, webp)
      saved++
      bytes += webp.length
      console.log(`saved    ${adventure}/${id} ${(webp.length / 1024).toFixed(0)} KB`)
    }
  }
  console.log(`${saved} paintings, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  await mkdir(PORTRAITS, { recursive: true })
  const have: string[] = []
  for (const file of (await readdir(NPCS)).filter((f) => f.endsWith(".json")).sort()) {
    const sheet = JSON.parse(await readFile(path.join(NPCS, file), "utf8")) as { id: string; image?: string }
    const out = path.join(PORTRAITS, `${sheet.id}.webp`)
    if (await exists(out)) {
      if (!force || !sheet.image || sheet.image.includes("/avatar/")) {
        have.push(sheet.id)
        continue
      }
    }
    if (!sheet.image || sheet.image.includes("/avatar/")) continue
    const res = await fetch(sheet.image)
    if (!res.ok) {
      console.log(`failed   portrait ${sheet.id}: ${res.status}`)
      continue
    }
    // The square bust, cut to the turn order's tall frame from the top, where the face is.
    const webp = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 360, height: 432, fit: "cover", position: "north" })
      .webp({ quality: 80 })
      .toBuffer()
    await writeFile(out, webp)
    have.push(sheet.id)
    console.log(`saved    portrait ${sheet.id}`)
  }
  await writeFile(
    MANIFEST,
    `// NPCs with a portrait at /stage/portraits/<id>.webp. Written by scripts/stage-encounter-art.ts.\nexport const NPC_PORTRAITS: ReadonlySet<string> = new Set(${JSON.stringify(have.sort())})\n`
  )
  console.log(`${have.length} portraits`)
}
void main()
