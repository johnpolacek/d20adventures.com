// Avatar-derived standee minis: the character's bust portrait goes to Gemini's
// image model with instructions to render the SAME character full-body in the
// same painted style on a solid green screen; we chroma-key the background off
// and cache the cutout PNG in the public bucket, keyed by a hash of the source
// image URL (stable per character art, shared across adventures).
//
// Server-only (sharp + S3). Model verified live 2026-07-04: gemini-3.1-flash-image.

import { createHash } from "node:crypto"
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { getAssetUrl, s3Client } from "@/lib/aws"

export const STANDEE_MODEL_ID = "gemini-3.1-flash-image"

export function getStandeeHash(sourceImageUrl: string): string {
  return createHash("sha1").update(sourceImageUrl).digest("hex")
}

export function getStandeeKey(sourceImageUrl: string): string {
  return `images/minis/${getStandeeHash(sourceImageUrl)}.png`
}

export async function standeeExists(key: string): Promise<boolean> {
  if (!s3Client) return false
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_PUBLIC, Key: key }))
    return true
  } catch {
    return false
  }
}

function buildStandeePrompt(args: { name: string; race?: string; archetype?: string; appearance?: string }): string {
  const identity = [args.race, args.archetype].filter(Boolean).join(" ")
  return `Using the provided portrait as the exact visual reference, render the SAME character as a COMPLETE full-body standing figure for a tabletop miniature.

Character: ${args.name}${identity ? ` — ${identity}` : ""}${args.appearance ? `\nAppearance notes: ${args.appearance.slice(0, 400)}` : ""}

Requirements:
- Entire body visible head to toe, nothing cropped; comfortable margin on all four sides.
- Same face, coloring, costume, and mood as the portrait; extend the outfit plausibly below the bust.
- Painted cinematic dark-fantasy style matching the portrait exactly — NOT cartoon, NOT chibi, NOT cute.
- Standing alert pose on the ground, front three-quarter view, dramatic lighting consistent with the portrait.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere. No scenery, no shadows on the background, no text, no border, no logo. One character only.`
}

async function generateStandeeRender(sourceImage: Buffer, sourceMimeType: string, prompt: string): Promise<Buffer> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${STANDEE_MODEL_ID}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }, { inline_data: { mime_type: sourceMimeType, data: sourceImage.toString("base64") } }],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  })
  if (!response.ok) {
    throw new Error(`standee render failed: ${response.status} ${(await response.text()).slice(0, 300)}`)
  }
  const body = (await response.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  for (const part of body.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data ?? part.inline_data?.data
    if (data) return Buffer.from(data, "base64")
  }
  throw new Error("standee render returned no image")
}

/** Green-screen removal + despill + trim to the figure's bounding box. */
async function chromaKeyCutout(rendered: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const greenness = g - Math.max(r, b)
      if (greenness > 45) {
        data[i + 3] = 0
      } else if (greenness > 14) {
        // soften and despill the edge fringe
        data[i + 3] = Math.round(data[i + 3] * (1 - (greenness - 14) / 40))
        data[i + 1] = Math.max(r, b)
      }
      if (data[i + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) throw new Error("standee cutout came out empty")

  const pad = Math.round(Math.max(width, height) * 0.015)
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const cutWidth = Math.min(width - left, maxX - minX + pad * 2)
  const cutHeight = Math.min(height - top, maxY - minY + pad * 2)

  return sharp(data, { raw: { width, height, channels: channels as 4 } })
    .extract({ left, top, width: cutWidth, height: cutHeight })
    .resize({ height: 1024, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
}

export interface StandeeSource {
  imageUrl: string
  name: string
  race?: string
  archetype?: string
  appearance?: string
}

/** Generate (or fetch cached) standee cutout; returns the public URL, or null on failure. */
export async function getOrCreateStandee(source: StandeeSource): Promise<string | null> {
  try {
    const key = getStandeeKey(source.imageUrl)
    if (await standeeExists(key)) {
      return getAssetUrl(key)
    }

    const portraitResponse = await fetch(source.imageUrl)
    if (!portraitResponse.ok) throw new Error(`portrait fetch failed: ${portraitResponse.status}`)
    const portrait = Buffer.from(await portraitResponse.arrayBuffer())
    const mimeType = portraitResponse.headers.get("content-type") ?? "image/png"

    const rendered = await generateStandeeRender(portrait, mimeType, buildStandeePrompt(source))
    const cutout = await chromaKeyCutout(rendered)

    if (!s3Client) throw new Error("S3 not configured")
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_PUBLIC,
        Key: key,
        Body: cutout,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000",
      })
    )
    return getAssetUrl(key)
  } catch (error) {
    console.warn(`[encounterview] standee generation failed for ${source.name}: ${error instanceof Error ? error.message : error}`)
    return null
  }
}
