import type { Metadata } from "next"
import type { CSSProperties } from "react"
import Link from "next/link"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Button } from "@d20/ui/button"
import { LedgerHead } from "@/components/layout/ledger-page"
import { Tip } from "@d20/ui/tooltip"
import NativeImage from "@d20/ui/native-image"
import { requireAdmin } from "@/lib/auth-utils"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"

export const metadata: Metadata = {
  title: "Adventure Plans Workbench",
  description: "Admin workbench for wiki-authored adventure plans.",
}

const sourceLabel = {
  s3: {
    label: "S3 Source",
    title: "Compiled from the edited copy in S3. Edits made here are already the live source of truth.",
  },
  local: {
    label: "Repo Source",
    title:
      "Compiled from the markdown in this repo (content/settings/…). Either S3 has no copy yet, its copy is incomplete, or it is byte-identical to the repo. The next save here writes a canonical copy to S3.",
  },
} as const

export default async function AdminAdventurePlansPage() {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="max-w-2xl py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <>
        <LedgerHead title="Access Denied" />
        <p>You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
      </>
    )
  }

  const adventures = await listAdminWikiAdventures()
  return (
    <>
      <LedgerHead title="Adventure Plans" subtitle="Chat with migrated wiki adventures and apply improvements directly to S3 source" />
          <div className="up-cards !grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
            {adventures.map((adventure, index) => {
              const source = sourceLabel[adventure.source]
              const href = `/admin/adventure-plans/${adventure.settingId}/${adventure.planId}`
              return (
                <article
                  key={`${adventure.settingId}/${adventure.planId}`}
                  className="up-card enter-rise"
                  style={{ "--i": Math.min(index, 8) } as CSSProperties}
                >
                  <Link href={href} className="up-card-art group !aspect-[16/7]">
                    {adventure.image && <NativeImage src={adventure.image} alt="" fill className="object-cover transition-opacity duration-150 ease-snap group-hover:opacity-90" loading="eager" />}
                    <span className="up-pill is-accent absolute right-3 top-3 capitalize" style={{ background: "var(--up-bg)" }}>{adventure.status}</span>
                  </Link>
                  <div className="up-card-body flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3>{adventure.title}</h3>
                      <p className="font-mono">
                        {adventure.settingId}/{adventure.planId}
                      </p>
                      <p>
                        {adventure.fileCount} files · {adventure.encounterCount} encounters ·{" "}
                        <Tip label={source.title}>
                          <span className="cursor-help underline decoration-dotted underline-offset-4">{source.label}</span>
                        </Tip>
                      </p>
                    </div>
                    <Button variant="plain" className="up-btn is-primary is-xs" render={<Link href={href} />}>Open Chat Editor</Button>
                  </div>
                </article>
              )
            })}
          </div>
    </>
  )
}
