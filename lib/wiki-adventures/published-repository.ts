import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import { streamToString } from "@/lib/s3-utils"
import { hashJson } from "./hash"
import { latestPointerKey, previewPrefix, publishedVersionPrefix } from "./s3-keys"
import type { RuntimeArtifacts } from "./types"

export const runtimeArtifactNames = [
  "manifest.json",
  "encounters.json",
  "entities.json",
  "character-sheets.json",
  "graph.json",
  "retrieval-index.json",
  "validation-report.json",
] as const

export type RuntimeArtifactName = (typeof runtimeArtifactNames)[number]

export type LatestPointer = {
  schemaVersion: 1
  settingId: string
  planId: string
  versionId: string
  versionPrefix: string
  contentHash: string
  publishedAt: string
  manifest: Pick<RuntimeArtifacts["manifest"], "title" | "startEncounterId" | "validation">
  updatedAt: string
  updateReason: "publish" | "rollback"
}

export type PublishRecord = {
  settingId: string
  planId: string
  versionId: string
  versionPrefix: string
  latestPointerKey: string
  contentHash: string
  publishedAt: string
  artifactKeys: Record<RuntimeArtifactName, string>
  noop: boolean
}

export type PreviewRecord = {
  settingId: string
  planId: string
  draftId: string
  previewPrefix: string
  contentHash: string
  writtenAt: string
  artifactKeys: Record<RuntimeArtifactName, string>
}

export type RollbackRecord = {
  settingId: string
  planId: string
  previousVersionId?: string
  versionId: string
  latestPointerKey: string
  updatedAt: string
}

export interface WikiAdventurePublishedRepository {
  writePreview(input: { settingId: string; planId: string; draftId: string; artifacts: RuntimeArtifacts; writtenAt?: Date }): Promise<PreviewRecord>
  publish(input: { settingId: string; planId: string; artifacts: RuntimeArtifacts; publishedAt?: Date }): Promise<PublishRecord>
  rollback(input: { settingId: string; planId: string; versionId: string; updatedAt?: Date }): Promise<RollbackRecord>
  readLatestPointer(settingId: string, planId: string): Promise<LatestPointer | null>
}

export function runtimeArtifactEntries(artifacts: RuntimeArtifacts): Array<[RuntimeArtifactName, unknown]> {
  return [
    ["manifest.json", artifacts.manifest],
    ["encounters.json", artifacts.encounters],
    ["entities.json", artifacts.entities],
    ["character-sheets.json", artifacts.characterSheets],
    ["graph.json", artifacts.graph],
    ["retrieval-index.json", artifacts.retrievalIndex],
    ["validation-report.json", artifacts.validationReport],
  ]
}

export function makePublishedVersionId(publishedAt: Date, contentHash: string): string {
  const timestamp = publishedAt.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-")
  return `${timestamp}-${contentHash.slice(0, 8)}`
}

export class InMemoryWikiAdventurePublishedRepository implements WikiAdventurePublishedRepository {
  private readonly objects = new Map<string, string>()

  async writePreview(input: { settingId: string; planId: string; draftId: string; artifacts: RuntimeArtifacts; writtenAt?: Date }): Promise<PreviewRecord> {
    const prefix = previewPrefix(input.settingId, input.planId, input.draftId)
    const entries = runtimeArtifactEntries(input.artifacts)
    const artifactKeys = artifactKeysForPrefix(prefix)
    for (const [name, value] of entries) {
      this.objects.set(`${prefix}/${name}`, JSON.stringify(value, null, 2))
    }
    return {
      settingId: input.settingId,
      planId: input.planId,
      draftId: input.draftId,
      previewPrefix: prefix,
      contentHash: input.artifacts.manifest.contentHash,
      writtenAt: (input.writtenAt ?? new Date()).toISOString(),
      artifactKeys,
    }
  }

