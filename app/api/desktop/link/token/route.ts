import { NextResponse } from "next/server"
import { redeemLink } from "@/lib/desktop/server"

// The desktop app polls with its secret until the player approves, then receives its device token once.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pollSecret?: unknown }
  if (typeof body.pollSecret !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(body.pollSecret)) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  try {
    const result = await redeemLink(body.pollSecret)
    if (result.status === "expired") return NextResponse.json(result, { status: 410 })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error redeeming a desktop link:", error)
    return NextResponse.json({ error: "Could not finish linking" }, { status: 500 })
  }
}
