import type { Metadata } from "next"
import Link from "next/link"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"
import { requireAdmin } from "@/lib/auth-utils"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"

export const metadata: Metadata = {
  title: "Mapview Lab",
  description: "Generate and review 2D encounter battle maps.",
}

export default async function MapviewLabIndexPage() {
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

  const adventures = await listAdminWikiAdventures()
  return (
    <div className="container py-8 md:py-12">
      <Heading variant="h1" className="mb-2 text-amber-400">
        Mapview Lab
      </Heading>
      <p className="mb-8 text-muted-foreground">Generate 2D battle maps per encounter — standalone development surface for Mapview (see wiki/plans/mapview.md).</p>
      <div className="grid gap-4 md:grid-cols-2">
        {adventures.map((adventure) => (
          <Link
            key={`${adventure.settingId}/${adventure.planId}`}
            href={`/admin/mapview/${adventure.settingId}/${adventure.planId}`}
            className="rounded-md border border-lime-900/50 bg-[#151912] p-5 text-stone-100 transition-colors hover:border-amber-700"
          >
            <h2 className="text-xl font-semibold text-amber-300">{adventure.title}</h2>
            <p className="mt-1 font-mono text-xs text-stone-500">
              {adventure.settingId}/{adventure.planId}
            </p>
            <p className="mt-3 text-sm text-stone-400">{adventure.encounterCount} encounters</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
