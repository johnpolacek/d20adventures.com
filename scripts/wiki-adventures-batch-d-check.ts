import assert from "node:assert/strict"
import { type AiAuthoringToolInput, createSourceFile, migrateAdventurePlanToWikiSource, proposeAiAuthoringChangeSet } from "@/lib/wiki-adventures"
import { representativeMyrAdventurePlan } from "@/lib/wiki-adventures/myr-fixture"

const assetHost = "d20adventures-content.s3.us-east-1.amazonaws.com"

function sourceFiles() {
  return migrateAdventurePlanToWikiSource(representativeMyrAdventurePlan, {
    generatedAt: new Date("2026-05-21T22:30:00Z"),
    assetHost,
  }).files
}

function propose(input: AiAuthoringToolInput, files = sourceFiles()) {
  return proposeAiAuthoringChangeSet(files, input, {
    mode: "draftPreview",
    allowedAssetHosts: [assetHost],
  })
}

function main() {
  const base = sourceFiles()
  const gatehousePath = "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md"
  const captainPath = "content/settings/myr/npcs/captain-vala.md"

  const cases: AiAuthoringToolInput[] = [
    {
      tool: "createEncounter",
      settingId: "myr",
      planId: "the-old-road",
      encounterId: "roadside-warning",
      title: "Roadside Warning",
      intro: "A marker beside the road warns travelers away from the low bridge.",
    },
    {
      tool: "expandEncounter",
      path: gatehousePath,
      expansion: "Add a sensory detail about damp timber and distant market bells.",
    },
    {
      tool: "splitEncounter",
      sourcePath: gatehousePath,
      newEncounterId: "gatehouse-questioning",
      newTitle: "Gatehouse Questioning",
      movedText: "Captain Vala asks what the party saw on the road.",
      transitionCondition: "the questioning becomes a separate exchange",
    },
    {
      tool: "linkTransition",
      sourcePath: gatehousePath,
      targetEncounterId: "market-square-arrival",
      condition: "the party receives a gate token",
      label: "Gate Token",
    },
    {
      tool: "summarizeEntity",
      path: captainPath,
      summary: "Captain Vala protects the gatehouse while hiding how badly the road reports worry her.",
    },
    {
      tool: "addTransition",
      sourcePath: gatehousePath,
      targetEncounterId: "market-square-arrival",
      condition: "the party follows Vala's directions",
    },
    {
      tool: "createCharacterPair",
      settingId: "myr",
      planId: "the-old-road",
      characterType: "npc",
      characterId: "road-warden",
      name: "Road Warden",
      image: `https://${assetHost}/content/settings/myr/assets/portraits/road-warden.jpg`,
      archetype: "Ranger",
      race: "Human",
      appearance: "A quiet scout in weathered green with a road-token badge.",
    },
  ]

  for (const input of cases) {
    const proposal = propose(input, base)
    assert.equal(proposal.tool, input.tool)
    assert.equal(proposal.changeSet.source, "ai")
    assert.ok(proposal.changeSet.changes.length > 0)
    assert.equal(proposal.diff.length, proposal.changeSet.changes.length)
    assert.ok(["passed", "passedWithWarnings"].includes(proposal.validationAfter.status))
    assert.equal(
      proposal.changeSet.risks.every((risk) => risk.length > 0),
      true
    )
  }

  const characterPair = propose(cases.at(-1)!, base)
  assert.equal(characterPair.requiresMechanicalConfirmation, true)
  assert.equal(
    characterPair.diff.some((diff) => diff.path.endsWith("road-warden.json")),
    true
  )

  const brokenFiles = base.map((file) =>
    file.path === gatehousePath ? createSourceFile(file.path, file.content.replace("[[encounter:market-square-arrival]]", "[[encounter:missing-market]]")) : file
  )
  const brokenBefore = propose(
    {
      tool: "expandEncounter",
      path: gatehousePath,
      expansion: "Keep the unresolved transition visible for repair.",
    },
    brokenFiles
  )
  assert.equal(brokenBefore.validationBefore.status, "passedWithWarnings")

  const repair = propose(
    {
      tool: "repairMissingTransition",
      settingId: "myr",
      planId: "the-old-road",
      targetEncounterId: "missing-market",
      title: "Missing Market",
    },
    brokenFiles
  )
  assert.equal(repair.validationBefore.status, "passedWithWarnings")
  assert.equal(repair.validationAfter.status, "passed")
  assert.equal(repair.diff[0]?.op, "create")
  assert.equal(repair.diff[0]?.path.endsWith("/encounters/missing-market.md"), true)

  console.log("Batch D AI authoring change-set checks passed")
}

main()
