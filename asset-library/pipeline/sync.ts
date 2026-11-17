// Publishes the asset library: what its public page shows goes to the public bucket, and what it was made from goes
// to the private one, as a backup.
//
//   pnpm assets:sync                  # write library.json, then upload what changed
//   pnpm assets:sync --dry            # list what would upload
//   pnpm assets:sync thalbern-rodin   # that character's files alone, and the index
//
// A figure that takes another's body (its brief's `body`: a rig or a set of clips tried on a model already made, see
// pilot.ts) is a trial, kept in the workspace. It is not published and the index leaves it out.
//
// Public bucket, under asset-library/characters/<id>/: the rigged copies, the thumbnail and figure.json. The site
// serves them at /asset-library/... (next.config.ts), which is what /settings/<setting>/assets loads.
// Private bucket, under the same path: the brief, the pose sheets, the joints, the generator's answer, the source
// model and the rig's report. A character can be rebuilt from these without paying again.
//
// library.json is the page's index: every character and place, gathered from the repo (library.ts). It is written
// here and uploaded last, and the page reads it from the bucket, so a sync shows on the site with no deploy.

import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { extname } from "node:path"
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { buildLibrary } from "../library"

const ROOT = "asset-library/characters"
const PUBLIC = ["lod0.glb", "lod1.glb", "lod2.glb", "front.webp", "thumb.webp", "figure.json"]
const PRIVATE = [
  ...["character.json", "sheet.png", "apose-front.png", "apose-back.png", "joints.json", "tripo.json", "source.glb", "rig.json"],
  // A figure pilot.ts made: the generators' answers, the model as it came and as it was rigged.
  ...["pilot-model.json", "pilot-rig.json", "pilot-picks.json", "pilot/model.glb", "pilot/rigged-all.glb"],
]
const TYPES: Record<string, string> = { ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" }
// A figure is rebuilt under the same name, so caches stay short.
const CACHE = "public, max-age=300"

const { AWS_BUCKET_PUBLIC, AWS_BUCKET_DATA, AWS_REGION, AWS_KEY, AWS_SECRET } = process.env
if (!AWS_BUCKET_PUBLIC || !AWS_BUCKET_DATA || !AWS_REGION || !AWS_KEY || !AWS_SECRET) throw new Error("AWS_* env vars are missing")
const dry = process.argv.includes("--dry")
const s3 = new S3Client({ region: AWS_REGION, credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET } })

async function put(bucket: string, file: string, open: boolean) {
  const body = await readFile(file)
  const md5 = createHash("md5").update(body).digest("hex")
  const had = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file })).catch((e: { name?: string }) => {
    if (e.name === "NotFound") return null
    throw e
  })
  if (had?.ETag?.replaceAll('"', "") === md5 && had.ContentLength === body.length) return 0
  if (!dry) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: file, Body: body, ContentType: TYPES[extname(file)], ...(open ? { CacheControl: CACHE } : {}) }))
  console.log(`${dry ? "would upload" : "uploaded"} ${open ? "public " : "private"} ${file}  ${(body.length / 1e6).toFixed(2)} MB`)
  return body.length
}

async function main() {
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const all = (await readdir(ROOT)).sort()
  const trials: string[] = []
  for (const id of all) {
    const brief = existsSync(`${ROOT}/${id}/character.json`) ? (JSON.parse(await readFile(`${ROOT}/${id}/character.json`, "utf8")) as { body?: string }) : null
    if (brief?.body) trials.push(id)
  }
  for (const id of named) if (!all.includes(id) || trials.includes(id)) throw new Error(`${id} is ${all.includes(id) ? "a trial on another's body, and is not published" : "no character"}`)
  const library = await buildLibrary(process.cwd(), trials)
  if (!dry) await writeFile("asset-library/library.json", `${JSON.stringify(library)}\n`)
  let files = 0
  let bytes = 0
  for (const id of named.length ? named : all) {
    // Only a finished character is published: one with a figure on the shelf.
    if (trials.includes(id) || !existsSync(`${ROOT}/${id}/figure.json`)) continue
    for (const [names, bucket, open] of [
      [PUBLIC, AWS_BUCKET_PUBLIC, true],
      [PRIVATE, AWS_BUCKET_DATA, false],
    ] as const)
      for (const name of names) {
        const file = `${ROOT}/${id}/${name}`
        if (!existsSync(file)) continue
        const sent = await put(bucket as string, file, open)
        if (sent) files++
        bytes += sent
      }
  }
  // The index goes last, so the page never lists a figure whose files are not out yet.
  if (await put(AWS_BUCKET_PUBLIC as string, "asset-library/library.json", true)) files++
  const figures = library.characters.filter((c) => c.figure).length
  console.log(
    `${files} files, ${(bytes / 1e6).toFixed(1)} MB ${dry ? "would upload" : "uploaded"}. library.json: ${figures} figures, ${library.characters.length} characters, ${library.places.length} places, ${library.pictures.length} pictures.`
  )
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
