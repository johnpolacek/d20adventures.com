import type { Metadata } from "next"
import Link from "next/link"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { MapviewLab } from "@/components/mapview/mapview-lab"
import { Heading } from "@/components/typography/heading"
import { requireAdmin } from "@/lib/auth-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

export const metadata: Metadata = {
  title: "Mapview Lab",
  description: "Generate and review 2D encounter battle maps.",
}

export default async function MapviewLabPlanPage(props: { params: Promise<{ settingId: string; planId: string }> }) {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="container max-w-2xl py-8 md:py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container py-8 md:py-12">
        <Heading variant="h1">Access Denied</Heading>
      </div>
    )
  }

  const { settingId, planId } = await props.params
  const plan = await loadAdventurePlanForRuntime(settingId, planId)
  const encounters = plan.sections.flatMap((section) =>
    section.scenes.flatMap((scene) =>
      scene.encounters.map((encounter) => ({
        id: encounter.id,
        title: encounter.title,
        sectionTitle: section.title,
        sceneTitle: scene.title,
        npcCount: encounter.npc?.length ?? 0,
      }))
    )
  )

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-2 flex items-baseline gap-3">
        <Heading variant="h1" className="text-amber-400">
          Mapview Lab
        </Heading>
        <Link href="/admin/mapview" className="text-sm text-stone-500 hover:text-amber-400">
          ← all adventures
        </Link>
      </div>
      <p className="mb-8 text-muted-foreground">
        {plan.title} · {settingId}/{planId}
      </p>
      <MapviewLab settingId={settingId} planId={planId} encounters={encounters} />
    </div>
  )
}
