import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { deviceFromRequest } from "@/lib/desktop/server"
import { createHostedAdventure, type HostCharacter, hostErrorResponse, hostedSummary, siteOrigin } from "@/lib/host/server"

// Games this account hosts, for the desktop home screen.
export async function GET(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  const adventures = await convex.query(api.hosting.hostedBy, { secret: serverSecret(), userId: device.userId })
  const origin = siteOrigin(request)
  return NextResponse.json({ hosted: await Promise.all(adventures.slice(0, 30).map((a) => hostedSummary(a, origin))) })
}

// Hosts a new game: the adventure waits in its website lobby for friends, with the host's character already seated.
export async function POST(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const body = (await request.json()) as { planId?: unknown; character?: HostCharacter }
    if (typeof body.planId !== "string" || !body.character) return NextResponse.json({ error: "Choose an adventure and a character." }, { status: 400 })
    const adventureId = await createHostedAdventure({ userId: device.userId, deviceId: device.deviceId, planId: body.planId, character: body.character })
    const adventure = await convex.query(api.adventure.getAdventureById, { adventureId })
    if (!adventure) throw new Error("The hosted game was not saved.")
    return NextResponse.json({ hosted: await hostedSummary(adventure, siteOrigin(request)) })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
