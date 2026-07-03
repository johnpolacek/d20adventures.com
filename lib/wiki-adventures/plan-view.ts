import { loadAdventurePlanFromStorage } from "@/lib/adventure-plan-storage"
import type { AdventureEncounter, AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import { getLocalWikiAdventuresForSetting, isLocalWikiAdventure, loadLocalWikiAdventureRuntime, loadWikiAdventureRuntime } from "./local-runtime"
import type { RuntimeArtifacts, RuntimeEncounter } from "./types"

/**
 * Adapts compiled wiki runtime artifacts into the legacy `AdventurePlan` shape the public
 * play-flow pages (listing, character-select, character-create) and their components consume.
 *
 * This lets those pages cut off the legacy S3 `AdventurePlan` JSON without rewriting the
 * downstream UI. Encounter intro/instructions and section keys mirror the gameplay runtime
 * (see `adventure-turn-reply-service.ts` `resolveEncounterContent`) so the preview matches play.
 */

function encounterIntro(encounter: RuntimeEncounter): string {
  return encounter.sections.intro ?? encounter.sections.body ?? encounter.summary ?? ""
}

function toAdventureEncounter(encounter: RuntimeEncounter, locations: RuntimeArtifacts["entities"]["locations"]): AdventureEncounter {
  return {
    id: encounter.id,
    title: encounter.title,
    location: encounter.locationId ? locations[encounter.locationId]?.title : undefined,
    intro: encounterIntro(encounter),
    instructions: encounter.sections.gmNotes ?? "",
    image: encounter.image,
    transitions: encounter.transitions.map((transition) => ({
      condition: transition.condition,
      encounter: transition.toEncounterId,
    })),
    npc: encounter.npcRefs.map((ref) => ({
      id: ref.id,
      behavior: ref.behavior ?? "",
      initialInitiative: ref.initialInitiative,
    })),
  }
}

export function buildAdventurePlanViewFromArtifacts(artifacts: RuntimeArtifacts): AdventurePlan {
  const { manifest } = artifacts

  // Keep the start encounter first so a demo turn built from `sections[0].scenes[0].encounters[0]`
  // resolves to the real first encounter; the rest follow for encounter-by-id lookups.
  const startId = manifest.startEncounterId
  const encounterRecords = Object.values(artifacts.encounters)
  const ordered = [...encounterRecords.filter((entry) => entry.id === startId), ...encounterRecords.filter((entry) => entry.id !== startId)]
  const encounters = ordered.map((entry) => toAdventureEncounter(entry, artifacts.entities.locations))

  const section: AdventureSection = {
    title: manifest.title,
    summary: manifest.summary ?? manifest.teaser ?? "",
    image: manifest.image,
    scenes: [{ title: manifest.title, summary: manifest.summary ?? "", image: manifest.image, encounters }],
  }

  const premadePlayerCharacters: PCTemplate[] = manifest.premadeCharacterIds.map((id) => artifacts.characterSheets.premadeCharacters[id]?.sheet).filter((sheet): sheet is PCTemplate => Boolean(sheet))

  const npcs: Record<string, Character> = {}
  for (const [id, record] of Object.entries(artifacts.characterSheets.npcs)) {
    npcs[id] = record.sheet as unknown as Character
  }

  const minPlayers = manifest.minPlayers ?? manifest.recommendedPlayers ?? 1
  const maxPlayers = manifest.maxPlayers ?? manifest.recommendedPlayers ?? minPlayers

  return {
    id: manifest.planId,
    settingId: manifest.settingId,
    title: manifest.title,
    author: "D20Adventures",
    version: manifest.contentVersion,
    teaser: manifest.teaser ?? "",
    overview: manifest.summary ?? "",
    party: [minPlayers, maxPlayers],
    tags: [],
    image: manifest.image ?? "",
    start: startId,
    sections: [section],
    premadePlayerCharacters,
    npcs,
    availableCharacterOptions: manifest.availableCharacterOptions,
    nextAdventure: manifest.nextAdventureId,
  }
}

/** Synchronous, repo-local source only. Prefer the async variant in request paths. */
export function loadLocalWikiAdventurePlanView(settingId: string, planId: string): AdventurePlan {
  return buildAdventurePlanViewFromArtifacts(loadLocalWikiAdventureRuntime(settingId, planId).artifacts)
}

/** S3-aware (published source preferred, repo-local fallback) — matches the create/start paths. */
export async function loadWikiAdventurePlanView(settingId: string, planId: string): Promise<AdventurePlan> {
  const { artifacts } = await loadWikiAdventureRuntime(settingId, planId)
  return buildAdventurePlanViewFromArtifacts(artifacts)
}

/**
 * Plan views for every registered wiki adventure in a setting, ordered by planId so the
 * adventure-listing grid keeps the same ordering it had when it enumerated S3 JSON keys.
 */
export async function loadWikiAdventurePlanViewsForSetting(settingId: string): Promise<AdventurePlan[]> {
  const definitions = getLocalWikiAdventuresForSetting(settingId)
  return Promise.all(definitions.map((definition) => loadWikiAdventurePlanView(settingId, definition.planId)))
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
