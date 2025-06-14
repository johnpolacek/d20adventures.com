import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import AdventureHome from "@/components/views/adventure-home"
import { loadAdventureWithNpc } from "@/app/_actions/load-adventure"
import type { Id } from "@/convex/_generated/dataModel"
import type { Adventure } from "@/types/adventure"
import type { PC, PCTemplate } from "@/types/character"
import { mapConvexTurnToTurn, reverseSlugify } from "@/lib/utils"
import { AdventurePlan } from "@/types/adventure-plan"
import { readJsonFromS3 } from "@/lib/s3-utils"

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

export async function generateMetadata({ params }: { params: Promise<{ settingId: string; adventurePlanId: string; adventureId: string }> }): Promise<Metadata> {
  const { adventurePlanId } = await params
  return {
    title: `D20 Adventures | ${reverseSlugify(adventurePlanId)}`,
  }
}

function findEncounter(adventurePlan: AdventurePlan, encounterIdToFind: string | undefined) {
  if (!encounterIdToFind) return null
  for (const section of adventurePlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === encounterIdToFind) {
          return encounter
        }
      }
    }
  }
  return null
}

export default async function AdventurePage(props: { params: Promise<{ settingId: string; adventurePlanId: string; adventureId: string }> }) {
  const { adventurePlanId, adventureId, settingId } = await props.params
  const adventurePlan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan
  if (!adventurePlan) return notFound()
  const adventureData = await loadAdventureWithNpc(adventureId as Id<"adventures">)
  const adventure = mapConvexAdventureToAdventure(adventureData?.adventure)
  const currentTurn = mapConvexTurnToTurn(adventureData?.currentTurn)

  if (!adventure) return notFound()

  // If there's a current turn, redirect to the turn-specific URL
  if (currentTurn) {
    const turnOrder = (adventureData?.currentTurn as { order?: number })?.order
    if (turnOrder) {
      redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}/${turnOrder}`)
    }
  }

  // Server-side: resolve party array
  let party: PC[] = []
  if (adventure.players && Array.isArray(adventure.players)) {
    const partyResults = await Promise.all(
      adventure.players.map(async (player) => {
        if (typeof player.characterId === "string" && player.characterId.startsWith("characters/")) {
          try {
            const pcTemplate = (await readJsonFromS3(player.characterId)) as PCTemplate
            // Convert PCTemplate to PC by adding userId
            return { ...pcTemplate, userId: player.userId } as PC
          } catch (err) {
            console.error("[AdventurePage] Failed to load custom character from S3:", player.characterId, err)
            return undefined
          }
        } else if (adventurePlan?.premadePlayerCharacters) {
          const pc = adventurePlan.premadePlayerCharacters.find((c) => c.id === player.characterId)
          if (pc && typeof pc === "object") return { ...pc, userId: player.userId } as PC
        }
        return undefined
      })
    )
    party = partyResults.filter((pc): pc is PC => !!pc)
  }

  const encounter = findEncounter(adventurePlan, currentTurn?.encounterId)

  return (
    <AdventureHome
      settingId={settingId}
      adventurePlanId={adventurePlanId}
      adventure={{ ...adventure, party }}
      encounterImage={encounter?.image || adventurePlan.image}
      currentTurn={currentTurn}
      adventurePlan={adventurePlan}
    />
  )
}
