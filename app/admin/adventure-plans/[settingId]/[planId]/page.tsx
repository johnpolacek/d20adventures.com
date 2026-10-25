import type { Metadata } from "next"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"
import { AdminWikiAdventureEditor } from "@/components/wiki-adventures/admin-wiki-adventure-editor"
import { requireAdmin } from "@/lib/auth-utils"
import { loadAdminWikiAdventureState } from "@/lib/wiki-adventures/admin-authoring"

export const metadata: Metadata = {
  title: "Wiki Adventure Editor",
  description: "Chat-based admin editor for wiki-authored adventures.",
}

export default async function AdminWikiAdventureDetailPage(props: { params: Promise<{ settingId: string; planId: string }> }) {
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
  const state = await loadAdminWikiAdventureState(settingId, planId)
  return (
    <AdminWikiAdventureEditor
      initialState={{
        definition: state.definition,
        source: state.source,
        files: state.files,
        manifest: state.artifacts.manifest,
        validation: state.artifacts.validationReport,
        graph: state.artifacts.graph,
        encounters: state.artifacts.encounters,
        characterSheets: state.artifacts.characterSheets,
        revisions: state.revisions.map((revision) => ({
          id: revision.id,
          source: revision.source,
          summary: revision.summary,
          createdAt: revision.createdAt,
          changedPaths: revision.changedPaths,
          validation: revision.validation,
        })),
      }}
    />
  )
}