  async publish(input: { settingId: string; planId: string; artifacts: RuntimeArtifacts; publishedAt?: Date }): Promise<PublishRecord> {
    const publishedAt = input.publishedAt ?? new Date()
    const contentHash = input.artifacts.manifest.contentHash
    const latest = await this.readLatestPointer(input.settingId, input.planId)
    if (latest?.contentHash === contentHash) {
      return {
        settingId: input.settingId,
        planId: input.planId,
        versionId: latest.versionId,
        versionPrefix: latest.versionPrefix,
        latestPointerKey: latestPointerKey(input.settingId, input.planId),
        contentHash,
        publishedAt: latest.publishedAt,
        artifactKeys: artifactKeysForPrefix(latest.versionPrefix),
        noop: true,
      }
    }

    const versionId = makePublishedVersionId(publishedAt, contentHash)
    const versionPrefix = publishedVersionPrefix(input.settingId, input.planId, versionId)
    const entries = runtimeArtifactEntries(input.artifacts)
    for (const [name] of entries) {
      const key = `${versionPrefix}/${name}`
      if (this.objects.has(key)) throw new Error(`Refusing to overwrite immutable published artifact: ${key}`)
    }
    for (const [name, value] of entries) {
      this.objects.set(`${versionPrefix}/${name}`, JSON.stringify(value, null, 2))
    }
    this.objects.set(latestPointerKey(input.settingId, input.planId), JSON.stringify(latestPointer(input, versionId, versionPrefix, publishedAt, "publish"), null, 2))

    return {
      settingId: input.settingId,
      planId: input.planId,
      versionId,
      versionPrefix,
      latestPointerKey: latestPointerKey(input.settingId, input.planId),
      contentHash,
      publishedAt: publishedAt.toISOString(),
      artifactKeys: artifactKeysForPrefix(versionPrefix),
      noop: false,
    }
  }

  async rollback(input: { settingId: string; planId: string; versionId: string; updatedAt?: Date }): Promise<RollbackRecord> {
    const versionPrefix = publishedVersionPrefix(input.settingId, input.planId, input.versionId)
    const manifestKey = `${versionPrefix}/manifest.json`
    const manifestContent = this.objects.get(manifestKey)
    if (!manifestContent) throw new Error(`Cannot rollback to missing published version: ${input.versionId}`)
    const manifest = JSON.parse(manifestContent) as RuntimeArtifacts["manifest"]
    const previous = await this.readLatestPointer(input.settingId, input.planId)
    const updatedAt = input.updatedAt ?? new Date()
    this.objects.set(
      latestPointerKey(input.settingId, input.planId),
      JSON.stringify(
        latestPointer(
          { settingId: input.settingId, planId: input.planId, artifacts: { manifest } as RuntimeArtifacts },
          input.versionId,
          versionPrefix,
          updatedAt,
          "rollback"
        ),
        null,
        2
      )
    )
    return {
      settingId: input.settingId,
      planId: input.planId,
      previousVersionId: previous?.versionId,
      versionId: input.versionId,
      latestPointerKey: latestPointerKey(input.settingId, input.planId),
      updatedAt: updatedAt.toISOString(),
    }
  }

  async readLatestPointer(settingId: string, planId: string): Promise<LatestPointer | null> {
    const content = this.objects.get(latestPointerKey(settingId, planId))
    return content ? (JSON.parse(content) as LatestPointer) : null
  }

  readJson<T>(key: string): T | null {
    const content = this.objects.get(key)
    return content ? (JSON.parse(content) as T) : null
  }

  readText(key: string): string | null {
    return this.objects.get(key) ?? null
  }

  listKeys(prefix = ""): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort()
  }
}

export class S3WikiAdventurePublishedRepository implements WikiAdventurePublishedRepository {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async writePreview(input: { settingId: string; planId: string; draftId: string; artifacts: RuntimeArtifacts; writtenAt?: Date }): Promise<PreviewRecord> {
    const prefix = previewPrefix(input.settingId, input.planId, input.draftId)
    for (const [name, value] of runtimeArtifactEntries(input.artifacts)) {
      await this.putJson(`${prefix}/${name}`, value)
    }
    return {
      settingId: input.settingId,
      planId: input.planId,
      draftId: input.draftId,
      previewPrefix: prefix,
      contentHash: input.artifacts.manifest.contentHash,
      writtenAt: (input.writtenAt ?? new Date()).toISOString(),
      artifactKeys: artifactKeysForPrefix(prefix),
    }
  }

