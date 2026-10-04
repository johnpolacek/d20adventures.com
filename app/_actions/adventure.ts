"use server"

import { auth } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { createServerCore } from "@/lib/gm-server/core"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { Adventure } from "@/types/adventure"
import type { PC } from "@/types/character"

export async function processTurnReply(args: { turnId: Id<"turns">; characterId: string; narrativeAction: string; originalPlayerInput?: string }) {
  return createServerCore().processTurnReply(args)
}

export async function createAdventureWithFirstTurn(
  payload: Parameters<ReturnType<typeof createServerCore>["createAdventureWithFirstTurn"]>[0]
): Promise<{ adventureId: Id<"adventures">; turnId: Id<"turns"> }> {
  return (await createServerCore().createAdventureWithFirstTurn(payload)) as { adventureId: Id<"adventures">; turnId: Id<"turns"> }
}

export async function resolvePlayerRollResult(args: { turnId: Id<"turns">; characterId: string; result: number }): Promise<Doc<"turns"> | null> {
  return (await createServerCore().resolvePlayerRollResult(args)) as Doc<"turns"> | null
}

export async function getActiveAdventureForUser() {
  const { userId } = await auth()
  if (!userId) return { activeAdventure: null, userId: null }

  // Query for adventures where the user is a player and status is 'active' or 'waitingForPlayers'
  const activeAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "active",
  })
  const waitingAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "waitingForPlayers",
  })

  const getRunPriority = (adventure: { runType?: "campaign" | "practice" }) => ((adventure.runType ?? "campaign") === "campaign" ? 0 : 1)
  const prioritizedActive = [...activeAdventures].sort((a, b) => getRunPriority(a) - getRunPriority(b))
  const prioritizedWaiting = [...waitingAdventures].sort((a, b) => getRunPriority(a) - getRunPriority(b))

  // Prefer active campaign, then active practice, then waiting campaign, then waiting practice.
  const adventure = prioritizedActive[0] || prioritizedWaiting[0]

  if (!adventure) return { activeAdventure: null, userId }

  // Load the adventure plan for party info
  const adventurePlan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
  if (!adventurePlan) return { activeAdventure: null, userId }

  // Map players to full PC objects from adventure plan
  const partyResults = await Promise.all(
    (adventure.players || []).map(async (player: { userId: string; characterId: string }) => {
      if (typeof player.characterId === "string" && player.characterId.startsWith("characters/")) {
        try {
          const character = (await readJsonFromS3(player.characterId)) as PC
          return { ...character, userId: player.userId }
        } catch {
          return null
        }
      }

      if (Array.isArray(adventurePlan.premadePlayerCharacters)) {
        const character = adventurePlan.premadePlayerCharacters.find((pc) => pc.id === player.characterId)
        if (character) {
          return { ...character, userId: player.userId }
        }
      }

      return null
    })
  )
  const party = partyResults.filter((char): char is PC => char !== null)

  // Return a shape compatible with Adventure type
  return {
    activeAdventure: {
      id: adventure._id,
      title: adventure.title,
      adventurePlanId: adventure.planId,
      settingId: adventure.settingId,
      ownerId: adventure.ownerId,
      runType: adventure.runType ?? "campaign",
      parentAdventureId: adventure.parentAdventureId,
      parentTurnId: adventure.parentTurnId,
      status: adventure.status,
      party,
      turns: [],
      startedAt: adventure.startedAt ? new Date(adventure.startedAt).toISOString() : "",
      endedAt: adventure.endedAt ? new Date(adventure.endedAt).toISOString() : undefined,
      pausedAt: undefined,
    } as Adventure,
    userId,
  }
}

export async function getAdventuresForUser() {
  const { userId } = await auth()
  if (!userId) return []

  // Fetch all adventures for this user (all statuses)
  const allStatuses: ("active" | "waitingForPlayers" | "completed")[] = ["active", "waitingForPlayers", "completed"]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adventures: any[] = []
  for (const status of allStatuses) {
    const result = await convex.query(api.adventure.getAdventuresByPlayer, {
      playerId: userId,
      status,
    })
    adventures = adventures.concat(result)
  }
  // Remove duplicates by id

  const unique = Object.values(
    adventures.reduce(
      (acc, adv) => {
        acc[adv._id] = adv
        return acc
      },
      {} as Record<string, (typeof adventures)[number]>
    )
  )
  return unique
}

export async function getNextAdventure({ settingId, adventurePlanId }: { settingId: string; adventurePlanId: string }) {
  // No auth required, this is public data
  const plan = await loadAdventurePlanForRuntime(settingId, adventurePlanId)
  if (!plan) return null
  return plan.nextAdventure || null
}

export async function getAdventureLobbyData(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  await assertAdventureAccess(userId, adventureId)
  return convex.query(api.adventure.getAdventureLobbyData, { adventureId })
}
