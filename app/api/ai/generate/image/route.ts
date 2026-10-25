import { replicate } from "@ai-sdk/replicate"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { experimental_generateImage as generateImage } from "ai"
import type { NextRequest } from "next/server"
import { AWS_BUCKET_PUBLIC, s3Client } from "@/lib/aws"
import { requireAuthMiddleware } from "../../_auth"

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware()
  if (authError) return authError

  try {
    const { input, userId, deckId, aspectRatio } = await request.json()
    const userFolder = userId || "guest"

    // Check if placeholder images should be used
    if (process.env.NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES === "true") {
      return Response.json({
        imageUrl: "https://placehold.co/600x900",
        success: true,
      })
    }

    if (!s3Client) {
      return Response.json({ error: "S3 client not initialized", success: false }, { status: 500 })
    }

    const { image } = await generateImage({
      // klein-4b is the low-latency tier (the flux-2 successor to flux-schnell) — this
      // route is synchronous and the user waits on it. Set REPLICATE_MODEL to
      // black-forest-labs/flux-2-pro when quality matters more than speed.
      model: replicate.image(process.env.REPLICATE_MODEL || "black-forest-labs/flux-2-klein-4b"),
      prompt: input,
      aspectRatio: aspectRatio || "1:1",
    })

    // Upload to S3
    const key = `decks/${userFolder}/${deckId}/${Date.now()}.webp`
    await s3Client.send(
      new PutObjectCommand({
        Bucket: AWS_BUCKET_PUBLIC,
        Key: key,
        Body: image.uint8Array,
        ContentType: "image/webp",
      })
    )

    // Return both the image and the S3 URL
    return Response.json({
      imageUrl: `https://${AWS_BUCKET_PUBLIC}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`,
      success: true,
    })
  } catch (error) {
    console.error("Error generating or uploading image:", error)
    return Response.json({ error: "Failed to generate or upload image", success: false }, { status: 500 })
  }
}
