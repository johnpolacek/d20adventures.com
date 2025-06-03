import { notFound } from "next/navigation"
import type { Metadata } from "next"
import AdventureHome from "@/components/views/adventure-home"
import { loadAdventureWithTurnByOrder, getTurnNavigationInfo } from "@/app/_actions/load-adventure"
import type { Id } from "@/convex/_generated/dataModel"
import type { Adventure } from "@/types/adventure"
import { mapConvexTurnToTurn } from "@/lib/utils"
import { AdventurePlan } from "@/types/adventure-plan"
import TurnNavigation from "@/components/adventure/turn-navigation"

export const dynamic = "force-dynamic"

// Helper to map Convex adventure to frontend Adventure type
function mapConvexAdventureToAdventure(raw: unknown): Adventure | null {
  if (!raw || typeof raw !== "object" || !("_id" in raw)) return null
  const a = raw as { _id: string; title: string; planId: string; startedAt: number; endedAt?: number; settingId?: string }
  return {
    id: a._id,
    title: a.title,
    adventurePlanId: a.planId,
    settingId: a.settingId ?? "",
    party: [],
    turns: [],
    startedAt: a.startedAt ? new Date(a.startedAt).toISOString() : "",
    endedAt: a.endedAt ? new Date(a.endedAt).toISOString() : undefined,
    pausedAt: undefined,
  }
}

interface PageProps {
  params: Promise<{
    settingId: string
    adventurePlanId: string
    adventureId: string
    turnOrder: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { adventurePlanId, turnOrder } = await params
  return {
    title: `Adventure | ${adventurePlanId} | Turn ${turnOrder}`,
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

export default async function TurnPage({ params }: PageProps) {
  const { adventurePlanId, adventureId, settingId, turnOrder } = await params

  // Parse turn order as number
  const turnOrderNum = parseInt(turnOrder, 10)
  if (isNaN(turnOrderNum) || turnOrderNum < 1) {
    return notFound()
  }

  // Load adventure plan
  let adventurePlan = null
  try {
    adventurePlan = (await import(`@/data/${adventurePlanId}.json`)).default
  } catch {
    return notFound()
  }
  if (!adventurePlan) return notFound()

  // Convert 1-based URL parameter to 0-based for database query
  const turnOrderForDb = turnOrderNum - 1

  // Load adventure and specific turn + navigation info in parallel
  const [adventureData, navInfo] = await Promise.all([loadAdventureWithTurnByOrder(adventureId as Id<"adventures">, turnOrderForDb), getTurnNavigationInfo(adventureId as Id<"adventures">)])

  const adventure = mapConvexAdventureToAdventure(adventureData?.adventure)
  const currentTurn = mapConvexTurnToTurn(adventureData?.currentTurn)

  if (!adventure) return notFound()
  if (!currentTurn) return notFound()

  const encounter = findEncounter(adventurePlan, currentTurn?.encounterId)

  // Convert 0-based current turn order from navInfo to 1-based for comparison
  const currentTurnOrderFromNav = (navInfo?.currentTurnOrder ?? 0) + 1
  const isLatestTurn = currentTurnOrderFromNav === turnOrderNum

  console.log("[TurnPage] isLatestTurn:", isLatestTurn)

  return (
    <div className="min-h-screen relative">
      <div className="max-w-6xl mx-auto p-4 absolute top-12 right-0 z-10">
        <TurnNavigation currentTurnOrder={turnOrderNum} totalTurns={navInfo?.totalTurns || 1} isLatestTurn={isLatestTurn} />
      </div>
      <AdventureHome
        settingId={settingId}
        adventurePlanId={adventurePlanId}
        adventure={adventure}
        encounterImage={encounter?.image || adventurePlan.image}
        currentTurn={currentTurn}
        disableSSE={!isLatestTurn}
      />
    </div>
  )
}
