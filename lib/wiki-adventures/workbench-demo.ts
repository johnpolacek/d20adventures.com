import { compileAdventureSourceTree } from "./compiler"
import { createSourceFile } from "./change-sets"
import { representativeMyrAdventurePlan } from "./myr-fixture"
import { migrateAdventurePlanToWikiSource } from "./myr-migration"
import { InMemoryWikiAdventurePublishedRepository } from "./published-repository"
import type { RuntimeArtifacts, SourceFile, ValidationMode, ValidationReport } from "./types"

export const workbenchAssetHost = "d20adventures-content.s3.us-east-1.amazonaws.com"

export type WorkbenchFile = SourceFile & {
  kind: "markdown" | "json"
  title: string
  contentType: string
}

export type WorkbenchGraphNode = {
  id: string
  title: string
  isStart: boolean
  outgoing: string[]
}

export type WorkbenchSummary = {
  manifest: RuntimeArtifacts["manifest"]
  validationReport: ValidationReport
  graphNodes: WorkbenchGraphNode[]
  fileFindings: Record<string, number>
  publishPreview: {
    latestVersionId: string
    latestPointerKey: string
    versionPrefix: string
    artifactCount: number
  }
}

export type WorkbenchInitialState = {
  files: WorkbenchFile[]
  selectedPath: string
  summary: WorkbenchSummary
  migrationWarnings: Array<{ code: string; message: string; source?: string }>
}

export async function createRepresentativeWorkbenchState(): Promise<WorkbenchInitialState> {
  const migrated = migrateAdventurePlanToWikiSource(representativeMyrAdventurePlan, {
    generatedAt: new Date("2026-05-21T22:30:00Z"),
    assetHost: workbenchAssetHost,
  })
  const artifacts = compileWorkbenchFiles(migrated.files, "draftPreview")
  const repository = new InMemoryWikiAdventurePublishedRepository()
  const publish = await repository.publish({
    settingId: artifacts.manifest.settingId,
    planId: artifacts.manifest.planId,
    artifacts,
    publishedAt: new Date("2026-05-21T22:45:00Z"),
  })
  return {
    files: migrated.files.map(toWorkbenchFile),
    selectedPath: `${migrated.files.find((file) => file.path.endsWith("/adventure.md"))?.path}`,
    summary: summarizeWorkbenchArtifacts(artifacts, {
      latestVersionId: publish.versionId,
      latestPointerKey: publish.latestPointerKey,
      versionPrefix: publish.versionPrefix,
      artifactCount: Object.keys(publish.artifactKeys).length,
    }),
    migrationWarnings: migrated.report.warnings,
  }
}

export function compileWorkbenchFiles(files: Array<Pick<SourceFile, "path" | "content">>, mode: ValidationMode): RuntimeArtifacts {
  return compileAdventureSourceTree(
    files.map((file) => createSourceFile(file.path, file.content)),
    {
      mode,
      contentVersion: mode === "publish" ? "2026-05-21T22-45-00Z-workbench" : "draft-preview",
      allowedAssetHosts: [workbenchAssetHost],
    }
  )
}

export function summarizeWorkbenchArtifacts(
  artifacts: RuntimeArtifacts,
  publishPreview?: {
    latestVersionId: string
    latestPointerKey: string
    versionPrefix: string
    artifactCount: number
  }
): WorkbenchSummary {
  return {
    manifest: artifacts.manifest,
    validationReport: artifacts.validationReport,
    graphNodes: Object.values(artifacts.encounters).map((encounter) => ({
      id: encounter.id,
      title: encounter.title,
      isStart: encounter.id === artifacts.graph.startEncounterId,
      outgoing: encounter.transitions.map((transition) => transition.toEncounterId),
    })),
    fileFindings: artifacts.validationReport.findings.reduce<Record<string, number>>((acc, finding) => {
      acc[finding.sourcePath] = (acc[finding.sourcePath] ?? 0) + 1
      return acc
    }, {}),
    publishPreview: publishPreview ?? {
      latestVersionId: "",
      latestPointerKey: "",
      versionPrefix: "",
      artifactCount: 0,
    },
  }
}

function toWorkbenchFile(file: SourceFile): WorkbenchFile {
  return {
    ...file,
    kind: file.path.endsWith(".json") ? "json" : "markdown",
    title: file.path.split("/").at(-1) ?? file.path,
    contentType: file.path.endsWith(".json") ? "Character Sheet JSON" : "Wiki Markdown",
  }
}
