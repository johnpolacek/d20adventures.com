import { hashContent } from "./hash"
import { isSafeSourcePath } from "./s3-keys"
import type { AuthoringChangeSet, SourceFile } from "./types"

export class ChangeSetError extends Error {}

export type SourceTree = Map<string, SourceFile>

export function createSourceFile(path: string, content: string): SourceFile {
  return { path, content, hash: hashContent(content) }
}

export function createSourceTree(files: Array<{ path: string; content: string }>): SourceTree {
  return new Map(files.map((file) => [file.path, createSourceFile(file.path, file.content)]))
}

export function applyAuthoringChangeSet(tree: SourceTree, changeSet: AuthoringChangeSet): SourceTree {
  const next = new Map(tree)

  for (const change of changeSet.changes) {
    if (change.op === "create") {
      assertSafePath(change.path)
      if (next.has(change.path)) throw new ChangeSetError(`Cannot create existing path: ${change.path}`)
      next.set(change.path, createSourceFile(change.path, change.content))
      continue
    }

    if (change.op === "update") {
      assertSafePath(change.path)
      const current = next.get(change.path)
      if (!current) throw new ChangeSetError(`Cannot update missing path: ${change.path}`)
      assertHash(current, change.beforeHash)
      next.set(change.path, createSourceFile(change.path, change.content))
      continue
    }

    if (change.op === "delete") {
      assertSafePath(change.path)
      const current = next.get(change.path)
      if (!current) throw new ChangeSetError(`Cannot delete missing path: ${change.path}`)
      assertHash(current, change.beforeHash)
      next.delete(change.path)
      continue
    }

    assertSafePath(change.fromPath)
    assertSafePath(change.toPath)
    const current = next.get(change.fromPath)
    if (!current) throw new ChangeSetError(`Cannot rename missing path: ${change.fromPath}`)
    if (next.has(change.toPath)) throw new ChangeSetError(`Cannot rename over existing path: ${change.toPath}`)
    assertHash(current, change.beforeHash)
    next.delete(change.fromPath)
    next.set(change.toPath, createSourceFile(change.toPath, current.content))
  }

  return next
}

function assertHash(file: SourceFile, expected: string) {
  if (file.hash !== expected) {
    throw new ChangeSetError(`Stale write for ${file.path}: expected ${expected}, found ${file.hash}`)
  }
}

function assertSafePath(path: string) {
  if (!isSafeSourcePath(path)) {
    throw new ChangeSetError(`Unsafe source path: ${path}`)
  }
}

