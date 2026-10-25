import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { libraryFor } from "@/lib/store/server"

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ adventures: await libraryFor(userId) })
  } catch (error) {
    console.error("Error loading the adventure library:", error)
    return NextResponse.json({ error: "Could not load your adventures" }, { status: 500 })
  }
}
