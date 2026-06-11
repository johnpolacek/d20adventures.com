import assert from "node:assert/strict"
import { compileAdventureSourceTree, createSourceFile, InMemoryWikiAdventurePublishedRepository, migrateAdventurePlanToWikiSource } from "@/lib/wiki-adventures"
import { representativeMyrAdventurePlan } from "@/lib/wiki-adventures/myr-fixture"

const assetHost = "d20adventures-content.s3.us-east-1.amazonaws.com"

async function main() {
  const migrated = migrateAdventurePlanToWikiSource(representativeMyrAdventurePlan, {
    generatedAt: new Date("2026-05-21T22:30:00Z"),
    assetHost,
  })

  assert.equal(migrated.report.planId, "the-old-road")
  assert.equal(
    migrated.report.generatedFiles.some((file) => file.path.endsWith("/adventure.md")),
    true
  )
  assert.equal(
    migrated.report.generatedFiles.some((file) => file.path.endsWith("/encounters/gatehouse-entry.md")),
    true
  )
  assert.equal(
    migrated.report.generatedFiles.some((file) => file.path.endsWith("/npcs/captain-vala.json")),
    true
  )
  assert.equal(
    migrated.report.sourceFieldMappings.some((entry) => entry.source === "AdventurePlan.start"),
    true
  )
  assert.equal(
    migrated.report.warnings.every((warning) => warning.code === "asset-key-converted"),
    true
  )

  const compiled = compileAdventureSourceTree(migrated.files, {
    mode: "publish",
    contentVersion: "2026-05-21T22-30-00Z-batchb001",
    allowedAssetHosts: [assetHost],
  })

  assert.equal(compiled.validationReport.status, "passed")
  assert.equal(compiled.manifest.adventureId, "the-old-road")
  assert.equal(compiled.manifest.startEncounterId, "gatehouse-entry")
  assert.equal(Object.keys(compiled.encounters).length, 2)
  assert.equal(compiled.characterSheets.npcs["captain-vala"].sheet.attributes?.wisdom, 13)
  assert.equal(compiled.characterSheets.premadeCharacters["vala-apprentice"].sheet.attributes.dexterity, 15)

  const repository = new InMemoryWikiAdventurePublishedRepository()
  const preview = await repository.writePreview({
    settingId: "myr",
    planId: "the-old-road",
    draftId: "active",
    artifacts: compiled,
    writtenAt: new Date("2026-05-21T22:31:00Z"),
  })
  assert.equal(repository.listKeys(preview.previewPrefix).length, 7)
  assert.ok(repository.readJson(preview.artifactKeys["manifest.json"]))

  const firstPublish = await repository.publish({
    settingId: "myr",
    planId: "the-old-road",
    artifacts: compiled,
    publishedAt: new Date("2026-05-21T22:32:00Z"),
  })
  assert.equal(firstPublish.noop, false)
  assert.equal(firstPublish.versionId, `2026-05-21T22-32-00Z-${compiled.manifest.contentHash.slice(0, 8)}`)
  assert.equal(repository.listKeys(firstPublish.versionPrefix).length, 7)
  assert.equal((await repository.readLatestPointer("myr", "the-old-road"))?.versionId, firstPublish.versionId)

  const noOpPublish = await repository.publish({
    settingId: "myr",
    planId: "the-old-road",
    artifacts: compiled,
    publishedAt: new Date("2026-05-21T22:33:00Z"),
  })
  assert.equal(noOpPublish.noop, true)
  assert.equal(noOpPublish.versionId, firstPublish.versionId)
  assert.equal(repository.listKeys(firstPublish.versionPrefix).length, 7)

  const revisedFiles = migrated.files.map((file) =>
    file.path.endsWith("/encounters/market-square-arrival.md") ? createSourceFile(file.path, file.content.replace("whispers move faster than coin", "rumors move faster than coin")) : file
  )
  const revisedCompiled = compileAdventureSourceTree(revisedFiles, {
    mode: "publish",
    contentVersion: "2026-05-21T22-34-00Z-revised1",
    allowedAssetHosts: [assetHost],
  })
  assert.notEqual(revisedCompiled.manifest.contentHash, compiled.manifest.contentHash)
  const secondPublish = await repository.publish({
    settingId: "myr",
    planId: "the-old-road",
    artifacts: revisedCompiled,
    publishedAt: new Date("2026-05-21T22:34:00Z"),
  })
  assert.equal(secondPublish.noop, false)
  assert.notEqual(secondPublish.versionId, firstPublish.versionId)
  assert.equal((await repository.readLatestPointer("myr", "the-old-road"))?.versionId, secondPublish.versionId)

  const rollback = await repository.rollback({
    settingId: "myr",
    planId: "the-old-road",
    versionId: firstPublish.versionId,
    updatedAt: new Date("2026-05-21T22:35:00Z"),
  })
  assert.equal(rollback.previousVersionId, secondPublish.versionId)
  assert.equal((await repository.readLatestPointer("myr", "the-old-road"))?.versionId, firstPublish.versionId)
  assert.equal(repository.listKeys(firstPublish.versionPrefix).length, 7)
  assert.equal(repository.listKeys(secondPublish.versionPrefix).length, 7)

  console.log("Batch B preview/publish and Myr migration checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
