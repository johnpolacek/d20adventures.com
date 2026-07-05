"use server"

// Store a small JPEG snapshot of the staged 3D encounter scene, captured
// client-side from the canvas after the overlay renders. One per turn,
// write-once: the right-rail Encounter card uses it as its preview image.
// No token charge — it's a byproduct screenshot with no vendor cost.

import { auth } from "@clerk/nextjs/server"
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { s3Client } from "@/lib/aws"

const MAX_BYTES = 300 * 1024

export async function getScenePreviewKey(adventureId: string, turnId: string): Promise<string> {
  return `images/scene-previews/${adventureId}/${turnId}.jpg`
}

export async function uploadScenePreview(args: { turnId: string; dataUrl: string }): Promise<{ stored: boolean }> {
  const { userId } = await auth()
  const { turn } = await assertAdventureAccessByTurn(userId, args.turnId as Id<"turns">)

  const match = args.dataUrl.match(/^data:image\/jpeg;base64,(.+)$/)
  if (!match) return { stored: false }
  const buffer = Buffer.from(match[1], "base64")
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return { stored: false }

  if (!s3Client) return { stored: false }
  const key = await getScenePreviewKey(turn.adventureId, args.turnId)
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_PUBLIC, Key: key }))
    return { stored: false } // already captured by an earlier viewer
  } catch {
    // not present yet — store it
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_PUBLIC,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000",
    })
  )
  return { stored: true }
}
