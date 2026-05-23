import { z } from "zod"
import { s3Client } from "@/lib/aws"
import { S3WikiAdventureSourceService } from "./source-service"
import { applyAuthoringChangeSet, createSourceFile } from "./change-sets"
import { compileAdventureSourceTree } from "./compiler"
import { getLocalWikiAdventureDefinition, readLocalWikiAdventureSourceFiles, readWikiAdventureSourceFiles, type LocalWikiAdventureDefinition } from "./local-runtime"
import type { AuthoringChangeSet, RuntimeArtifacts, SourceFile, ValidationMode } from "./types"

export type AdminWikiAdventureSummary = {
  settingId: string
  planId: string
  title: string
  status: RuntimeArtifacts["validationReport"]["status"]
  source: "s3" | "local"
  fileCount: number
  encounterCount: number
  errorCount: number
  warningCount: number
}

export type AdminWikiAdventureState = {
  definition: LocalWikiAdventureDefinition
  source: "s3" | "local"
  files: SourceFile[]
  artifacts: RuntimeArtifacts
}

export type AdminAuthoringResult = {
  reply: string
  changedPaths: string[]
  source: "s3" | "local"
  validation: RuntimeArtifacts["validationReport"]
  manifest: RuntimeArtifacts["manifest"]
}

const aiChangeSchema = z.object({
  reply: z.string(),
  changes: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
      })
    )
    .max(8),
})

export async function listAdminWikiAdventures(): Promise<AdminWikiAdventureSummary[]> {
  const states = await Promise.all(
    ["the-midnight-summons", "covert-cargo", "the-road-to-kordavos", "march-of-davos"].map((planId) => loadAdminWikiAdventureState("realm-of-myr", planId))
  )
  return states.map((state) => ({
    settingId: state.definition.settingId,
    planId: state.definition.planId,
    title: state.artifacts.manifest.title,
    status: state.artifacts.validationReport.status,
    source: state.source,
    fileCount: state.files.length,
    encounterCount: Object.keys(state.artifacts.encounters).length,
    errorCount: state.artifacts.validationReport.summary.errorCount,
    warningCount: state.artifacts.validationReport.summary.warningCount,
  }))
}

export async function loadAdminWikiAdventureState(settingId: string, planId: string, mode: ValidationMode = "draftPreview"): Promise<AdminWikiAdventureState> {
  const definition = requiredDefinition(settingId, planId)
  const localFiles = readLocalWikiAdventureSourceFiles(definition)
  const files = await readWikiAdventureSourceFiles(definition)
  const source = sameFileSet(files, localFiles) ? "local" : "s3"
  const artifacts = compileAdventureSourceTree(files, {
    mode,
    contentVersion: "admin-current-source",
    allowedAssetHosts: definition.assetHosts,
  })
  return { definition, source, files, artifacts }
}

export async function applyAdminChatRequest(input: { settingId: string; planId: string; message: string }): Promise<AdminAuthoringResult> {
  const { generateObject } = await import("@/lib/ai")
  const state = await loadAdminWikiAdventureState(input.settingId, input.planId)
  const prompt = buildAuthoringPrompt(state, input.message)
  const proposal = (await generateObject({ prompt, schema: aiChangeSchema })).object
  const changeSet = buildUpdateChangeSet(state, proposal.changes, `Admin chat: ${input.message}`)
  const files = await writeCanonicalChangeSet(state, changeSet)
  const artifacts = compileAdventureSourceTree(files, {
    mode: "draftPreview",
    contentVersion: "admin-current-source",
    allowedAssetHosts: state.definition.assetHosts,
  })
  return {
    reply: proposal.reply,
    changedPaths: changeSet.changes.map((change) => ("path" in change ? change.path : change.toPath)),
    source: "s3",
    validation: artifacts.validationReport,
    manifest: artifacts.manifest,
  }
}

export async function applyAdminKeyFieldUpdate(input: { settingId: string; planId: string; path: string; content: string; intent: string }): Promise<AdminAuthoringResult> {
  const state = await loadAdminWikiAdventureState(input.settingId, input.planId)
  const changeSet = buildUpdateChangeSet(state, [{ path: input.path, content: input.content }], input.intent)
  const files = await writeCanonicalChangeSet(state, changeSet)
  const artifacts = compileAdventureSourceTree(files, {
    mode: "draftPreview",
    contentVersion: "admin-current-source",
    allowedAssetHosts: state.definition.assetHosts,
  })
  return {
    reply: "Saved source change.",
    changedPaths: changeSet.changes.map((change) => ("path" in change ? change.path : change.toPath)),
    source: "s3",
    validation: artifacts.validationReport,
    manifest: artifacts.manifest,
  }
}

export async function exportAdminWikiAdventureBundle(settingId: string, planId: string) {
  const state = await loadAdminWikiAdventureState(settingId, planId)
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settingId,
    planId,
    files: state.files.map((file) => ({ path: file.path, content: file.content })),
  }
}

