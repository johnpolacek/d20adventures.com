import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { deviceFromRequest } from "@/lib/desktop/server"
import { postTableChat, tableChat } from "@/lib/host/chat"
import { thrownMessage } from "@/lib/host/seats"
import { guestHero, HostError, hostErrorResponse, hostedAdventure, hostedSummary, seatHost, siteOrigin } from "@/lib/host/server"
import { startWikiAdventure } from "@/lib/wiki-adventures/start"

// A hosted game's state for the host's app: the adventure, its current turn, recent GM work, and the table chat.
export async function GET(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const adventure = await hostedAdventure((await params).adventureId, device.userId)
    const [turn, jobs, chat] = await Promise.all([
      adventure.currentTurnId ? convex.query(api.adventure.getTurnById, { turnId: adventure.currentTurnId }) : null,
      convex.query(api.hosting.recentJobs, { secret: serverSecret(), adventureId: adventure._id }),
      tableChat(adventure._id),
    ])
    return NextResponse.json({ adventure, turn, jobs, chat, summary: await hostedSummary(adventure, siteOrigin(request)), userId: device.userId })
  } catch (e) {
    return hostErrorResponse(e)
  }
}

// The host reads a guest's hero sheet, answers a guest's request for an open seat, removes a seated guest, says
// something in the table chat, or starts the game once friends have joined in the lobby.
export async function POST(request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { device, error } = await deviceFromRequest(request)
  if (error) return error
  try {
    const adventure = await hostedAdventure((await params).adventureId, device.userId)
    const { action, ...body } = (await request.json()) as { action?: string; userId?: unknown; approve?: unknown; note?: unknown; text?: unknown }
    if (action === "sheet") {
      if (typeof body.userId !== "string") return NextResponse.json({ error: "Choose a guest." }, { status: 400 })
      return NextResponse.json({ sheet: await guestHero(adventure, body.userId) })
    }
    if (action === "remove") {
      if (typeof body.userId !== "string") return NextResponse.json({ error: "Choose a guest." }, { status: 400 })
      const removal = { userId: body.userId, name: (await guestHero(adventure, body.userId)).name, note: typeof body.note === "string" ? body.note : undefined }
      await convex.mutation(api.hosting.removeGuest, { secret: serverSecret(), adventureId: adventure._id, hostUserId: device.userId, ...removal }).catch((e) => {
        throw new HostError(409, thrownMessage(e, "The guest could not be removed."))
      })
      return NextResponse.json({ removed: true })
    }
    if (action === "answer") {
      if (typeof body.userId !== "string" || typeof body.approve !== "boolean") return NextResponse.json({ error: "Choose a request to answer." }, { status: 400 })
      const note = typeof body.note === "string" ? body.note : undefined
      await convex.mutation(api.hosting.answerSeat, { secret: serverSecret(), adventureId: adventure._id, hostUserId: device.userId, userId: body.userId, approve: body.approve, note }).catch((e) => {
        throw new HostError(409, thrownMessage(e, "The request could not be answered."))
      })
      return NextResponse.json({ answered: true })
    }
    if (action === "chat") {
      const text = typeof body.text === "string" ? body.text.trim() : ""
      if (!text || text.length > 1000) return NextResponse.json({ error: "Write a message of up to 1000 characters." }, { status: 400 })
      return NextResponse.json({ chat: await postTableChat(adventure, device.userId, text) })
    }
    if (action !== "start") return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    if (adventure.status !== "waitingForPlayers" || adventure.currentTurnId) return NextResponse.json({ error: "This game has already started." }, { status: 409 })
    const turnId = await startWikiAdventure(await seatHost(adventure))
    return NextResponse.json({ turnId })
  } catch (e) {
    return hostErrorResponse(e)
  }
}
