import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"
import { Button } from "@/components/ui/button"
import { requireAdmin } from "@/lib/auth-utils"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Adventure Plans Workbench",
  description: "Admin workbench for wiki-authored adventure plans.",
}

export default async function AdminAdventurePlansPage() {
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
        <div className="mx-auto max-w-2xl text-center">
          <Heading variant="h1" className="mb-4">
            Access Denied
          </Heading>
          <p className="text-muted-foreground text-balance mb-8">You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
        </div>
      </div>
    )
  }

  const adventures = await listAdminWikiAdventures()
  return (
    <div className="container py-8 md:py-12">
      <Heading variant="h1" className="mb-2 text-amber-400">
        Adventure Plans
      </Heading>
      <p className="mb-8 text-muted-foreground">Chat with migrated wiki adventures and apply improvements directly to S3 source.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {adventures.map((adventure) => (
          <article key={`${adventure.settingId}/${adventure.planId}`} className="rounded-md border border-lime-900/50 bg-[#151912] p-5 text-stone-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-amber-300">{adventure.title}</h2>
                <p className="mt-1 font-mono text-xs text-stone-500">{adventure.settingId}/{adventure.planId}</p>
              </div>
              <span className="rounded border border-amber-700 bg-amber-950/60 px-2 py-1 font-mono text-[10px] uppercase text-amber-200">{adventure.status}</span>
            </div>
            <p className="mt-4 text-sm text-stone-400">
              {adventure.fileCount} files · {adventure.encounterCount} encounters · {adventure.source === "s3" ? "S3 source" : "local fallback"}
            </p>
            <Link href={`/admin/wiki-adventures/${adventure.settingId}/${adventure.planId}`} className="mt-4 block">
              <Button variant="outline" size="sm">
                Open Chat Editor
              </Button>
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
