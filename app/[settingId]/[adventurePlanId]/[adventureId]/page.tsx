import { notFound } from "next/navigation"
import type { Metadata } from "next"
import AdventureHome from "@/components/views/adventure-home"
import { loadAdventureWithNpc } from "@/app/_actions/load-adventure"
import type { Id } from "@/convex/_generated/dataModel"
import type { Adventure } from "@/types/adventure"
import { mapConvexTurnToTurn } from "@/lib/utils"
import { AdventurePlan } from "@/types/adventure-plan"

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

export async function generateMetadata({ params }: { params: Promise<{ settingId: string; adventurePlanId: string; adventureId: string }> }): Promise<Metadata> {
  const { adventurePlanId } = await params
  return {
    title: `Adventure | ${adventurePlanId}`,
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
  let adventurePlan = null
  try {
    // Dynamically import the adventure plan JSON file
    adventurePlan = (await import(`@/data/${adventurePlanId}.json`)).default
  } catch {
    return notFound()
  }
  if (!adventurePlan) return notFound()
  const adventureData = await loadAdventureWithNpc(adventureId as Id<"adventures">)
  const adventure = mapConvexAdventureToAdventure(adventureData?.adventure)
  const currentTurn = mapConvexTurnToTurn(adventureData?.currentTurn)

  if (!adventure) return notFound()

  const encounter = findEncounter(adventurePlan, currentTurn?.encounterId)

  return <AdventureHome settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure} encounterImage={encounter?.image || adventurePlan.image} currentTurn={currentTurn} />
}
