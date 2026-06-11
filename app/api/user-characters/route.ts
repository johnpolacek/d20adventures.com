import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getUserCharacters } from "@/app/_actions/character"
import { isUserAdmin } from "@/lib/auth-utils"

export async function GET(req: Request) {
  const { userId: authenticatedUserId } = await auth()
  if (!authenticatedUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const requestedUserId = searchParams.get("userId")?.trim()
  const targetUserId = requestedUserId || authenticatedUserId

  if (targetUserId !== authenticatedUserId && !isUserAdmin(authenticatedUserId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const characters = await getUserCharacters(targetUserId)
  return NextResponse.json(characters, { headers: { "Cache-Control": "no-store" } })
}
