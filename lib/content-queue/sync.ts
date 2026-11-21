/**
 * Two-way sync of content/queue with the private data bucket, under
 * content-queue/. The repo is public, so drafts live there instead of Git.
 *
 * Run by `pnpm content:sync`, the miner and the Sync button on /admin/content.
 *
 * .sync.json remembers each file's hash at the last sync, so it can
 * tell which side changed. When both sides changed, the bucket's copy is
 * saved next to the local one as <name>.remote.md and nothing is overwritten.
 */
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const QUEUE = path.join(process.cwd(), "content/queue")
const MANIFEST = path.join(QUEUE, ".sync.json")
const PREFIX = "content-queue/"
const SKIP = new Set([".sync.json"])

type Manifest = Record<string, string>

function md5(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex")
}

function client(): { s3: S3Client; bucket: string } {
  const { AWS_KEY, AWS_SECRET, AWS_REGION, AWS_BUCKET_DATA } = process.env
  if (!AWS_KEY || !AWS_SECRET || !AWS_BUCKET_DATA) throw new Error("AWS_KEY, AWS_SECRET and AWS_BUCKET_DATA must be set")
  return {
    s3: new S3Client({ region: AWS_REGION || "us-east-1", credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET } }),
    bucket: AWS_BUCKET_DATA,
  }
}

function localFiles(): Map<string, string> {
  const out = new Map<string, string>()
  if (!fs.existsSync(QUEUE)) return out
  for (const name of fs.readdirSync(QUEUE)) {
    const p = path.join(QUEUE, name)
    if (SKIP.has(name) || name.includes(".remote.") || !fs.statSync(p).isFile()) continue
    out.set(name, md5(fs.readFileSync(p)))
  }
  return out
}

async function remoteFiles(s3: S3Client, bucket: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let token: string | undefined
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }))
    for (const o of res.Contents ?? []) {
      const name = o.Key!.slice(PREFIX.length)
      // Small single-part uploads have an ETag equal to the MD5 of the body.
      if (name && !name.includes("/")) out.set(name, (o.ETag ?? "").replaceAll('"', ""))
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

async function download(s3: S3Client, bucket: string, name: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: PREFIX + name }))
  return Buffer.from(await res.Body!.transformToByteArray())
}

async function upload(s3: S3Client, bucket: string, name: string): Promise<string> {
  const body = fs.readFileSync(path.join(QUEUE, name))
  const type = name.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/json"
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: PREFIX + name, Body: body, ContentType: type }))
  return md5(body)
}

export async function syncQueue(log: (s: string) => void = console.log): Promise<string> {
  const { s3, bucket } = client()
  fs.mkdirSync(QUEUE, { recursive: true })
  const base: Manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {}
  const local = localFiles()
  const remote = await remoteFiles(s3, bucket)
  const next: Manifest = {}
  const counts = { up: 0, down: 0, deleted: 0, conflicts: 0 }

  for (const name of new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)])) {
    const L = local.get(name)
    const R = remote.get(name)
    const B = base[name]

    if (L && R && L === R) {
      next[name] = L
    } else if (L && !R) {
      if (B && L === B) {
        fs.rmSync(path.join(QUEUE, name)) // deleted in the bucket since the last sync
        counts.deleted++
      } else {
        next[name] = await upload(s3, bucket, name)
        counts.up++
      }
    } else if (!L && R) {
      if (B && R === B) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: PREFIX + name })) // deleted here
        counts.deleted++
      } else {
        const body = await download(s3, bucket, name)
        fs.writeFileSync(path.join(QUEUE, name), body)
        next[name] = md5(body)
        counts.down++
      }
    } else if (L && R) {
      if (L === B) {
        const body = await download(s3, bucket, name)
        fs.writeFileSync(path.join(QUEUE, name), body)
        next[name] = md5(body)
        counts.down++
      } else if (R === B) {
        next[name] = await upload(s3, bucket, name)
        counts.up++
      } else {
        fs.writeFileSync(path.join(QUEUE, name.replace(/(\.\w+)?$/, ".remote$1")), await download(s3, bucket, name))
        if (B) next[name] = B
        counts.conflicts++
        log(`conflict: ${name}, the bucket's copy is beside it as .remote`)
      }
    }
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`)
  const summary = `${counts.up} up, ${counts.down} down, ${counts.deleted} deleted, ${counts.conflicts} conflicts`
  log(`synced content/queue: ${summary}`)
  return summary
}
