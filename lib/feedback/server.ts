import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { deviceFromRequest } from "@/lib/desktop/server"

type Sender = { userId: string; source: "web" | "desktop" }

function sameHost(origin: string, host: string | null) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Who sent a feedback request: the desktop app by its device token, or a signed-in player on the website. A browser
 * request from another site is refused, so no page elsewhere can post as a signed-in player.
 */
export async function feedbackSender(request: Request): Promise<{ sender: Sender; error?: undefined } | { sender?: undefined; error: NextResponse }> {
  const refuse = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status }) })
  if (request.headers.get("authorization")) {
    const { device } = await deviceFromRequest(request)
    return device ? { sender: { userId: device.userId, source: "desktop" } } : refuse("This computer is not linked.", 401)
  }
  const origin = request.headers.get("origin")
  if (origin && !sameHost(origin, request.headers.get("host"))) return refuse("Forbidden", 403)
  const { userId } = await auth()
  return userId ? { sender: { userId, source: "web" } } : refuse("Sign in to send feedback.", 401)
}
