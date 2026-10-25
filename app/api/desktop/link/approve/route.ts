import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { normalizeUserCode } from "@/lib/desktop/link"
import { approveLink, lookupLink } from "@/lib/desktop/server"

// The signed-in player looks up a code shown by their desktop app, then approves it.
export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const code = normalizeUserCode(new URL(request.url).searchParams.get("code") ?? "")
  const link = code ? await lookupLink(code) : null
  if (!link) return NextResponse.json({ error: "This code is invalid or has expired." }, { status: 404 })
  return NextResponse.json(link)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { code?: unknown }
  const code = typeof body.code === "string" ? normalizeUserCode(body.code) : null
  if (!code) return NextResponse.json({ error: "This code is invalid or has expired." }, { status: 404 })
  const result = await approveLink(code, userId)
  if (result.status === "expired") return NextResponse.json({ error: "This code is invalid or has expired." }, { status: 404 })
  return NextResponse.json(result)
}
