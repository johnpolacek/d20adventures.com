import { getUserCharacters } from "@/app/_actions/character"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  if (!userId) return NextResponse.json([], { status: 400 })
  const characters = await getUserCharacters(userId)
  return NextResponse.json(characters)
}
