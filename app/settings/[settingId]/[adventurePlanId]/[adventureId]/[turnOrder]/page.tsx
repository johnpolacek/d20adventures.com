import { notFound } from "next/navigation"
import type { Metadata } from "next"
import AdventureHome from "@/components/views/adventure-home"
import { loadAdventureWithTurnByOrder, getTurnNavigationInfo } from "@/app/_actions/load-adventure"
import type { Id } from "@/convex/_generated/dataModel"
import type { Adventure } from "@/types/adventure"
import { mapConvexTurnToTurn } from "@/lib/utils"
import { AdventurePlan } from "@/types/adventure-plan"
import TurnNavigation from "@/components/adventure/turn-navigation"
import { reverseSlugify } from "@/lib/utils"
import { isDev } from "@/lib/auth-utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"

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

  // Use 1-based URL parameter directly since database stores 1-based order values
  const turnOrderForDb = turnOrderNum

  // Load adventure and specific turn + navigation info in parallel
  const [adventureData, navInfo] = await Promise.all([loadAdventureWithTurnByOrder(adventureId as Id<"adventures">, turnOrderForDb), getTurnNavigationInfo(adventureId as Id<"adventures">)])

  const adventure = mapConvexAdventureToAdventure(adventureData?.adventure)
  const currentTurn = mapConvexTurnToTurn(adventureData?.currentTurn)

  if (!adventure) return notFound()
  if (!currentTurn) return notFound()

  const encounter = findEncounter(adventurePlan, currentTurn?.encounterId)
  const isLatestTurn = turnOrderNum === (navInfo?.totalTurns ?? 0)

  const canEdit = isDev()

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
      {canEdit && (
        <Link className="fixed top-[90vh] right-8 z-10" href={`/settings/${settingId}/${adventurePlanId}/edit`}>
          <Button className="text-sm bg-primary-600 hover:bg-primary-700">Edit</Button>
        </Link>
      )}
    </div>
  )
}
