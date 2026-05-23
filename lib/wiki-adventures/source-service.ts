import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import { streamToString } from "@/lib/s3-utils"
import { ChangeSetError, applyAuthoringChangeSet, createSourceFile, createSourceTree, type SourceTree } from "./change-sets"
import type { AuthoringChangeSet, SourceFile } from "./types"

export interface WikiAdventureSourceService {
  readFile(path: string): Promise<SourceFile | null>
  listFiles(prefix: string): Promise<SourceFile[]>
  writeApprovedChangeSet(changeSet: AuthoringChangeSet): Promise<SourceFile[]>
}

export class InMemoryWikiAdventureSourceService implements WikiAdventureSourceService {
  private tree: SourceTree

  constructor(files: Array<{ path: string; content: string }> = []) {
    this.tree = createSourceTree(files)
  }

  async readFile(path: string): Promise<SourceFile | null> {
    return this.tree.get(path) ?? null
  }

  async listFiles(prefix: string): Promise<SourceFile[]> {
    return [...this.tree.values()].filter((file) => file.path.startsWith(prefix) && isSourceContentPath(file.path)).sort((a, b) => a.path.localeCompare(b.path))
  }

  async writeApprovedChangeSet(changeSet: AuthoringChangeSet): Promise<SourceFile[]> {
    this.tree = applyAuthoringChangeSet(this.tree, changeSet)
    return [...this.tree.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  allFiles(): SourceFile[] {
    return [...this.tree.values()].sort((a, b) => a.path.localeCompare(b.path))
  }
}

export class S3WikiAdventureSourceService implements WikiAdventureSourceService {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async readFile(path: string): Promise<SourceFile | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }))
      if (!response.Body) return null
      const content = await streamToString(response.Body as Parameters<typeof streamToString>[0])
      return createSourceFile(path, content)
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : ""
      if (name === "NoSuchKey" || name === "NotFound") return null
      throw error
    }
  }

  async listFiles(prefix: string): Promise<SourceFile[]> {
    const files: SourceFile[] = []
    let ContinuationToken: string | undefined

    do {
      const response = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }))
      for (const object of response.Contents ?? []) {
        if (!object.Key || !isSourceContentPath(object.Key)) continue
        const file = await this.readFile(object.Key)
        if (file) files.push(file)
      }
      ContinuationToken = response.NextContinuationToken
    } while (ContinuationToken)

    return files.sort((a, b) => a.path.localeCompare(b.path))
  }

  async writeApprovedChangeSet(changeSet: AuthoringChangeSet): Promise<SourceFile[]> {
    for (const change of changeSet.changes) {
      if (change.op === "create") {
        const existing = await this.readFile(change.path)
        if (existing) throw new ChangeSetError(`Cannot create existing path: ${change.path}`)
        await this.putFile(createSourceFile(change.path, change.content))
        continue
      }

      if (change.op === "update") {
        const existing = await this.readFile(change.path)
        if (!existing) throw new ChangeSetError(`Cannot update missing path: ${change.path}`)
        assertRemoteHash(existing, change.beforeHash)
        await this.putFile(createSourceFile(change.path, change.content))
        continue
      }

      if (change.op === "delete") {
        const existing = await this.readFile(change.path)
        if (!existing) throw new ChangeSetError(`Cannot delete missing path: ${change.path}`)
        assertRemoteHash(existing, change.beforeHash)
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: change.path }))
        continue
      }

      const existing = await this.readFile(change.fromPath)
      if (!existing) throw new ChangeSetError(`Cannot rename missing path: ${change.fromPath}`)
      const target = await this.readFile(change.toPath)
      if (target) throw new ChangeSetError(`Cannot rename over existing path: ${change.toPath}`)
      assertRemoteHash(existing, change.beforeHash)
      await this.putFile(createSourceFile(change.toPath, existing.content))
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: change.fromPath }))
    }

    return Promise.all(
      changeSet.changes
        .map((change) => (change.op === "rename" ? change.toPath : change.op === "delete" ? null : change.path))
        .filter((path): path is string => Boolean(path))
        .map(async (path) => {
          const file = await this.readFile(path)
          if (!file) throw new ChangeSetError(`Expected written path to exist: ${path}`)
          return file
        })
    )
  }

  private async putFile(file: SourceFile): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: file.path,
        Body: file.content,
        ContentType: file.path.endsWith(".json") ? "application/json" : "text/markdown; charset=utf-8",
      })
    )
  }
}

function assertRemoteHash(file: SourceFile, expected: string) {
  if (file.hash !== expected) {
    throw new ChangeSetError(`Stale write for ${file.path}: expected ${expected}, found ${file.hash}`)
  }
}

function isSourceContentPath(path: string) {
  return (path.endsWith(".md") || path.endsWith(".json")) && !path.endsWith("/migration-report.json")
}
