import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createSourceFile } from "./change-sets"
import { compileAdventureSourceTree } from "./compiler"
import type { RuntimeArtifacts, RuntimeEncounter } from "./types"
import type { TurnCharacter } from "@/types/adventure"

export const MIDNIGHT_SUMMONS_SETTING_ID = "realm-of-myr"
export const MIDNIGHT_SUMMONS_PLAN_ID = "the-midnight-summons"
export const MIDNIGHT_SUMMONS_CONTENT_VERSION = "2026-05-22T00-00-00Z-midnight-migration"
export const MIDNIGHT_SUMMONS_VERSION_ID = "local-midnight-migration"
export const MIDNIGHT_SUMMONS_ASSET_HOST = "d20-public.s3.us-east-1.amazonaws.com"

export type MidnightContentRef = {
  source: "published"
  settingId: typeof MIDNIGHT_SUMMONS_SETTING_ID
  planId: typeof MIDNIGHT_SUMMONS_PLAN_ID
  contentVersion: typeof MIDNIGHT_SUMMONS_CONTENT_VERSION
  contentHash: string
  versionId: typeof MIDNIGHT_SUMMONS_VERSION_ID
  schemaVersion: "1"
}

export function isMidnightSummons(settingId: string, planId: string) {
  return settingId === MIDNIGHT_SUMMONS_SETTING_ID && planId === MIDNIGHT_SUMMONS_PLAN_ID
}

export function loadMidnightSummonsRuntime(): { artifacts: RuntimeArtifacts; contentRef: MidnightContentRef } {
  const files = readSourceFiles("content/settings/realm-of-myr/adventures/the-midnight-summons")
  files.push(...readSourceFiles("content/settings/realm-of-myr/npcs"))
  const artifacts = compileAdventureSourceTree(files, {
    mode: "publish",
    contentVersion: MIDNIGHT_SUMMONS_CONTENT_VERSION,
    allowedAssetHosts: [MIDNIGHT_SUMMONS_ASSET_HOST],
  })
  if (artifacts.validationReport.status === "blocked") {
    throw new Error(`The Midnight Summons wiki source is not publish-valid: ${JSON.stringify(artifacts.validationReport.summary)}`)
  }
  return {
    artifacts,
    contentRef: {
      source: "published",
      settingId: MIDNIGHT_SUMMONS_SETTING_ID,
      planId: MIDNIGHT_SUMMONS_PLAN_ID,
      contentVersion: MIDNIGHT_SUMMONS_CONTENT_VERSION,
      contentHash: artifacts.manifest.contentHash,
      versionId: MIDNIGHT_SUMMONS_VERSION_ID,
      schemaVersion: "1",
    },
  }
}

export function buildMidnightTurnCharacters(args: {
  artifacts: RuntimeArtifacts
  encounter: RuntimeEncounter
  players: Array<{ userId: string; characterId: string }>
}): TurnCharacter[] {
  const characters: TurnCharacter[] = []
  for (const player of args.players) {
    const id = player.characterId.split("/").pop()?.replace(/\.json$/, "") ?? player.characterId
    const sheet = args.artifacts.characterSheets.premadeCharacters[id]?.sheet
    if (!sheet) throw new Error(`Missing premade character sheet for ${player.characterId}`)
    characters.push({
      ...sheet,
      id: sheet.id,
      type: "pc",
      userId: player.userId,
      initiative: rollD20(),
      hasReplied: false,
      isComplete: false,
    })
  }
  for (const npcRef of args.encounter.npcRefs) {
    const sheet = args.artifacts.characterSheets.npcs[npcRef.id]?.sheet
    if (!sheet) throw new Error(`Missing NPC sheet for ${npcRef.id}`)
    characters.push({
      ...sheet,
      id: sheet.id,
      type: "npc",
      initiative: typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollD20(),
      hasReplied: false,
      isComplete: false,
      behavior: npcRef.behavior ?? sheet.behavior,
    })
  }
  return characters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
}

export function isMidnightFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return !artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === encounterId)
}

function readSourceFiles(root: string) {
  const paths = listFiles(root).filter((path) => (path.endsWith(".md") || path.endsWith(".json")) && !path.endsWith("/migration-report.json"))
  return paths.map((path) => createSourceFile(path, readFileSync(path, "utf8")))
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1
}