  async publish(input: { settingId: string; planId: string; artifacts: RuntimeArtifacts; publishedAt?: Date }): Promise<PublishRecord> {
    const publishedAt = input.publishedAt ?? new Date()
    const contentHash = input.artifacts.manifest.contentHash
    const latest = await this.readLatestPointer(input.settingId, input.planId)
    if (latest?.contentHash === contentHash) {
      return {
        settingId: input.settingId,
        planId: input.planId,
        versionId: latest.versionId,
        versionPrefix: latest.versionPrefix,
        latestPointerKey: latestPointerKey(input.settingId, input.planId),
        contentHash,
        publishedAt: latest.publishedAt,
        artifactKeys: artifactKeysForPrefix(latest.versionPrefix),
        noop: true,
      }
    }

    const versionId = makePublishedVersionId(publishedAt, contentHash)
    const versionPrefix = publishedVersionPrefix(input.settingId, input.planId, versionId)
    await this.assertMissing(`${versionPrefix}/manifest.json`)
    for (const [name, value] of runtimeArtifactEntries(input.artifacts)) {
      await this.putJson(`${versionPrefix}/${name}`, value)
    }
    await this.putJson(latestPointerKey(input.settingId, input.planId), latestPointer(input, versionId, versionPrefix, publishedAt, "publish"))
    return {
      settingId: input.settingId,
      planId: input.planId,
      versionId,
      versionPrefix,
      latestPointerKey: latestPointerKey(input.settingId, input.planId),
      contentHash,
      publishedAt: publishedAt.toISOString(),
      artifactKeys: artifactKeysForPrefix(versionPrefix),
      noop: false,
    }
  }

  async rollback(input: { settingId: string; planId: string; versionId: string; updatedAt?: Date }): Promise<RollbackRecord> {
    const versionPrefix = publishedVersionPrefix(input.settingId, input.planId, input.versionId)
    const manifest = await this.readJson<RuntimeArtifacts["manifest"]>(`${versionPrefix}/manifest.json`)
    if (!manifest) throw new Error(`Cannot rollback to missing published version: ${input.versionId}`)
    const previous = await this.readLatestPointer(input.settingId, input.planId)
    const updatedAt = input.updatedAt ?? new Date()
    await this.putJson(
      latestPointerKey(input.settingId, input.planId),
      latestPointer({ settingId: input.settingId, planId: input.planId, artifacts: { manifest } as RuntimeArtifacts }, input.versionId, versionPrefix, updatedAt, "rollback")
    )
    return {
      settingId: input.settingId,
      planId: input.planId,
      previousVersionId: previous?.versionId,
      versionId: input.versionId,
      latestPointerKey: latestPointerKey(input.settingId, input.planId),
      updatedAt: updatedAt.toISOString(),
    }
  }

  async readLatestPointer(settingId: string, planId: string): Promise<LatestPointer | null> {
    return this.readJson<LatestPointer>(latestPointerKey(settingId, planId))
  }

  private async readJson<T>(key: string): Promise<T | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!response.Body) return null
      const content = await streamToString(response.Body as Parameters<typeof streamToString>[0])
      return JSON.parse(content) as T
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : ""
      if (name === "NoSuchKey" || name === "NotFound") return null
      throw error
    }
  }

  private async putJson(key: string, value: unknown): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: JSON.stringify(value, null, 2), ContentType: "application/json" }))
  }

  private async assertMissing(key: string): Promise<void> {
    const existing = await this.readJson<unknown>(key)
    if (existing) throw new Error(`Refusing to overwrite immutable published artifact: ${key}`)
  }
}

function artifactKeysForPrefix(prefix: string): Record<RuntimeArtifactName, string> {
  return Object.fromEntries(runtimeArtifactNames.map((name) => [name, `${prefix}/${name}`])) as Record<RuntimeArtifactName, string>
}

function latestPointer(
  input: { settingId: string; planId: string; artifacts: Pick<RuntimeArtifacts, "manifest"> },
  versionId: string,
  versionPrefix: string,
  date: Date,
  updateReason: "publish" | "rollback"
): LatestPointer {
  return {
    schemaVersion: 1,
    settingId: input.settingId,
    planId: input.planId,
    versionId,
    versionPrefix,
    contentHash: input.artifacts.manifest.contentHash,
    publishedAt: date.toISOString(),
    manifest: {
      title: input.artifacts.manifest.title,
      startEncounterId: input.artifacts.manifest.startEncounterId,
      validation: input.artifacts.manifest.validation,
    },
    updatedAt: date.toISOString(),
    updateReason,
  }
}

export function hashRuntimeArtifacts(artifacts: RuntimeArtifacts): string {
  return hashJson(runtimeArtifactEntries(artifacts))
}
