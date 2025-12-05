import { getRollRequirement } from "@/app/_actions/get-roll-requirement"
import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const { reply, character } = await req.json()
  const rollRequirement = await getRollRequirement(reply, character)
  return Response.json({ rollRequirement })
}
