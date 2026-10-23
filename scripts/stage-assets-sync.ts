// Uploads the website's stage art to the public bucket, so deploys need not carry it. `next.config.ts` rewrites
// `/stage/...` and `/stage-lab/...` to CloudFront when a deploy has no local copy, and `.vercelignore` leaves them out.
// Unchanged files (same size and MD5) are skipped. Run before pushing new or changed stage art.
//
//   pnpm stage:sync            # upload what changed
//   pnpm stage:sync --dry      # list what would upload

import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const DIRS = ["public/stage", "public/stage-lab"]
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
}
// Art is sometimes repainted under the same name, so caches stay short.
const CACHE = "public, max-age=300"

const bucket = process.env.AWS_BUCKET_PUBLIC
if (!bucket || !process.env.AWS_REGION || !process.env.AWS_KEY || !process.env.AWS_SECRET) throw new Error("AWS_* env vars are missing")
const dry = process.argv.includes("--dry")
const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_KEY, secretAccessKey: process.env.AWS_SECRET } })

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.startsWith(".") ? [] : [join(dir, e.name)])))
  return nested.flat()
}

async function remoteEtag(key: string) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { etag: head.ETag?.replaceAll('"', ""), size: head.ContentLength }
  } catch (e) {
    if ((e as { name?: string }).name === "NotFound") return undefined
    throw e
  }
}

async function sync(path: string) {
  const key = relative("public", path)
  const type = TYPES[extname(path).toLowerCase()]
  if (!type) throw new Error(`no content type for ${path}`)
  const body = await readFile(path)
  const md5 = createHash("md5").update(body).digest("hex")
  const remote = await remoteEtag(key)
  if (remote?.etag === md5 && remote.size === body.length) return false
  if (!dry) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, CacheControl: CACHE }))
  console.log(`${dry ? "would upload" : "uploaded"} ${key}`)
  return true
}

async function main() {
  const all = (await Promise.all(DIRS.map(files))).flat()
  let changed = 0
  for (let i = 0; i < all.length; i += 16) changed += (await Promise.all(all.slice(i, i + 16).map(sync))).filter(Boolean).length
  console.log(`${changed} of ${all.length} files ${dry ? "would upload" : "uploaded"}`)
}

main()
