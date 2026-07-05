// True 3D miniatures: the character's full-body standee render goes to fal.ai's
// Hunyuan3D v3 image-to-3d queue; the finished GLB is optimized (gltf-transform:
// weld/quantize/prune + webp textures) and cached in the public bucket keyed by
// the same portrait-URL hash as the standee. Async by design — generation takes
// 1-2 minutes, so a pending-job marker lives in the data bucket and the panel
// polls until the model is ready.
//
// Gated on FAL_KEY; without it the encounter view simply stays on standees.

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { dedup, prune, textureCompress, weld, quantize } from "@gltf-transform/functions"
import sharp from "sharp"
import { getAssetUrl, s3Client } from "@/lib/aws"
import { deleteS3Object, readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"

const FAL_ENDPOINT = "fal-ai/hunyuan3d-v3/image-to-3d"

export function isMini3DEnabled(): boolean {
  return Boolean(process.env.FAL_KEY)
}

export function getMini3DKey(hash: string): string {
  return `images/minis3d/${hash}.glb`
}

function getJobMarkerKey(hash: string): string {
  return `minis3d/jobs/${hash}.json`
}

interface Mini3DJobMarker {
  requestId: string
  statusUrl: string
  responseUrl: string
  chargedUserId: string
  startedAt: string
}

interface Mini3DClaim {
  claim: string
  claimedBy: string
  claimedAt: number
}

/**
 * Best-effort submission lock. Concurrent callers (React strict-mode double
 * effects, two players opening the same turn) both pass the "no marker yet"
 * check, so before charging anyone we write a claim nonce and read it back —
 * S3 is read-after-write consistent, so the last writer wins and everyone
 * else backs off. Not a true mutex, but it shrinks the double-charge window
 * from the full fal round-trip to a single S3 write.
 */
export async function claimMini3DSubmission(hash: string, userId: string): Promise<boolean> {
  const key = getJobMarkerKey(hash)
  const nonce = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  await updateJsonOnS3(key, { claim: nonce, claimedBy: userId, claimedAt: Date.now() } satisfies Mini3DClaim)
  const readBack = (await readJsonFromS3(key).catch(() => null)) as Mini3DClaim | null
  return readBack?.claim === nonce
}

export function isClaimMarker(marker: unknown): marker is Mini3DClaim {
  return Boolean(marker && typeof marker === "object" && "claim" in (marker as Record<string, unknown>))
}

/** A claim whose owner never completed the submit (crashed) unblocks after 2 minutes. */
export function isClaimStale(claim: Mini3DClaim): boolean {
  return Date.now() - claim.claimedAt > 2 * 60 * 1000
}

export async function releaseMini3DClaim(hash: string): Promise<void> {
  await deleteS3Object(getJobMarkerKey(hash)).catch(() => {})
}

export async function mini3DExists(hash: string): Promise<boolean> {
  if (!s3Client) return false
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_PUBLIC, Key: getMini3DKey(hash) }))
    return true
  } catch {
    return false
  }
}

function falHeaders(): Record<string, string> {
  return { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" }
}

/** Submit a new generation job and persist its marker. */
export async function submitMini3DJob(hash: string, standeeUrl: string, chargedUserId: string): Promise<void> {
  const response = await fetch(`https://queue.fal.run/${FAL_ENDPOINT}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({
      input_image_url: standeeUrl,
      // Web-friendly output: modest face count, no PBR maps.
      face_count: 60000,
      generate_type: "Normal",
      enable_pbr: false,
    }),
  })
  if (!response.ok) {
    throw new Error(`fal submit failed: ${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  const body = (await response.json()) as { request_id: string; status_url: string; response_url: string }
  const marker: Mini3DJobMarker = {
    requestId: body.request_id,
    statusUrl: body.status_url,
    responseUrl: body.response_url,
    chargedUserId,
    startedAt: new Date().toISOString(),
  }
  await updateJsonOnS3(getJobMarkerKey(hash), marker)
}

export async function readMini3DJob(hash: string): Promise<Mini3DJobMarker | Mini3DClaim | null> {
  try {
    return (await readJsonFromS3(getJobMarkerKey(hash))) as Mini3DJobMarker | Mini3DClaim
  } catch {
    return null
  }
}

async function optimizeGlb(input: Buffer): Promise<Buffer> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.readBinary(new Uint8Array(input))
  await document.transform(
    dedup(),
    weld(),
    quantize(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] })
  )
  return Buffer.from(await io.writeBinary(document))
}

export type Mini3DPollResult = { status: "ready"; url: string } | { status: "pending" } | { status: "failed" }

/**
 * Advance a pending job: check fal status; when complete, download, optimize,
 * upload to the public bucket, and clear the marker.
 */
const JOB_ABANDON_MS = 30 * 60 * 1000

export async function pollMini3DJob(hash: string, marker: Mini3DJobMarker): Promise<Mini3DPollResult> {
  const jobAge = Date.now() - new Date(marker.startedAt).getTime()
  const statusResponse = await fetch(marker.statusUrl, { headers: falHeaders() })
  if (!statusResponse.ok) {
    // A non-ok status check is usually TRANSIENT (rate limit, account lock,
    // network) — the job may still complete and fal may still bill us for it.
    // Keep the marker and stay pending; only give up (and refund) once the
    // job is old enough that no fal generation could still be running.
    if (jobAge < JOB_ABANDON_MS) {
      console.warn(`[encounterview] mini3d status check ${statusResponse.status} for ${marker.requestId}; keeping job pending`)
      return { status: "pending" }
    }
    await deleteS3Object(getJobMarkerKey(hash)).catch(() => {})
    return { status: "failed" }
  }
  const status = ((await statusResponse.json()) as { status?: string }).status
  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    return { status: "pending" }
  }
  if (status !== "COMPLETED") {
    await deleteS3Object(getJobMarkerKey(hash)).catch(() => {})
    return { status: "failed" }
  }

  try {
    const resultResponse = await fetch(marker.responseUrl, { headers: falHeaders() })
    if (!resultResponse.ok) throw new Error(`fal result fetch failed: ${resultResponse.status}`)
    const result = (await resultResponse.json()) as { model_urls?: { glb?: string }; model_glb?: { url?: string } }
    const glbUrl = result.model_urls?.glb ?? result.model_glb?.url
    if (!glbUrl) throw new Error("fal result contained no GLB url")

    const glbResponse = await fetch(glbUrl)
    if (!glbResponse.ok) throw new Error(`GLB download failed: ${glbResponse.status}`)
    const raw = Buffer.from(await glbResponse.arrayBuffer())
    const optimized = await optimizeGlb(raw).catch((error) => {
      console.warn(`[encounterview] GLB optimize failed, storing raw: ${error instanceof Error ? error.message : error}`)
      return raw
    })

    if (!s3Client) throw new Error("S3 not configured")
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_PUBLIC,
        Key: getMini3DKey(hash),
        Body: optimized,
        ContentType: "model/gltf-binary",
        CacheControl: "public, max-age=31536000",
      })
    )
    await deleteS3Object(getJobMarkerKey(hash)).catch(() => {})
    const url = getAssetUrl(getMini3DKey(hash))
    if (!url) throw new Error("could not build asset URL")
    return { status: "ready", url }
  } catch (error) {
    console.warn(`[encounterview] mini3d finalize failed: ${error instanceof Error ? error.message : error}`)
    await deleteS3Object(getJobMarkerKey(hash)).catch(() => {})
    return { status: "failed" }
  }
}

export function getMini3DUrl(hash: string): string | null {
  return getAssetUrl(getMini3DKey(hash))
}
