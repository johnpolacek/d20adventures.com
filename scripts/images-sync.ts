// Makes the site's pictures small enough to serve. Each original in the public bucket that the content names gets a
// few WebP widths and one JPEG for share cards, stored beside it under opt/, and a line in lib/images-manifest.json.
// lib/images.ts reads that file to pick a size. An original already in the manifest at its current version is skipped,
// and so is one under 300 KB.
// Run after adding or repainting a picture, then commit the manifest.
//
//   pnpm images:sync                 # make what is missing or changed
//   pnpm images:sync --dry           # list what would be made
//   pnpm images:sync --check         # list the pictures the content names that the manifest lacks. No network
//   pnpm images:sync covert-cargo    # only pictures whose address holds this text

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { bucketKey, SHARE_WIDTH, variantKey, variantWidths } from "@/lib/images"

const MANIFEST = "lib/images-manifest.json"
const CONTENT = "content"
const URLS = /https:\/\/[a-z0-9.-]*(?:cloudfront\.net|amazonaws\.com)\/[^"'()\s<>]+/g
// A setting's data names its pictures by their key alone.
const PATHS = /(?<=")\/?images\/[^"\s]+(?=")/g
// A variant's address holds its original's version, so it never changes.
const CACHE = "public, max-age=31536000, immutable"
// A picture already this light is served as it is: making it again would only blur it.
const LIGHT = 300 * 1024

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"))
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const dry = flags.includes("--dry")
const check = flags.includes("--check")

type Entry = [number, number, string]
type Manifest = Record<string, Entry>

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(md|json)$/.test(e.name) ? [join(dir, e.name)] : [])))
  return nested.flat()
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest
  const texts = await Promise.all((await files(CONTENT)).map((f) => readFile(f, "utf8")))

  const bucket = process.env.AWS_BUCKET_PUBLIC
  const data = process.env.AWS_BUCKET_DATA
  const ready = bucket && process.env.AWS_REGION && process.env.AWS_KEY && process.env.AWS_SECRET
  const s3 = ready ? new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_KEY as string, secretAccessKey: process.env.AWS_SECRET as string } }) : null
  const bytes = async (Bucket: string, Key: string) => Buffer.from(await (await (s3 as S3Client).send(new GetObjectCommand({ Bucket, Key }))).Body!.transformToByteArray())

  // Each setting's own data, with its places and factions, is kept in the data bucket, not in the repo.
  if (!check && s3 && data) {
    for (const setting of await readdir(join(CONTENT, "settings"))) {
      if (setting.startsWith(".")) continue
      texts.push(await bytes(data, `settings/${setting}/setting-data.json`).then(String, () => ""))
    }
  }

  const keys = [...new Set(texts.flatMap((t) => [...(t.match(URLS) ?? []), ...(t.match(PATHS) ?? [])]).filter((u) => !only.length || only.some((o) => u.includes(o))).map(bucketKey))]
    .filter((k): k is string => Boolean(k) && !k?.startsWith("opt/") && /^[^.]+$|\.(png|jpe?g|webp)$/i.test(k?.split("/").pop() ?? ""))
    .sort()

  if (check) {
    // A light picture has no line either, so this lists candidates: `--dry` tells which of them need making.
    const missing = keys.filter((k) => !manifest[k])
    for (const k of missing) console.log(`not in the manifest: ${k}`)
    console.log(`${keys.length - missing.length} of ${keys.length} pictures have sizes`)
    return
  }
  if (!s3 || !bucket) throw new Error("AWS_* env vars are missing")

  let made = 0
  let saved = 0
  const absent: string[] = []
  const put = (Key: string, Body: Buffer, ContentType: string) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, CacheControl: CACHE }))

  async function one(key: string) {
    const head = await s3!.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null)
    if (!head?.ETag) return void absent.push(key)
    const version = head.ETag.replaceAll('"', "").slice(0, 8)
    if (manifest[key]?.[2] === version || (head.ContentLength ?? 0) < LIGHT) return
    if (dry) return void (made++, console.log(`would make ${key} (${Math.round((head.ContentLength ?? 0) / 1024)} KB)`))
    const source = await bytes(bucket!, key)
    const { width, height } = await sharp(source).metadata()
    if (!width || !height) return void absent.push(key)
    let total = 0
    for (const w of variantWidths(width)) {
      const out = await sharp(source).resize({ width: w }).webp({ quality: 80 }).toBuffer()
      await put(variantKey(key, version, `${w}.webp`), out, "image/webp")
      total = Math.max(total, out.length)
    }
    const share = await sharp(source).resize({ width: Math.min(SHARE_WIDTH, width) }).flatten({ background: "#000" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    await put(variantKey(key, version, "share.jpg"), share, "image/jpeg")
    manifest[key] = [width, height, version]
    made++
    saved += source.length - total
    console.log(`made ${key}  ${width}x${height}  ${Math.round(source.length / 1024)} KB -> ${Math.round(total / 1024)} KB at most`)
  }

  try {
    for (let i = 0; i < keys.length; i += 4) await Promise.all(keys.slice(i, i + 4).map(one))
  } finally {
    // Whatever was made is recorded, even when a later picture fails.
    if (!dry && made) await writeFile(MANIFEST, `{\n${Object.keys(manifest).sort().map((k) => `  ${JSON.stringify(k)}: [${manifest[k].map((v) => JSON.stringify(v)).join(", ")}]`).join(",\n")}\n}\n`)
  }
  for (const k of absent) console.log(`not in the bucket, or not a picture: ${k}`)
  console.log(`${made} of ${keys.length} pictures ${dry ? "would be made" : "made"}${made && !dry ? `, ${Math.round(saved / 1024 / 1024)} MB lighter at full width` : ""}`)
}

main()
