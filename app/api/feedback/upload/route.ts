import { NextResponse } from "next/server"
import { feedbackSender } from "@/lib/feedback/server"
import { MAX_UPLOAD_BYTES } from "@/lib/feedback/shared"
import { isJpeg, saveScreenshot } from "@/lib/feedback/store"

const refuse = (error: string, status: number) => NextResponse.json({ error }, { status })

// One screenshot, already shrunk to a JPEG by the sender, as the request's body. It is stored in the private bucket
// under the sender's account, and the key it answers with goes in the feedback that follows.
export async function POST(request: Request) {
  const { sender, error } = await feedbackSender(request)
  if (error) return error
  if (request.headers.get("content-type") !== "image/jpeg") return refuse("Screenshots are sent as JPEG images.", 415)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return refuse("That screenshot is too large.", 413)
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_UPLOAD_BYTES) return refuse("That screenshot is too large.", 413)
  if (!isJpeg(bytes)) return refuse("That file is not a JPEG image.", 400)
  try {
    const saved = await saveScreenshot(sender.userId, bytes)
    if ("limited" in saved) return refuse("You have sent a lot of screenshots today. Try again tomorrow.", 429)
    return NextResponse.json({ key: saved.key })
  } catch (failure) {
    console.error("[feedback/upload]", failure)
    return refuse("A screenshot could not upload. Try again.", 503)
  }
}
