import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { listDevices, revokeDevice } from "@/lib/desktop/server"

// The signed-in player's linked computers, and revoking one from the website.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ devices: await listDevices(userId) })
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing device" }, { status: 400 })
  const result = await revokeDevice(userId, id).catch(() => ({ revoked: false }))
  return NextResponse.json(result, { status: result.revoked ? 200 : 404 })
}
