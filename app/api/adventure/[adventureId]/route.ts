import { loadAdventureWithNpc } from "@/app/_actions/load-adventure"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Adventure } from "@/types/adventure"
import type { PC, PCTemplate } from "@/types/character"
import { auth } from "@clerk/nextjs/server"
import { type NextRequest, NextResponse } from "next/server"

// Helper to map Convex adventure to frontend Adventure type
function mapConvexAdventureToAdventure(raw: unknown): Adventure | null {
  if (!raw || typeof raw !== "object" || !("_id" in raw)) return null
  const a = raw as {
    _id: string
    title: string
    planId: string
    startedAt: number
    endedAt?: number
    settingId?: string
    status?: "waitingForPlayers" | "active" | "completed"
    players?: Array<{ userId: string; characterId: string }>
    playerIds?: string[]
  }

  return {
    id: a._id,
    title: a.title,
    adventurePlanId: a.planId,
    settingId: a.settingId ?? "",
    status: a.status || "active", // Default to active for backwards compatibility
    party: [],
    players: a.players ?? [],
    turns: [],
    startedAt: a.startedAt ? new Date(a.startedAt).toISOString() : "",
    endedAt: a.endedAt ? new Date(a.endedAt).toISOString() : undefined,
    pausedAt: undefined,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ adventureId: string }> }) {
  try {
    const { adventureId } = await params
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessAdventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
    if (!accessAdventure) {
      return NextResponse.json({ error: "Adventure not found" }, { status: 404 })
    }
    const canAccess = accessAdventure.ownerId === userId || (Array.isArray(accessAdventure.playerIds) && accessAdventure.playerIds.includes(userId))
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adventureData = await loadAdventureWithNpc(adventureId as Id<"adventures">)

    if (!adventureData?.adventure) {
      return NextResponse.json({ error: "Adventure not found" }, { status: 404 })
    }

    const adventure = mapConvexAdventureToAdventure(adventureData.adventure)

    if (!adventure) {
      return NextResponse.json({ error: "Adventure not found" }, { status: 404 })
    }

    // Resolve party array with character data
    let party: PC[] = []
    if (adventure.players && Array.isArray(adventure.players)) {
      const partyResults = await Promise.all(
        adventure.players.map(async (player: { userId: string; characterId: string }) => {
          if (typeof player.characterId === "string" && player.characterId.startsWith("characters/")) {
            try {
              const pcTemplate = (await readJsonFromS3(player.characterId)) as PCTemplate
              // Convert PCTemplate to PC by adding userId
              return { ...pcTemplate, userId: player.userId } as PC
            } catch (err) {
              console.error("[AdventureAPI] Failed to load custom character from S3:", player.characterId, err)
              return undefined
            }
          } else {
            // For premade characters, we need to get the adventure plan to resolve them
            // This is a simplified version - in practice you might want to pass the adventure plan ID
            return undefined
          }
        })
      )
      party = partyResults.filter((pc: PC | undefined): pc is PC => !!pc)
    }

    return NextResponse.json({ ...adventure, party })
  } catch (error) {
    console.error("[AdventureAPI] Error fetching adventure:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
