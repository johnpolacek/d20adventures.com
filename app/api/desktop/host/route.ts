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

// Hosts a new game: the adventure waits in its website lobby for friends, with the host's characters already seated
// a seat held for each invited hero, AI heroes, and open seats for guests' own heroes. Without a character, guests choose among
// the invited heroes and the host plays one they leave, or with watch the host has no hero.
export async function POST(request: Request) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const body = (await request.json()) as { planId?: unknown; character?: HostCharacter; characters?: unknown; invites?: unknown; ais?: unknown; open?: unknown; approve?: unknown; watch?: unknown; each?: unknown }
    const invites = Array.isArray(body.invites) ? (body.invites.slice(0, 8) as HostCharacter[]) : []
    // An older app sends the host's one character.
    const characters = Array.isArray(body.characters) ? (body.characters.slice(0, 8) as HostCharacter[]) : body.character ? [body.character] : []
    if (typeof body.planId !== "string" || (!characters.length && invites.length < 2 && body.watch !== true))
      return NextResponse.json({ error: "Choose an adventure and a character." }, { status: 400 })
    const adventureId = await createHostedAdventure({
      userId: device.userId,
      deviceId: device.deviceId,
      planId: body.planId,
      characters,
      invites,
      ais: Array.isArray(body.ais) ? (body.ais.slice(0, 8) as HostCharacter[]) : [],
      open: typeof body.open === "number" ? body.open : 0,
      approve: body.approve === true,
      watch: body.watch === true,
      each: typeof body.each === "number" && Number.isInteger(body.each) && body.each > 0 ? body.each : undefined,
    })
    const adventure = await convex.query(api.adventure.getAdventureById, { adventureId })
    if (!adventure) throw new Error("The hosted game was not saved.")
    return NextResponse.json({ hosted: await hostedSummary(adventure, siteOrigin(request)) })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
