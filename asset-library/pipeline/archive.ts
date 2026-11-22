// Keeps the whole of each character in the private bucket, so the workspace need not hold it.
//
//   pnpm assets:archive                  # upload every file of every character, trials and unfinished ones too
//   pnpm assets:archive thalbern-rodin   # that character's files alone
//   pnpm assets:archive --dry            # list what would upload
//   pnpm assets:archive --prune          # upload, then delete the heavy local files of figures the game does not ship
//   pnpm assets:fetch thalbern-rodin     # bring a character's files back from the bucket
//
// sync.ts uploads what the page shows and what a character was made from. This uploads the rest beside it, under the
// same path in the private bucket: the paint passes, the pilot's working files, and the trials sync leaves out.
//
// --prune deletes only files git ignores (models, sheets, check pictures, pilot/), and only once the bucket holds
// each one byte for byte. The figures SHIPPED names stay on disk, since the desktop build copies them
// (apps/desktop/scripts/build-runtime.ts). In development a pruned figure's published files come from the CDN
// (app/dev/assets/file); a trial's are not published, so fetch it before working on it.

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SHIPPED } from "../shipped"

const ROOT = "asset-library/characters"
const SKIP = new Set([".DS_Store"])

const { AWS_BUCKET_DATA, AWS_REGION, AWS_KEY, AWS_SECRET } = process.env
if (!AWS_BUCKET_DATA || !AWS_REGION || !AWS_KEY || !AWS_SECRET) throw new Error("AWS_* env vars are missing")
const BUCKET = AWS_BUCKET_DATA
const s3 = new S3Client({ region: AWS_REGION, credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET } })
const args = process.argv.slice(2)
const dry = args.includes("--dry")
const prune = args.includes("--prune")
const fetching = args.includes("--fetch")
const named = args.filter((a) => !a.startsWith("--"))

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(file)))
    else if (entry.isFile()) out.push(file)
  }
  return out
}

// Whether the bucket holds this file as it is on disk.
async function held(file: string, body: Buffer) {
  const md5 = createHash("md5").update(body).digest("hex")
  const had = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: file })).catch((e: { name?: string }) => {
    if (e.name === "NotFound") return null
    throw e
  })
  return had?.ETag?.replaceAll('"', "") === md5 && had.ContentLength === body.length
}

function ignored(id: string) {
  const out = execFileSync("git", ["ls-files", "-o", "-i", "--exclude-standard", "-z", "--", `${ROOT}/${id}`], { encoding: "utf8" })
  return new Set(out.split("\0").filter(Boolean))
}

async function archive() {
  const all = (await readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const id of named) if (!all.includes(id)) throw new Error(`${id} is no character`)
  const keep = new Set(Object.values(SHIPPED))
  let sent = 0
  let bytes = 0
  let freed = 0
  for (const id of named.length ? named : all) {
    const files = await walk(`${ROOT}/${id}`)
    const heavy = prune && !keep.has(id) ? ignored(id) : new Set<string>()
    for (const file of files) {
      const body = await readFile(file)
      if (!(await held(file, body))) {
        if (!dry) await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: file, Body: body }))
        console.log(`${dry ? "would upload" : "uploaded"} ${file}  ${(body.length / 1e6).toFixed(2)} MB`)
        sent++
        bytes += body.length
      }
      if (!heavy.has(file) || dry) continue
      // Deleted only when a fresh look at the bucket finds it whole.
      if (!(await held(file, body))) throw new Error(`${file} is not whole in the bucket, so it was kept`)
      await unlink(file)
      freed += body.length
    }
  }
  console.log(`${sent} files, ${(bytes / 1e6).toFixed(1)} MB ${dry ? "would upload" : "uploaded"}.${prune && !dry ? ` ${(freed / 1e6).toFixed(1)} MB freed.` : ""}`)
}

async function fetchBack() {
  if (!named.length) throw new Error("name the characters to fetch")
  let got = 0
  let bytes = 0
  for (const id of named) {
    let token: string | undefined
    let found = 0
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${ROOT}/${id}/`, ContinuationToken: token }))
      for (const item of page.Contents ?? []) {
        const file = item.Key
        if (!file) continue
        found++
        if (existsSync(file) && (await held(file, await readFile(file)))) continue
        if (!dry) {
          const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: file }))
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, await res.Body!.transformToByteArray())
        }
        console.log(`${dry ? "would fetch" : "fetched"} ${file}  ${((item.Size ?? 0) / 1e6).toFixed(2)} MB`)
        got++
        bytes += item.Size ?? 0
      }
      token = page.NextContinuationToken
    } while (token)
    if (!found) throw new Error(`the bucket holds nothing of ${id}`)
  }
  console.log(`${got} files, ${(bytes / 1e6).toFixed(1)} MB ${dry ? "would fetch" : "fetched"}.`)
}

;(fetching ? fetchBack() : archive()).catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
