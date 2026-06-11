import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { s3Client } from "@/lib/aws"
import type { TurnCharacter } from "@/types/adventure"
import { createSourceFile } from "./change-sets"
import { compileAdventureSourceTree } from "./compiler"
import { S3WikiAdventureSourceService } from "./source-service"
import type { RuntimeArtifacts, RuntimeEncounter, SourceFile } from "./types"

export type LocalWikiAdventureDefinition = {
  settingId: string
  planId: string
  contentVersion: string
  versionId: string
  assetHosts: string[]
  sourceRoots: string[]
  migrationReportPath?: string
  promptSlug: string
}

export type LocalWikiContentRef = {
  source: "published"
  settingId: string
  planId: string
  contentVersion: string
  contentHash: string
  versionId: string
  schemaVersion: "1"
}

export const LOCAL_WIKI_ADVENTURES = [
  {
    settingId: "realm-of-myr",
    planId: "the-midnight-summons",
    contentVersion: "2026-05-22T00-00-00Z-midnight-migration",
    versionId: "local-midnight-migration",
    assetHosts: ["d20-public.s3.us-east-1.amazonaws.com"],
    sourceRoots: [
      "content/settings/realm-of-myr/adventures/the-midnight-summons",
      "content/settings/realm-of-myr/npcs/owlbear.json",
      "content/settings/realm-of-myr/npcs/owlbear.md",
      "content/settings/realm-of-myr/npcs/wollandora.json",
      "content/settings/realm-of-myr/npcs/wollandora.md",
    ],
    promptSlug: "midnight",
  },
  {
    settingId: "realm-of-myr",
    planId: "covert-cargo",
    contentVersion: "2026-05-23T00-00-00Z-covert-cargo-migration",
    versionId: "local-covert-cargo-migration",
    assetHosts: ["d20-public.s3.us-east-1.amazonaws.com", "d1dkwd3w4hheqw.cloudfront.net"],
    sourceRoots: [
      "content/settings/realm-of-myr/adventures/covert-cargo",
      "content/settings/realm-of-myr/npcs/npcs-1749163978757.json",
      "content/settings/realm-of-myr/npcs/npcs-1749163978757.md",
      "content/settings/realm-of-myr/npcs/npcs-1749181492795.json",
      "content/settings/realm-of-myr/npcs/npcs-1749181492795.md",
      "content/settings/realm-of-myr/npcs/npcs-1749184389465.json",
      "content/settings/realm-of-myr/npcs/npcs-1749184389465.md",
      "content/settings/realm-of-myr/npcs/npcs-1749243735467.json",
      "content/settings/realm-of-myr/npcs/npcs-1749243735467.md",
      "content/settings/realm-of-myr/npcs/npcs-1749243869357.json",
      "content/settings/realm-of-myr/npcs/npcs-1749243869357.md",
    ],
    promptSlug: "covert-cargo",
  },
  {
    settingId: "realm-of-myr",
    planId: "the-road-to-kordavos",
    contentVersion: "2026-05-23T00-00-00Z-road-to-kordavos-migration",
    versionId: "local-road-to-kordavos-migration",
    assetHosts: ["d20-public.s3.us-east-1.amazonaws.com", "d1dkwd3w4hheqw.cloudfront.net"],
    sourceRoots: [
      "content/settings/realm-of-myr/adventures/the-road-to-kordavos",
      "content/settings/realm-of-myr/npcs/npcs-1749870310278.json",
      "content/settings/realm-of-myr/npcs/npcs-1749870310278.md",
      "content/settings/realm-of-myr/npcs/npcs-1749870598631.json",
      "content/settings/realm-of-myr/npcs/npcs-1749870598631.md",
      "content/settings/realm-of-myr/npcs/npcs-1749870658664.json",
      "content/settings/realm-of-myr/npcs/npcs-1749870658664.md",
      "content/settings/realm-of-myr/npcs/npcs-1749870721240.json",
      "content/settings/realm-of-myr/npcs/npcs-1749870721240.md",
    ],
    promptSlug: "road-to-kordavos",
  },
  {
    settingId: "realm-of-myr",
    planId: "march-of-davos",
    contentVersion: "2026-05-23T00-00-00Z-march-of-davos-migration",
    versionId: "local-march-of-davos-migration",
    assetHosts: ["d20-public.s3.us-east-1.amazonaws.com", "d1dkwd3w4hheqw.cloudfront.net", "s3.us-east-1.amazonaws.com"],
    sourceRoots: ["content/settings/realm-of-myr/adventures/march-of-davos"],
    migrationReportPath: "content/settings/realm-of-myr/adventures/march-of-davos/migration-report.json",
    promptSlug: "march-of-davos",
  },
] as const satisfies LocalWikiAdventureDefinition[]

export function getLocalWikiAdventureDefinition(settingId: string, planId: string): LocalWikiAdventureDefinition | null {
  return LOCAL_WIKI_ADVENTURES.find((definition) => definition.settingId === settingId && definition.planId === planId) ?? null
}

export function isLocalWikiAdventure(settingId: string, planId: string) {
  return getLocalWikiAdventureDefinition(settingId, planId) !== null
}

export function loadLocalWikiAdventureRuntime(settingId: string, planId: string): { definition: LocalWikiAdventureDefinition; artifacts: RuntimeArtifacts; contentRef: LocalWikiContentRef } {
  const definition = getLocalWikiAdventureDefinition(settingId, planId)
  if (!definition) {
    throw new Error(`No local wiki adventure is registered for ${settingId}/${planId}`)
  }

  const files = readLocalWikiAdventureSourceFiles(definition)
  return compileLocalWikiAdventureRuntime(definition, files)
}