export async function importAdminWikiAdventureBundle(input: { settingId: string; planId: string; files: Array<{ path: string; content: string }> }): Promise<AdminAuthoringResult> {
  const state = await loadAdminWikiAdventureState(input.settingId, input.planId)
  const allowed = allowedPathSet(state)
  const changes = input.files.filter((file) => allowed.has(file.path)).map((file) => ({ path: file.path, content: file.content }))
  const changeSet = buildUpdateChangeSet(state, changes, "Manual source bundle restore")
  const files = await writeCanonicalChangeSet(state, changeSet)
  const artifacts = compileAdventureSourceTree(files, {
    mode: "draftPreview",
    contentVersion: "admin-current-source",
    allowedAssetHosts: state.definition.assetHosts,
  })
  return {
    reply: "Restored source bundle.",
    changedPaths: changeSet.changes.map((change) => ("path" in change ? change.path : change.toPath)),
    source: "s3",
    validation: artifacts.validationReport,
    manifest: artifacts.manifest,
  }
}

function requiredDefinition(settingId: string, planId: string) {
  const definition = getLocalWikiAdventureDefinition(settingId, planId)
  if (!definition) throw new Error(`Unknown wiki adventure: ${settingId}/${planId}`)
  return definition
}

function buildUpdateChangeSet(state: AdminWikiAdventureState, updates: Array<{ path: string; content: string }>, intent: string): AuthoringChangeSet {
  const source = new Map(state.files.map((file) => [file.path, file]))
  const allowed = allowedPathSet(state)
  const changes = updates.map((update) => {
    if (!allowed.has(update.path)) throw new Error(`Refusing to edit source outside this adventure: ${update.path}`)
    const existing = source.get(update.path)
    if (update.path.endsWith(".json")) JSON.parse(update.content)
    if (!existing || state.source === "local") return { op: "create" as const, path: update.path, content: update.content }
    return { op: "update" as const, path: update.path, beforeHash: existing.hash, content: update.content }
  })
  return {
    id: `admin-${Date.now()}`,
    intent,
    source: "ai",
    target: { settingId: state.definition.settingId, planId: state.definition.planId, draftId: "canonical" },
    changes,
    affectedEntities: [],
    risks: ["Writes directly to canonical wiki source."],
  }
}

async function writeCanonicalChangeSet(state: AdminWikiAdventureState, changeSet: AuthoringChangeSet) {
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA
  if (!bucket || !s3Client) throw new Error("AWS S3 data bucket is required for admin wiki authoring.")
  const effectiveChangeSet = state.source === "local" ? seedLocalFilesChangeSet(state, changeSet) : changeSet
  if (state.source === "s3") {
    applyAuthoringChangeSet(new Map(state.files.map((file) => [file.path, file])), effectiveChangeSet)
  }
  const service = new S3WikiAdventureSourceService(s3Client, bucket)
  await service.writeApprovedChangeSet(effectiveChangeSet)
  const nextFiles = state.files.map((file) => {
    const update = effectiveChangeSet.changes.find((change) => "path" in change && change.path === file.path)
    return update && "content" in update ? createSourceFile(file.path, update.content) : file
  })
  for (const change of effectiveChangeSet.changes) {
    if (change.op === "create") nextFiles.push(createSourceFile(change.path, change.content))
  }
  return uniqueFiles(nextFiles)
}

function seedLocalFilesChangeSet(state: AdminWikiAdventureState, changeSet: AuthoringChangeSet): AuthoringChangeSet {
  const replacement = new Map(changeSet.changes.filter((change) => "path" in change && "content" in change).map((change) => [change.path, change.content]))
  return {
    ...changeSet,
    changes: state.files.map((file) => ({
      op: "create" as const,
      path: file.path,
      content: replacement.get(file.path) ?? file.content,
    })),
  }
}

function uniqueFiles(files: SourceFile[]) {
  return [...new Map(files.map((file) => [file.path, file])).values()].sort((a, b) => a.path.localeCompare(b.path))
}

function allowedPathSet(state: AdminWikiAdventureState) {
  return new Set(state.files.map((file) => file.path))
}

function sameFileSet(a: SourceFile[], b: SourceFile[]) {
  if (a.length !== b.length) return false
  const local = new Set(b.map((file) => `${file.path}:${file.hash}`))
  return a.every((file) => local.has(`${file.path}:${file.hash}`))
}

function buildAuthoringPrompt(state: AdminWikiAdventureState, request: string) {
  const compactFiles = state.files.map((file) => ({
    path: file.path,
    hash: file.hash,
    content: file.content.slice(0, 12000),
  }))
  return `You are editing a D20 Adventures wiki-authored adventure.
Adventure: ${state.artifacts.manifest.title}
Setting ID: ${state.definition.settingId}
Adventure ID: ${state.definition.planId}

Return JSON only. Make the requested change by returning full replacement content for every file you change.
Only edit existing paths shown below. Do not invent paths. Preserve valid frontmatter and JSON.
If the request is ambiguous, make the smallest useful improvement.

Admin request:
${request}

Current source files:
${JSON.stringify(compactFiles, null, 2)}`
}
