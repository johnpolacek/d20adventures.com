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

export async function readMini3DJob(hash: string): Promise<Mini3DJobMarker | null> {
  try {
    return (await readJsonFromS3(getJobMarkerKey(hash))) as Mini3DJobMarker
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
export async function pollMini3DJob(hash: string, marker: Mini3DJobMarker): Promise<Mini3DPollResult> {
  const statusResponse = await fetch(marker.statusUrl, { headers: falHeaders() })
  if (!statusResponse.ok) {
    // Expired/unknown request — treat as failed so the charge can be refunded.
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
