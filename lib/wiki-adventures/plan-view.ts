import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import { loadAdventurePlanFromStorage } from "@/lib/adventure-plan-storage"
import type { AdventurePlan } from "@/types/adventure-plan"
import { getLocalWikiAdventuresForSetting, isLocalWikiAdventure, loadLocalWikiAdventureRuntime, loadWikiAdventureRuntime } from "./local-runtime"

/**
 * Adapts compiled wiki runtime artifacts into the legacy `AdventurePlan` shape the public
 * play-flow pages (listing, character-select, character-create) and their components consume.
 *
 * This lets those pages cut off the legacy S3 `AdventurePlan` JSON without rewriting the
 * downstream UI. Encounter intro/instructions and section keys mirror the gameplay runtime
 * (see `adventure-turn-reply-service.ts` `resolveEncounterContent`) so the preview matches play.
 */

/** Synchronous, repo-local source only. Prefer the async variant in request paths. */
export function loadLocalWikiAdventurePlanView(settingId: string, planId: string): AdventurePlan {
  return buildAdventurePlanViewFromArtifacts(loadLocalWikiAdventureRuntime(settingId, planId).artifacts)
}

/** S3-aware (published source preferred, repo-local fallback) — matches the create/start paths. */
export async function loadWikiAdventurePlanView(settingId: string, planId: string): Promise<AdventurePlan> {
  const { artifacts } = await loadWikiAdventureRuntime(settingId, planId)
  return buildAdventurePlanViewFromArtifacts(artifacts)
}

/** Plan views for every playable registered wiki adventure in a setting, ordered by planId. */
export async function loadWikiAdventurePlanViewsForSetting(settingId: string): Promise<AdventurePlan[]> {
  const definitions = getLocalWikiAdventuresForSetting(settingId)
  const results = await Promise.allSettled(definitions.map((definition) => loadWikiAdventurePlanView(settingId, definition.planId)))

  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value]

    console.error(`[wiki-adventures] Unable to load ${settingId}/${definitions[index].planId} for the adventure listing:`, result.reason)
    return []
  })
}

/**
 * The single entry point gameplay/runtime readers should use to load an adventure plan:
 * the wiki plan view for registered wiki adventures, the legacy S3 `AdventurePlan` JSON
 * otherwise. Keeps every runtime reader off the legacy plan for migrated adventures so a
 * stubbed or absent legacy plan can never 500 the play flow.
 */
export async function loadAdventurePlanForRuntime(settingId: string, planId: string): Promise<AdventurePlan> {
  if (isLocalWikiAdventure(settingId, planId)) {
    return loadWikiAdventurePlanView(settingId, planId)
  }
  return loadAdventurePlanFromStorage(settingId, planId)
}

export { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
