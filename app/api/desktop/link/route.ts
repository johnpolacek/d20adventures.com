import { NextResponse } from "next/server"
import { cleanDeviceName, displayUserCode, POLL_INTERVAL_S } from "@/lib/desktop/link"
import { startLink } from "@/lib/desktop/server"

// The desktop app starts a link. No account yet: the player approves the code on the website.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { deviceName?: unknown }
    const { userCode, pollSecret, expiresAt } = await startLink(cleanDeviceName(body.deviceName))
    const verifyUrl = new URL(`/desktop/link?code=${userCode}`, request.url).toString()
    return NextResponse.json({ userCode: displayUserCode(userCode), pollSecret, verifyUrl, expiresAt, interval: POLL_INTERVAL_S })
  } catch (error) {
    console.error("Error starting a desktop link:", error)
    return NextResponse.json({ error: "Could not start linking" }, { status: 500 })
  }
}
