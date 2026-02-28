import { decrementUserTokensAction, incrementUserTokensAction } from "@/app/_actions/tokens"
import { fetchUserTokenBalance } from "@/app/_actions/user-token-actions"
import { isAwsConfigured } from "@/lib/aws"
import { uploadFileToS3 } from "@/lib/s3-utils"
import { auth } from "@clerk/nextjs/server"
import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    // Check if AWS is configured
    if (!isAwsConfigured()) {
      return NextResponse.json({ error: "File upload system not configured" }, { status: 503 })
    }

    const IMAGE_UPLOAD_TOKEN_COST = 200

    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const folder = (formData.get("folder") as string) || "images"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed. Please upload an image (JPEG, PNG, WebP, SVG, or GIF)." }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 })
    }

    // Check if user has enough tokens for upload
    const tokenBalance = await fetchUserTokenBalance()

    // Handle authentication error
    if (tokenBalance.error === "USER_NOT_AUTHENTICATED") {
      return NextResponse.json({ error: "User authentication failed" }, { status: 401 })
    }

    // Handle other errors
    if (tokenBalance.error) {
      console.error("Failed to check token balance:", tokenBalance.error)
      return NextResponse.json(
        {
          error: "Unable to verify token balance",
        },
        { status: 500 }
      )
    }

    // Check token sufficiency
    if ((tokenBalance.tokensRemaining ?? 0) < IMAGE_UPLOAD_TOKEN_COST) {
      return NextResponse.json(
        {
          error: `Insufficient tokens for image upload. ${IMAGE_UPLOAD_TOKEN_COST} tokens required.`,
        },
        { status: 402 }
      ) // Payment Required
    }

    const tokenResult = await decrementUserTokensAction({
      tokensUsed: IMAGE_UPLOAD_TOKEN_COST,
      transactionType: "usage_image_upload",
    })

    if (!tokenResult.success) {
      if (tokenResult.errorCode === "INSUFFICIENT_TOKENS") {
        return NextResponse.json(
          {
            error: `Insufficient tokens for image upload. ${IMAGE_UPLOAD_TOKEN_COST} tokens required.`,
          },
          { status: 402 }
        )
      }
      return NextResponse.json({ error: "Failed to deduct tokens for image upload" }, { status: 500 })
    }

    const chargedTokens = tokenResult.data.chargedTokens

    // Generate a unique filename
    const fileExtension = file.name.split(".").pop()
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`

    try {
      const fileUrl = await uploadFileToS3(file, fileName)
      return NextResponse.json({ url: fileUrl })
    } catch (uploadError) {
      const refundResult = await incrementUserTokensAction({
        tokensToCredit: chargedTokens,
        transactionType: "adjustment_refund",
      })
      if (!refundResult.success) {
        console.error("Failed to refund tokens after upload failure:", refundResult.error, refundResult.details)
      }
      throw uploadError
    }
  } catch (error) {
    console.error("Error uploading file:", error)
    if (error instanceof Error && error.message === "AWS S3 is not configured") {
      return NextResponse.json({ error: "File upload system not configured" }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
