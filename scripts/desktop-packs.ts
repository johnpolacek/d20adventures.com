/**
 * Builds one story pack per catalog adventure for the desktop app, plus index.json with each version.
 *
 * Usage: pnpm exec tsx scripts/desktop-packs.ts [--out apps/desktop/dist-packs]
 *        pnpm exec dotenv -e .env.local -e .env -- tsx scripts/desktop-packs.ts --upload
 *
 * --out writes the files to a folder, which DESKTOP_PACKS_DIR can serve in development.
 * --upload writes them to the private data bucket under desktop-packs/.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { makePack, type PackIndex } from "@d20/gm-core/packs"
import { CATALOG } from "@/lib/store/catalog"
import { loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

const args = process.argv.slice(2)
const upload = args.includes("--upload")
const outAt = args.indexOf("--out")
const out = resolve(outAt >= 0 ? args[outAt + 1] : "apps/desktop/dist-packs")

async function main() {
  const builtAt = Date.now()
  const packs = await Promise.all(CATALOG.map((entry) => makePack(entry.id, loadLocalWikiAdventureRuntime(entry.settingId, entry.id), builtAt)))
  const index: PackIndex = Object.fromEntries(packs.map((p) => [p.id, { version: p.version, builtAt: p.builtAt }]))

  if (upload) {
    const { updateJsonOnS3 } = await import("@/lib/s3-utils")
    for (const pack of packs) await updateJsonOnS3(`desktop-packs/${pack.id}.json`, pack)
    // The index goes last, so the app is never told about a version that is not there yet.
    await updateJsonOnS3("desktop-packs/index.json", index)
    console.log(`Uploaded ${packs.length} story packs to desktop-packs/.`)
  } else {
    mkdirSync(out, { recursive: true })
    for (const pack of packs) writeFileSync(join(out, `${pack.id}.json`), JSON.stringify(pack))
    writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2))
    console.log(`Wrote ${packs.length} story packs to ${out}.`)
  }
  for (const pack of packs) console.log(`  ${pack.id} ${pack.version}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
