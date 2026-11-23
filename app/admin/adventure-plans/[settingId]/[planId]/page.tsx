import type { Metadata } from "next"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { LedgerHead } from "@/components/layout/ledger-page"
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
      <div className="max-w-2xl py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <LedgerHead title="Access Denied" />
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
