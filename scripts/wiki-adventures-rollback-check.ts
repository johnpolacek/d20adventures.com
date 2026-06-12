/**
 * Unit 7 — Rollback / content-ref pinning verification (no prod writes).
 *
 * Proves the safety chain the runtime relies on when a bad version is published:
 *   1. Publish v1 (good); `latest` points to v1.
 *   2. An adventure pins contentRef = v1 (as create/start-adventure do).
 *   3. Publish v2 (a different/"bad" version); `latest` moves to v2.
 *   4. The pinned adventure still resolves v1 — unaffected by the bad publish (immutable versions).
 *   5. A fresh start (resolving `latest`) would get the bad v2.
 *   6. Rollback re-points `latest` to v1.
 *   7. A fresh start after rollback resolves v1 again; both versions remain immutably readable.
 */
import assert from "node:assert/strict"
import { type ContentRef, InMemoryWikiAdventureArtifactLoader } from "@/lib/wiki-adventures/artifact-loader"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { getLocalWikiAdventureDefinition, readLocalWikiAdventureSourceFiles } from "@/lib/wiki-adventures/local-runtime"
import { InMemoryWikiAdventurePublishedRepository } from "@/lib/wiki-adventures/published-repository"
import type { SourceFile } from "@/lib/wiki-adventures/types"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "the-midnight-summons"

function resolvedVersionId(ref: Exclude<ContentRef, { source: "latest" }>): string {
  assert.equal(ref.source, "published", "expected a published content ref")
  return (ref as Extract<ContentRef, { source: "published" }>).versionId
}

function compile(files: SourceFile[], def: { contentVersion: string; assetHosts: string[] }) {
  return compileAdventureSourceTree(files, { mode: "publish", contentVersion: def.contentVersion, allowedAssetHosts: def.assetHosts })
}

async function main() {
  const def = getLocalWikiAdventureDefinition(SETTING_ID, PLAN_ID)
  if (!def) throw new Error(`No registered wiki adventure for ${SETTING_ID}/${PLAN_ID}`)

  const sourceV1 = readLocalWikiAdventureSourceFiles(def)
  // v2 = a deliberately different ("bad") publish: mutate the adventure title so the content hash differs.
  const sourceV2 = sourceV1.map((file) =>
    file.path.endsWith("/adventure.md") ? { ...file, content: file.content.replace(/title: "[^"]*"/, 'title: "BROKEN PUBLISH"'), hash: `${file.hash}-v2` } : file
  )

  const artifactsV1 = compile(sourceV1, def)
  const artifactsV2 = compile(sourceV2, def)
  assert.notEqual(artifactsV1.manifest.contentHash, artifactsV2.manifest.contentHash, "v1 and v2 must have different content hashes")
  assert.equal(artifactsV1.manifest.title, "The Midnight Summons")
  assert.equal(artifactsV2.manifest.title, "BROKEN PUBLISH")

  // Repository and loader share one object store so the loader reads what the repo publishes.
  const store = new Map<string, string>()
  const repository = new InMemoryWikiAdventurePublishedRepository(store)
  const loader = new InMemoryWikiAdventureArtifactLoader(store)

  // 1. Publish v1 (good).
  const v1 = await repository.publish({ settingId: SETTING_ID, planId: PLAN_ID, artifacts: artifactsV1, publishedAt: new Date("2026-06-12T00:00:00Z") })
  assert.equal((await repository.readLatestPointer(SETTING_ID, PLAN_ID))?.versionId, v1.versionId, "latest should point to v1 after first publish")

  // 2. An adventure pins contentRef = v1.
  const pinned = { source: "published" as const, settingId: SETTING_ID, planId: PLAN_ID, versionId: v1.versionId, contentHash: artifactsV1.manifest.contentHash }
  const pinnedBefore = await loader.loadArtifacts(pinned)
  assert.equal(pinnedBefore.artifacts.manifest.title, "The Midnight Summons", "pinned read should resolve v1 content")

  // 3. Publish v2 (the bad version); latest moves to v2.
  const v2 = await repository.publish({ settingId: SETTING_ID, planId: PLAN_ID, artifacts: artifactsV2, publishedAt: new Date("2026-06-12T01:00:00Z") })
  assert.notEqual(v2.versionId, v1.versionId, "v2 must be a distinct version")
  assert.equal((await repository.readLatestPointer(SETTING_ID, PLAN_ID))?.versionId, v2.versionId, "latest should move to v2")

  // 4. The pinned adventure is UNAFFECTED by the bad publish — still resolves v1.
  const pinnedAfterBadPublish = await loader.loadArtifacts(pinned)
  assert.equal(pinnedAfterBadPublish.artifacts.manifest.contentHash, artifactsV1.manifest.contentHash, "pinned content hash must not change after a bad publish")
  assert.equal(pinnedAfterBadPublish.artifacts.manifest.title, "The Midnight Summons", "pinned adventure must still see v1 content after bad publish")

  // 5. A fresh start (resolving `latest`) would get the bad v2.
  const freshDuringBad = await loader.loadArtifacts({ source: "latest", settingId: SETTING_ID, planId: PLAN_ID })
  assert.equal(resolvedVersionId(freshDuringBad.ref), v2.versionId)
  assert.equal(freshDuringBad.artifacts.manifest.title, "BROKEN PUBLISH", "a new start during the bad publish would see v2")

  // 6. Rollback re-points latest to v1.
  const rollback = await repository.rollback({ settingId: SETTING_ID, planId: PLAN_ID, versionId: v1.versionId, updatedAt: new Date("2026-06-12T02:00:00Z") })
  assert.equal(rollback.previousVersionId, v2.versionId)
  assert.equal((await repository.readLatestPointer(SETTING_ID, PLAN_ID))?.versionId, v1.versionId, "rollback should re-point latest to v1")

  // 7. A fresh start after rollback resolves v1; both versions remain immutably readable.
  const freshAfterRollback = await loader.loadArtifacts({ source: "latest", settingId: SETTING_ID, planId: PLAN_ID })
  assert.equal(resolvedVersionId(freshAfterRollback.ref), v1.versionId)
  assert.equal(freshAfterRollback.artifacts.manifest.title, "The Midnight Summons", "a new start after rollback sees the restored v1")
  const v2StillReadable = await loader.loadArtifacts({ source: "published", settingId: SETTING_ID, planId: PLAN_ID, versionId: v2.versionId, contentHash: artifactsV2.manifest.contentHash })
  assert.equal(v2StillReadable.artifacts.manifest.title, "BROKEN PUBLISH", "the rolled-back version remains immutably readable for re-rollforward")

  console.log("Rollback / content-ref pinning verification passed")
}

main().catch((error) => {
  console.error("Rollback check failed:", error?.message ?? error)
  process.exit(1)
})
