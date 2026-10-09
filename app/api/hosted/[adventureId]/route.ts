import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"

// The host's app counts as online while it has asked for GM work within this long.
const ONLINE_MS = 60 * 1000

// A hosted game's state for its players: the adventure, its current turn, the GM's recent work, and whether the
// host's app is online.
export async function GET(_request: Request, { params }: { params: Promise<{ adventureId: string }> }) {
  const { userId } = await auth()
  try {
    const adventure = await assertAdventureAccess(userId, (await params).adventureId as Id<"adventures">)
    if (!adventure.host) return NextResponse.json({ error: "This game is not hosted." }, { status: 404 })
    const [turn, jobs] = await Promise.all([
      adventure.currentTurnId ? convex.query(api.adventure.getTurnById, { turnId: adventure.currentTurnId }) : null,
      convex.query(api.hosting.recentJobs, { secret: serverSecret(), adventureId: adventure._id }),
    ])
    const hostOnline = Boolean(adventure.host.seenAt && Date.now() - adventure.host.seenAt < ONLINE_MS)
    return NextResponse.json({ adventure, turn, jobs, hostOnline, userId })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the game." }, { status })
  }
}
