import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"
import { WikiAdventureWorkbench } from "@/components/wiki-adventures/wiki-adventure-workbench"
import { requireAdmin } from "@/lib/auth-utils"
import { createRepresentativeWorkbenchState } from "@/lib/wiki-adventures/workbench-demo"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Wiki Adventure Workbench",
  description: "Admin workbench for wiki-authored adventure plans.",
}

export default async function AdminWikiAdventuresPage() {
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

  const initialState = await createRepresentativeWorkbenchState()
  return <WikiAdventureWorkbench initialState={initialState} />
}
