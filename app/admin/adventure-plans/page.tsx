import type { Metadata } from "next"
import Link from "next/link"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"
import { Button } from "@/components/ui/button"
import NativeImage from "@/components/ui/native-image"
import { requireAdmin } from "@/lib/auth-utils"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"

export const metadata: Metadata = {
  title: "Adventure Plans Workbench",
  description: "Admin workbench for wiki-authored adventure plans.",
}

const sourceLabel = {
  s3: {
    label: "S3 source",
    title: "Compiled from the edited copy in S3. Edits made here are already the live source of truth.",
  },
  local: {
    label: "Repo source",
    title:
      "Compiled from the markdown in this repo (content/settings/…). Either S3 has no copy yet, its copy is incomplete, or it is byte-identical to the repo. The next save here writes a canonical copy to S3.",
  },
} as const

export default async function AdminAdventurePlansPage() {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="container max-w-2xl pt-24 pb-12 md:pt-32 md:pb-16">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container pt-24 pb-12 md:pt-32 md:pb-16">
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
    <div className="min-h-screen bg-[#08071a]">
      <div className="container pt-24 pb-12 md:pt-32 md:pb-16">
        <div className="mx-auto max-w-6xl">
          <Heading variant="h3" as="h1" className="mb-2 text-amber-400">
            Adventure Plans
          </Heading>
          <p className="mb-8 text-muted-foreground">Chat with migrated wiki adventures and apply improvements directly to S3 source.</p>
          <div className="grid gap-6 md:grid-cols-2">
            {adventures.map((adventure) => {
              const source = sourceLabel[adventure.source]
              const href = `/admin/adventure-plans/${adventure.settingId}/${adventure.planId}`
              return (
                <article key={`${adventure.settingId}/${adventure.planId}`} className="overflow-hidden rounded-md border border-lime-900/50 bg-black text-stone-100">
                  <Link href={href} className="group relative block aspect-[16/7] overflow-hidden bg-black">
                    {adventure.image ? (
                      <NativeImage src={adventure.image} alt="" fill className="object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100" loading="eager" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-lime-950 to-black" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                      <h2 className="font-display text-xl text-amber-300">{adventure.title}</h2>
                      <p className="mt-1 font-mono text-xs text-stone-400">
                        {adventure.settingId}/{adventure.planId}
                      </p>
                    </div>
                    <span className="absolute right-3 top-3 rounded border border-amber-700 bg-amber-950/80 px-2 py-1 font-mono text-[10px] uppercase text-amber-200">{adventure.status}</span>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-sm text-stone-400">
                      {adventure.fileCount} files · {adventure.encounterCount} encounters ·{" "}
                      <span className="cursor-help underline decoration-dotted underline-offset-4" title={source.title}>
                        {source.label}
                      </span>
                    </p>
                    <Button asChild variant="epic" size="sm" className="px-5 py-1.5 text-xs">
                      <Link href={href}>Open Chat Editor</Link>
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
