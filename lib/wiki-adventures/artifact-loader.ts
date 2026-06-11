import { GetObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import { streamToString } from "@/lib/s3-utils"
import { latestPointerKey, publishedVersionPrefix } from "./s3-keys"
import type { LatestPointer, RuntimeArtifactName } from "./published-repository"
import { runtimeArtifactNames } from "./published-repository"
import type { RuntimeArtifacts } from "./types"

export type ContentRef =
  | {
      source: "published"
      settingId: string
      planId: string
      versionId: string
      contentHash: string
    }
  | {
      source: "latest"
      settingId: string
      planId: string
    }
  | {
      source: "preview"
      settingId: string
      planId: string
      draftId: string
      contentHash?: string
    }

export interface WikiAdventureArtifactLoader {
  loadArtifacts(ref: ContentRef): Promise<{ ref: Exclude<ContentRef, { source: "latest" }>; artifacts: RuntimeArtifacts }>
}

export class InMemoryWikiAdventureArtifactLoader implements WikiAdventureArtifactLoader {
  constructor(private readonly objects: Map<string, string>) {}

  async loadArtifacts(ref: ContentRef): Promise<{ ref: Exclude<ContentRef, { source: "latest" }>; artifacts: RuntimeArtifacts }> {
    const resolved = ref.source === "latest" ? this.resolveLatest(ref.settingId, ref.planId) : ref
    const prefix =
      resolved.source === "published"
        ? publishedVersionPrefix(resolved.settingId, resolved.planId, resolved.versionId)
        : `preview/settings/${resolved.settingId}/adventures/${resolved.planId}/drafts/${resolved.draftId}`
    const artifacts = readArtifactsFrom((key) => this.objects.get(key) ?? null, prefix)
    return { ref: resolved, artifacts }
  }

  private resolveLatest(settingId: string, planId: string): Exclude<ContentRef, { source: "latest" }> {
    const content = this.objects.get(latestPointerKey(settingId, planId))
    if (!content) throw new Error(`Missing latest pointer for ${settingId}/${planId}`)
    const latest = JSON.parse(content) as LatestPointer
    return {
      source: "published",
      settingId,
      planId,
      versionId: latest.versionId,
      contentHash: latest.contentHash,
    }
  }
}

export class S3WikiAdventureArtifactLoader implements WikiAdventureArtifactLoader {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async loadArtifacts(ref: ContentRef): Promise<{ ref: Exclude<ContentRef, { source: "latest" }>; artifacts: RuntimeArtifacts }> {
    const resolved = ref.source === "latest" ? await this.resolveLatest(ref.settingId, ref.planId) : ref
    const prefix =
      resolved.source === "published"
        ? publishedVersionPrefix(resolved.settingId, resolved.planId, resolved.versionId)
        : `preview/settings/${resolved.settingId}/adventures/${resolved.planId}/drafts/${resolved.draftId}`
    const artifacts = await readArtifactsFromAsync((key) => this.readText(key), prefix)
    return { ref: resolved, artifacts }
  }

  private async resolveLatest(settingId: string, planId: string): Promise<Exclude<ContentRef, { source: "latest" }>> {
    const content = await this.readText(latestPointerKey(settingId, planId))
    if (!content) throw new Error(`Missing latest pointer for ${settingId}/${planId}`)
    const latest = JSON.parse(content) as LatestPointer
    return {
      source: "published",
      settingId,
      planId,
      versionId: latest.versionId,
      contentHash: latest.contentHash,
    }
  }

  private async readText(key: string): Promise<string | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!response.Body) return null
      return streamToString(response.Body as Parameters<typeof streamToString>[0])
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : ""
      if (name === "NoSuchKey" || name === "NotFound") return null
      throw error
    }
  }
}

function readArtifactsFrom(read: (key: string) => string | null, prefix: string): RuntimeArtifacts {
  return Object.fromEntries(
    runtimeArtifactNames.map((name) => {
      const content = read(`${prefix}/${name}`)
      if (!content) throw new Error(`Missing runtime artifact ${prefix}/${name}`)
      return [artifactProperty(name), JSON.parse(content)]
    })
  ) as unknown as RuntimeArtifacts
}

async function readArtifactsFromAsync(read: (key: string) => Promise<string | null>, prefix: string): Promise<RuntimeArtifacts> {
  const entries = await Promise.all(
    runtimeArtifactNames.map(async (name) => {
      const content = await read(`${prefix}/${name}`)
      if (!content) throw new Error(`Missing runtime artifact ${prefix}/${name}`)
      return [artifactProperty(name), JSON.parse(content)] as const
    })
  )
  return Object.fromEntries(entries) as unknown as RuntimeArtifacts
}

function artifactProperty(name: RuntimeArtifactName): keyof RuntimeArtifacts {
  const map: Record<RuntimeArtifactName, keyof RuntimeArtifacts> = {
    "manifest.json": "manifest",
    "encounters.json": "encounters",
    "entities.json": "entities",
    "character-sheets.json": "characterSheets",
    "graph.json": "graph",
    "retrieval-index.json": "retrievalIndex",
    "validation-report.json": "validationReport",
  }
  return map[name]
}
