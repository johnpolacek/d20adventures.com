import { buildLocalWikiTurnCharacters, isLocalWikiFinalEncounter, loadLocalWikiAdventureRuntime, type LocalWikiContentRef } from "./local-runtime"
import type { RuntimeArtifacts, RuntimeEncounter } from "./types"
import type { TurnCharacter } from "@/types/adventure"

export const MIDNIGHT_SUMMONS_SETTING_ID = "realm-of-myr"
export const MIDNIGHT_SUMMONS_PLAN_ID = "the-midnight-summons"
export const MIDNIGHT_SUMMONS_CONTENT_VERSION = "2026-05-22T00-00-00Z-midnight-migration"
export const MIDNIGHT_SUMMONS_VERSION_ID = "local-midnight-migration"
export const MIDNIGHT_SUMMONS_ASSET_HOST = "d20-public.s3.us-east-1.amazonaws.com"

export type MidnightContentRef = LocalWikiContentRef & {
  settingId: typeof MIDNIGHT_SUMMONS_SETTING_ID
  planId: typeof MIDNIGHT_SUMMONS_PLAN_ID
  contentVersion: typeof MIDNIGHT_SUMMONS_CONTENT_VERSION
  versionId: typeof MIDNIGHT_SUMMONS_VERSION_ID
}

export function isMidnightSummons(settingId: string, planId: string) {
  return settingId === MIDNIGHT_SUMMONS_SETTING_ID && planId === MIDNIGHT_SUMMONS_PLAN_ID
}

export function loadMidnightSummonsRuntime(): { artifacts: RuntimeArtifacts; contentRef: MidnightContentRef } {
  const { artifacts, contentRef } = loadLocalWikiAdventureRuntime(MIDNIGHT_SUMMONS_SETTING_ID, MIDNIGHT_SUMMONS_PLAN_ID)
  return { artifacts, contentRef: contentRef as MidnightContentRef }
}

export function buildMidnightTurnCharacters(args: {
  artifacts: RuntimeArtifacts
  encounter: RuntimeEncounter
  players: Array<{ userId: string; characterId: string }>
}): TurnCharacter[] {
  return buildLocalWikiTurnCharacters(args)
}

export function isMidnightFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return isLocalWikiFinalEncounter(artifacts, encounterId)
}
