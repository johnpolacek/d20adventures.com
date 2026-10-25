import type { AdventurePatch } from "./adventure-patch"

export type WikiAdventureContentRef = {
  source: "published" | "preview"
  settingId: string
  planId: string
  contentVersion?: string
  contentHash?: string
  versionId?: string
  previewDraftId?: string
  schemaVersion: string
}

export type WikiAdventureSessionState = {
  currentTurnId?: string
  currentEncounterId?: string
  contentRef?: WikiAdventureContentRef
  adventureSummaryMarkdown?: string
  discoveries?: unknown[]
  entityUpdates?: unknown[]
  openThreads?: Array<{ id: string; title?: string; text?: string }>
  resolvedThreadIds?: string[]
}

export type WikiTurnAdvanceGuard = {
  expectedCurrentTurnId: string
  expectedCurrentEncounterId: string
  expectedContentHash?: string
}

export function validateWikiTurnAdvanceGuard(state: WikiAdventureSessionState, guard: WikiTurnAdvanceGuard): { ok: true } | { ok: false; reason: "stale_turn" | "stale_encounter" | "stale_content" } {
  if (state.currentTurnId !== guard.expectedCurrentTurnId) return { ok: false, reason: "stale_turn" }
  if ((state.currentEncounterId ?? guard.expectedCurrentEncounterId) !== guard.expectedCurrentEncounterId) return { ok: false, reason: "stale_encounter" }
  if (guard.expectedContentHash && state.contentRef?.contentHash !== guard.expectedContentHash) return { ok: false, reason: "stale_content" }
  return { ok: true }
}

export function applyAdventurePatchToWikiState(state: WikiAdventureSessionState, patch: AdventurePatch): WikiAdventureSessionState {
  const summaryDelta = patch.summaryDelta?.trim()
  const resolved = new Set([...(state.resolvedThreadIds ?? []), ...(patch.resolvedThreadIds ?? [])])
  return {
    ...state,
    adventureSummaryMarkdown: summaryDelta ? [state.adventureSummaryMarkdown, summaryDelta].filter(Boolean).join("\n\n") : state.adventureSummaryMarkdown,
    discoveries: [...(state.discoveries ?? []), ...(patch.discoveries ?? [])],
    entityUpdates: [...(state.entityUpdates ?? []), ...(patch.entityUpdates ?? [])],
    openThreads: mergeOpenThreads(state.openThreads ?? [], patch.openThreads ?? [], resolved),
    resolvedThreadIds: [...resolved],
  }
}

function mergeOpenThreads(existing: Array<{ id: string }>, added: Array<{ id: string }>, resolved: Set<string>) {
  const byId = new Map<string, { id: string }>()
  for (const thread of existing) {
    if (!resolved.has(thread.id)) byId.set(thread.id, thread)
  }
  for (const thread of added) {
    if (!resolved.has(thread.id)) byId.set(thread.id, thread)
  }
  return [...byId.values()]
}
