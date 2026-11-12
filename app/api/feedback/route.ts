import { NextResponse } from "next/server"
import { feedbackSender } from "@/lib/feedback/server"
import { feedbackSchema } from "@/lib/feedback/shared"
import { ownsScreenshot, saveFeedback } from "@/lib/feedback/store"

const refuse = (error: string, status: number) => NextResponse.json({ error }, { status })
const MAX_BODY_CHARS = 64 * 1024

// Feedback from the game: the website's players by their session, the desktop app by its device token.
export async function POST(request: Request) {
  const { sender, error } = await feedbackSender(request)
  if (error) return error
  if (!request.headers.get("content-type")?.startsWith("application/json")) return refuse("That feedback could not be read.", 415)
  const body = await request.text()
  if (body.length > MAX_BODY_CHARS) return refuse("That feedback is too long.", 413)
  let json: unknown = null
  try {
    json = JSON.parse(body)
  } catch {}
  const parsed = feedbackSchema.safeParse(json)
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "That feedback could not be read.", 400)
  try {
    // A screenshot's key must be one the upload route gave this sender.
    const owned = await Promise.all(parsed.data.screenshots.map((key) => ownsScreenshot(sender.userId, key)))
    if (owned.includes(false)) return refuse("A screenshot could not be found. Attach it again.", 400)
    const saved = await saveFeedback({ ...sender, ...parsed.data })
    if ("limited" in saved) return refuse("You have sent a lot of feedback today. Try again tomorrow.", 429)
    return NextResponse.json({ ok: true })
  } catch (failure) {
    console.error("[feedback]", failure)
    return refuse("Could not send your feedback. Try again.", 503)
  }
}
