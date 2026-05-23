import assert from "node:assert/strict"
import {
  assembleGameplayContextPacket,
  buildWikiEncounterProgressionPrompt,
  compileAdventureSourceTree,
  InMemoryWikiAdventureArtifactLoader,
  InMemoryWikiAdventurePublishedRepository,
  migrateAdventurePlanToWikiSource,
  validateAdventurePatch,
  validatePacketTransition,
  validateRuntimeTransition,
} from "@/lib/wiki-adventures"
import { representativeMyrAdventurePlan } from "@/lib/wiki-adventures/myr-fixture"
import type { RuntimeSessionSnapshot } from "@/lib/wiki-adventures/runtime-context"
import type { Turn } from "@/types/adventure"

const assetHost = "d20adventures-content.s3.us-east-1.amazonaws.com"

async function main() {
  const migrated = migrateAdventurePlanToWikiSource(representativeMyrAdventurePlan, {
    generatedAt: new Date("2026-05-21T22:30:00Z"),
    assetHost,
  })
  const artifacts = compileAdventureSourceTree(migrated.files, {
    mode: "publish",
    contentVersion: "2026-05-22T04-15-00Z-batche001",
    allowedAssetHosts: [assetHost],
  })
  assert.equal(artifacts.validationReport.status, "passed")

  const repository = new InMemoryWikiAdventurePublishedRepository()
  const publish = await repository.publish({
    settingId: "myr",
    planId: "the-old-road",
    artifacts,
    publishedAt: new Date("2026-05-22T04:15:00Z"),
  })
  const objectMap = new Map(repository.listKeys().map((key) => [key, repository.readText(key) ?? ""]))
  const loader = new InMemoryWikiAdventureArtifactLoader(objectMap)
  const loaded = await loader.loadArtifacts({ source: "latest", settingId: "myr", planId: "the-old-road" })
  assert.equal(loaded.ref.source, "published")
  assert.equal(loaded.artifacts.manifest.contentHash, artifacts.manifest.contentHash)
  assert.equal(loaded.ref.versionId, publish.versionId)

  const pc = loaded.artifacts.characterSheets.premadeCharacters["vala-apprentice"].sheet
  const npc = loaded.artifacts.characterSheets.npcs["captain-vala"].sheet
  const currentTurn: Turn = {
    id: "turn-1",
    adventureId: "adv-1",
    encounterId: "gatehouse-entry",
    title: loaded.artifacts.encounters["gatehouse-entry"].title,
    narrative: "The party reaches the gatehouse.\n\n[OriginalReply: We ask Captain Vala for passage.]",
    characters: [
      { ...pc, userId: "user-1", initiative: 15, hasReplied: true, isComplete: true },
      { ...npc, initiative: 12, hasReplied: false, isComplete: false },
    ],
  }
  const session: RuntimeSessionSnapshot = {
    adventureInstanceId: "adv-1",
    currentTurnOrder: 2,
    narrativeSummary: "The party arrived at the old road gatehouse.",
    currentTurn,
    allTurns: [
      { encounterId: "gatehouse-entry", order: 1, narrative: "The road narrowed before repaired timber walls." },
      { encounterId: "gatehouse-entry", order: 2, narrative: currentTurn.narrative },
    ],
  }
  const packet = assembleGameplayContextPacket({
    artifacts: loaded.artifacts,
    contentRef: loaded.ref,
    session,
  })
  assert.equal(packet.currentEncounter.id, "gatehouse-entry")
  assert.deepEqual(packet.outputContract.allowedNextEncounterIds, ["gatehouse-entry", "market-square-arrival"])
  assert.equal(packet.characters.live[0]?.healthPercent, 100)
  assert.equal(packet.characters.baselines.some((entry) => entry.id === "vala-apprentice" && entry.type === "pc"), true)
  assert.equal(packet.linkedContext.npcProfiles.some((entry) => entry.id === "captain-vala"), true)
  assert.deepEqual(loaded.artifacts.encounters["gatehouse-entry"].npcRefs, [{ id: "captain-vala", behavior: "Question the party before opening the gate.", initialInitiative: 12 }])

  const prompt = buildWikiEncounterProgressionPrompt(packet)
  assert.match(prompt, /Content Hash:/)
  assert.match(prompt, /Available Transition Options/)
  assert.match(prompt, /adventurePatch/)
  assert.equal(prompt.includes("Section Title:"), false)
  assert.equal(prompt.includes("Scene Title:"), false)

  const continueValidation = validatePacketTransition(packet, "gatehouse-entry")
  assert.equal(continueValidation.allowed, true)
  assert.equal(continueValidation.allowed && continueValidation.kind, "continue")

  const transitionValidation = validatePacketTransition(packet, "market-square-arrival")
  assert.equal(transitionValidation.allowed, true)
  assert.equal(transitionValidation.allowed && transitionValidation.kind, "transition")

  const illegalValidation = validatePacketTransition(packet, "unlinked-encounter")
  assert.equal(illegalValidation.allowed, false)
  assert.equal(!illegalValidation.allowed && illegalValidation.rejectedReason, "illegal_target")

  const staleValidation = validateRuntimeTransition({
    expectedContentHash: packet.contentRef.contentHash,
    liveContentHash: "stale",
    expectedCurrentEncounterId: packet.contentRef.currentEncounterId,
    liveCurrentEncounterId: packet.contentRef.currentEncounterId,
    proposedNextEncounterId: "market-square-arrival",
    legalTransitions: packet.graph.legalTransitions,
  })
  assert.equal(staleValidation.allowed, false)
  assert.equal(!staleValidation.allowed && staleValidation.rejectedReason, "stale_content")

  const acceptedPatch = validateAdventurePatch(
    {
      summaryDelta: "Captain Vala lets the party through the gate.",
      discoveries: [{ id: "vala-worry", type: "fact", title: "Vala is worried", text: "The captain is hiding concern about the road reports.", visibility: "gm" }],
    },
    transitionValidation
  )
  assert.equal(acceptedPatch.transition?.fromEncounterId, "gatehouse-entry")
  assert.equal(acceptedPatch.transition?.toEncounterId, "market-square-arrival")

  assert.throws(() =>
    validateAdventurePatch(
      {
        transition: { fromEncounterId: "gatehouse-entry", toEncounterId: "market-square-arrival", reason: "should not transition" },
      },
      continueValidation
    )
  )

  console.log("Batch E gameplay runtime projection checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
