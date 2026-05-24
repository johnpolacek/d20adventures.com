"use server"

import { requireAdmin } from "@/lib/auth-utils"
import {
  applyAdminChatRequest,
  applyAdminKeyFieldUpdate,
  exportAdminWikiAdventureBundle,
  importAdminWikiAdventureBundle,
  listAdminWikiAdventures,
  loadAdminWikiAdventureState,
  restoreAdminWikiAdventureRevision,
} from "@/lib/wiki-adventures/admin-authoring"

async function assertAdmin() {
  const result = await requireAdmin()
  if (!result.isAdmin) throw new Error("Unauthorized")
}

export async function listAdminWikiAdventureSummariesAction() {
  await assertAdmin()
  return listAdminWikiAdventures()
}

export async function loadAdminWikiAdventureStateAction(settingId: string, planId: string) {
  await assertAdmin()
  const state = await loadAdminWikiAdventureState(settingId, planId)
  return {
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
  }
}

export async function sendAdminWikiAdventureChatAction(input: { settingId: string; planId: string; message: string }) {
  await assertAdmin()
  return applyAdminChatRequest(input)
}

export async function saveAdminWikiAdventureFileAction(input: { settingId: string; planId: string; path: string; content: string; intent: string }) {
  await assertAdmin()
  return applyAdminKeyFieldUpdate(input)
}

export async function exportAdminWikiAdventureBundleAction(settingId: string, planId: string) {
  await assertAdmin()
  return exportAdminWikiAdventureBundle(settingId, planId)
}

export async function importAdminWikiAdventureBundleAction(input: { settingId: string; planId: string; files: Array<{ path: string; content: string }> }) {
  await assertAdmin()
  return importAdminWikiAdventureBundle(input)
}

export async function restoreAdminWikiAdventureRevisionAction(input: { settingId: string; planId: string; revisionId: string; path?: string }) {
  await assertAdmin()
  return restoreAdminWikiAdventureRevision(input)
}