export async function loadWikiAdventureRuntime(settingId: string, planId: string): Promise<{ definition: LocalWikiAdventureDefinition; artifacts: RuntimeArtifacts; contentRef: LocalWikiContentRef }> {
  const definition = getLocalWikiAdventureDefinition(settingId, planId)
  if (!definition) {
    throw new Error(`No wiki adventure is registered for ${settingId}/${planId}`)
  }
  return compileLocalWikiAdventureRuntime(definition, await readWikiAdventureSourceFiles(definition))
}

export type WikiSourceSelection = {
  files: SourceFile[]
  source: "s3" | "local"
  missingPaths: string[]
}

/**
 * Choose between remote S3 source and repo-local source. Repo-local is the
 * known-good baseline, so S3 is only preferred when it covers every expected
 * local path. A partial S3 seed (missing any local path) is rejected in favor
 * of local source, instead of letting incomplete remote source override it.
 */
export function selectWikiAdventureSourceFiles(localFiles: SourceFile[], remoteFiles: SourceFile[]): WikiSourceSelection {
  if (remoteFiles.length === 0) return { files: localFiles, source: "local", missingPaths: [] }
  const remotePaths = new Set(remoteFiles.map((file) => file.path))
  const missingPaths = localFiles.filter((file) => !remotePaths.has(file.path)).map((file) => file.path)
  if (missingPaths.length > 0) return { files: localFiles, source: "local", missingPaths }
  return { files: remoteFiles, source: "s3", missingPaths: [] }
}

export async function readWikiAdventureSourceFiles(definition: LocalWikiAdventureDefinition) {
  const localFiles = readLocalWikiAdventureSourceFiles(definition)
  const remoteFiles = await readS3WikiAdventureSourceFiles(definition)
  const selection = selectWikiAdventureSourceFiles(localFiles, remoteFiles)
  if (selection.source === "local" && remoteFiles.length > 0) {
    console.warn(
      `[wiki-adventures] Ignoring incomplete S3 source for ${definition.settingId}/${definition.planId}: ${remoteFiles.length} remote file(s) missing ${selection.missingPaths.length} expected path(s) (e.g. ${selection.missingPaths[0]}). Using repo-local source.`
    )
  }
  return selection.files
}

export function readLocalWikiAdventureSourceFiles(definition: LocalWikiAdventureDefinition) {
  const sourceRoots = [...definition.sourceRoots, ...readMigrationNpcSourcePaths(definition.migrationReportPath)]
  return unique(sourceRoots).flatMap(readSourceFiles)
}

function compileLocalWikiAdventureRuntime(
  definition: LocalWikiAdventureDefinition,
  files: ReturnType<typeof readLocalWikiAdventureSourceFiles>
): { definition: LocalWikiAdventureDefinition; artifacts: RuntimeArtifacts; contentRef: LocalWikiContentRef } {
  const artifacts = compileAdventureSourceTree(files, {
    mode: "publish",
    contentVersion: definition.contentVersion,
    allowedAssetHosts: definition.assetHosts,
  })

  if (artifacts.validationReport.status === "blocked") {
    throw new Error(`${definition.planId} wiki source is not publish-valid: ${JSON.stringify(artifacts.validationReport.summary)}`)
  }

  return {
    definition,
    artifacts,
    contentRef: {
      source: "published",
      settingId: definition.settingId,
      planId: definition.planId,
      contentVersion: definition.contentVersion,
      contentHash: artifacts.manifest.contentHash,
      versionId: definition.versionId,
      schemaVersion: "1",
    },
  }
}

async function readS3WikiAdventureSourceFiles(definition: LocalWikiAdventureDefinition) {
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA
  if (!bucket || !s3Client) return []

  const service = new S3WikiAdventureSourceService(s3Client, bucket)
  const paths = unique([...definition.sourceRoots, ...readMigrationNpcSourcePaths(definition.migrationReportPath)])
  const files = await Promise.all(
    paths.map(async (path) => {
      if (path.endsWith(".md") || path.endsWith(".json")) {
        const file = await service.readFile(path)
        return file ? [file] : []
      }
      return service.listFiles(path)
    })
  )
  return files.flat()
}

export function buildLocalWikiTurnCharacters(args: {
  artifacts: RuntimeArtifacts
  encounter: RuntimeEncounter
  players: Array<{ userId: string; characterId: string }>
  existingPlayerCharacters?: TurnCharacter[]
}): TurnCharacter[] {
  const characters: TurnCharacter[] = []

  for (const player of args.players) {
    const id =
      player.characterId
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? player.characterId
    const sheet = args.artifacts.characterSheets.premadeCharacters[id]?.sheet ?? args.existingPlayerCharacters?.find((character) => character.id === id || character.id === player.characterId)
    if (!sheet) throw new Error(`Missing player character sheet for ${player.characterId}`)
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

export function isLocalWikiFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return !artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === encounterId)
}

function readSourceFiles(root: string) {
  const paths = (statSync(root).isDirectory() ? listFiles(root) : [root]).filter((path) => (path.endsWith(".md") || path.endsWith(".json")) && !path.endsWith("/migration-report.json"))
  return paths.map((path) => createSourceFile(path, readFileSync(path, "utf8")))
}

function readMigrationNpcSourcePaths(reportPath: string | undefined) {
  if (!reportPath) return []
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as { generatedFiles?: Array<{ path: string }> }
  return (report.generatedFiles ?? []).map((file) => file.path).filter((path) => path.includes("/npcs/") && (path.endsWith(".md") || path.endsWith(".json")))
}

function unique(values: string[]) {
  return Array.from(new Set(values))
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
