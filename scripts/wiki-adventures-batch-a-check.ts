import assert from "node:assert/strict"
import { Readable } from "node:stream"
import type { S3Client } from "@aws-sdk/client-s3"
import {
  applyAuthoringChangeSet,
  ChangeSetError,
  compileAdventureSourceTree,
  createSourceFile,
  createSourceTree,
  InMemoryWikiAdventureSourceService,
  S3WikiAdventureSourceService,
  selectWikiAdventureSourceFiles,
} from "@/lib/wiki-adventures"

async function main() {
  const assetHost = "d20adventures-content.s3.us-east-1.amazonaws.com"
  const baseFiles = [
    {
      path: "content/settings/myr/adventures/the-old-road/adventure.md",
      content: `---
id: the-old-road
type: adventure
title: The Old Road
settingId: myr
startEncounter: gatehouse-entry
recommendedPlayers: 1
minPlayers: 1
maxPlayers: 4
premadeCharacters:
  - vala-apprentice
image: https://${assetHost}/content/settings/myr/adventures/the-old-road/assets/cover.jpg
---

## Teaser

A forgotten road leads toward Myr.

## Summary

The party reaches the gatehouse and negotiates entry.`,
    },
    {
      path: "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md",
      content: `---
id: gatehouse-entry
type: encounter
title: Gatehouse Entry
settingId: myr
adventureId: the-old-road
location: old-road-gatehouse
npcs:
  - captain-vala
image: https://${assetHost}/content/settings/myr/adventures/the-old-road/assets/encounters/gatehouse-entry.jpg
---

## Intro

The party reaches the old gatehouse.

## GM Notes

Captain Vala is worried, not hostile. Use [[npc:captain-vala]] and [[location:old-road-gatehouse]].

## Transitions

- To [[encounter:market-square-arrival|Peaceful Entry]] when the party gains entry.`,
    },
    {
      path: "content/settings/myr/adventures/the-old-road/encounters/market-square-arrival.md",
      content: `---
id: market-square-arrival
type: encounter
title: Market Square Arrival
settingId: myr
adventureId: the-old-road
---

## Intro

The market opens beyond the gate.`,
    },
    {
      path: "content/settings/myr/npcs/captain-vala.md",
      content: `---
id: captain-vala
type: npc
title: Captain Vala
settingId: myr
sheet: captain-vala.json
image: https://${assetHost}/content/settings/myr/assets/portraits/captain-vala.jpg
---

## Summary

A Gatewarden captain at [[location:old-road-gatehouse]].`,
    },
    {
      path: "content/settings/myr/npcs/captain-vala.json",
      content: JSON.stringify({
        id: "captain-vala",
        type: "npc",
        name: "Captain Vala",
        image: `https://${assetHost}/content/settings/myr/assets/portraits/captain-vala.jpg`,
        archetype: "Fighter",
        race: "Human",
        appearance: "Tired armor and an honest face.",
        healthPercent: 100,
        attributes: { strength: 12, wisdom: 13 },
      }),
    },
    {
      path: "content/settings/myr/locations/old-road-gatehouse.md",
      content: `---
id: old-road-gatehouse
type: location
title: Old Road Gatehouse
settingId: myr
image: https://${assetHost}/content/settings/myr/assets/locations/old-road-gatehouse.jpg
---

## Description

A repaired timber checkpoint linked to [[npc:captain-vala]].`,
    },
    {
      path: "content/settings/myr/adventures/the-old-road/characters/vala-apprentice.md",
      content: `---
id: vala-apprentice
type: premadeCharacter
title: Vala's Former Apprentice
settingId: myr
adventureId: the-old-road
sheet: vala-apprentice.json
---

## Summary

A premade character tied to Captain Vala.`,
    },
    {
      path: "content/settings/myr/adventures/the-old-road/characters/vala-apprentice.json",
      content: JSON.stringify({
        id: "vala-apprentice",
        type: "pc",
        name: "Vala's Former Apprentice",
        image: `https://${assetHost}/content/settings/myr/adventures/the-old-road/assets/characters/vala-apprentice.jpg`,
        archetype: "Rogue",
        race: "Human",
        appearance: "Quick hands and tired eyes.",
        healthPercent: 100,
        attributes: {
          strength: 8,
          dexterity: 15,
          constitution: 12,
          intelligence: 13,
          wisdom: 10,
          charisma: 14,
        },
        skills: ["Stealth", "Persuasion"],
        equipment: [{ name: "Lockpicks" }],
        spells: [],
        specialAbilities: ["Gatewarden routines"],
        effects: [],
      }),
    },
  ]

  const sourceFiles = baseFiles.map((file) => createSourceFile(file.path, file.content))
  const compiled = compileAdventureSourceTree(sourceFiles, {
    mode: "publish",
    contentVersion: "2026-05-21T22-30-00Z-ab12cd34",
    allowedAssetHosts: [assetHost],
  })

  assert.equal(compiled.validationReport.status, "passed")
  assert.equal(compiled.manifest.startEncounterId, "gatehouse-entry")
  assert.equal(Object.keys(compiled.encounters).length, 2)
  assert.equal(compiled.graph.encounterTransitions.length, 1)
  assert.equal(compiled.characterSheets.premadeCharacters["vala-apprentice"].sheet.attributes.dexterity, 15)
  assert.equal(compiled.characterSheets.npcs["captain-vala"].sheet.attributes?.wisdom, 13)

  const unresolved = sourceFiles.filter((file) => !file.path.endsWith("market-square-arrival.md"))
  const draftCompile = compileAdventureSourceTree(unresolved, {
    mode: "draftPreview",
    contentVersion: "draft",
    allowedAssetHosts: [assetHost],
  })
  assert.equal(draftCompile.validationReport.status, "passedWithWarnings")
  assert.equal(draftCompile.validationReport.findings.find((finding) => finding.code === "transition.target.missing")?.severity, "warning")

  const publishCompile = compileAdventureSourceTree(unresolved, {
    mode: "publish",
    contentVersion: "2026-05-21T22-30-00Z-ab12cd34",
    allowedAssetHosts: [assetHost],
  })
  assert.equal(publishCompile.validationReport.status, "blocked")
  assert.equal(publishCompile.validationReport.findings.find((finding) => finding.code === "transition.target.missing")?.severity, "error")

  const invalidSheet = sourceFiles.map((file) => (file.path.endsWith("vala-apprentice.json") ? createSourceFile(file.path, JSON.stringify({ id: "bad", type: "pc" })) : file))
  const invalidCompile = compileAdventureSourceTree(invalidSheet, {
    mode: "publish",
    contentVersion: "2026-05-21T22-30-00Z-ab12cd34",
    allowedAssetHosts: [assetHost],
  })
  assert.equal(
    invalidCompile.validationReport.findings.some((finding) => finding.code === "character.sheet.invalid"),
    true
  )

  const tree = createSourceTree([{ path: "content/settings/myr/adventures/the-old-road/encounters/test.md", content: "old" }])
  const current = tree.get("content/settings/myr/adventures/the-old-road/encounters/test.md")
  assert.ok(current)
  const changed = applyAuthoringChangeSet(tree, {
    id: "cs-1",
    intent: "test stale writes",
    source: "human",
    target: { settingId: "myr", planId: "the-old-road", draftId: "active" },
    changes: [{ op: "update", path: current.path, beforeHash: current.hash, content: "new" }],
    affectedEntities: [{ type: "encounter", id: "test" }],
    risks: [],
  })
  assert.equal(changed.get(current.path)?.content, "new")
  assert.throws(
    () =>
      applyAuthoringChangeSet(tree, {
        id: "cs-2",
        intent: "test stale rejection",
        source: "human",
        target: { settingId: "myr", planId: "the-old-road", draftId: "active" },
        changes: [{ op: "update", path: current.path, beforeHash: "stale", content: "bad" }],
        affectedEntities: [{ type: "encounter", id: "test" }],
        risks: [],
      }),
    ChangeSetError
  )

  const service = new InMemoryWikiAdventureSourceService([{ path: "content/settings/myr/adventures/the-old-road/adventure.md", content: "old" }])
  const serviceFile = await service.readFile("content/settings/myr/adventures/the-old-road/adventure.md")
  assert.ok(serviceFile)
  await service.writeApprovedChangeSet({
    id: "cs-3",
    intent: "service write",
    source: "human",
    target: { settingId: "myr", planId: "the-old-road", draftId: "active" },
    changes: [{ op: "update", path: serviceFile.path, beforeHash: serviceFile.hash, content: "new" }],
    affectedEntities: [{ type: "adventure", id: "the-old-road" }],
    risks: [],
  })
  assert.equal((await service.readFile(serviceFile.path))?.content, "new")

  const fakeObjects = new Map<string, string>([["content/settings/myr/adventures/the-old-road/adventure.md", "old"]])
  const fakeClient = {
    async send(command: { constructor: { name: string }; input: { Key: string; Body?: string | Uint8Array } }) {
      if (command.constructor.name === "GetObjectCommand") {
        const content = fakeObjects.get(command.input.Key)
        if (content === undefined) {
          const error = new Error("NoSuchKey")
          error.name = "NoSuchKey"
          throw error
        }
        return { Body: Readable.from([Buffer.from(content)]) }
      }
      if (command.constructor.name === "PutObjectCommand") {
        fakeObjects.set(command.input.Key, String(command.input.Body ?? ""))
        return {}
      }
      if (command.constructor.name === "DeleteObjectCommand") {
        fakeObjects.delete(command.input.Key)
        return {}
      }
      throw new Error(`Unexpected command ${command.constructor.name}`)
    },
  } as unknown as S3Client

  const s3Service = new S3WikiAdventureSourceService(fakeClient, "test-bucket")
  const s3File = await s3Service.readFile("content/settings/myr/adventures/the-old-road/adventure.md")
  assert.ok(s3File)
  await s3Service.writeApprovedChangeSet({
    id: "cs-4",
    intent: "mock s3 update",
    source: "human",
    target: { settingId: "myr", planId: "the-old-road", draftId: "active" },
    changes: [{ op: "update", path: s3File.path, beforeHash: s3File.hash, content: "new-from-s3-service" }],
    affectedEntities: [{ type: "adventure", id: "the-old-road" }],
    risks: [],
  })
  assert.equal(fakeObjects.get(s3File.path), "new-from-s3-service")
  await s3Service.writeApprovedChangeSet({
    id: "cs-5",
    intent: "mock s3 rename",
    source: "human",
    target: { settingId: "myr", planId: "the-old-road", draftId: "active" },
    changes: [
      { op: "rename", fromPath: s3File.path, toPath: "content/settings/myr/adventures/the-old-road/adventure-renamed.md", beforeHash: createSourceFile(s3File.path, "new-from-s3-service").hash },
    ],
    affectedEntities: [{ type: "adventure", id: "the-old-road" }],
    risks: [],
  })
  assert.equal(fakeObjects.has(s3File.path), false)
  assert.equal(fakeObjects.get("content/settings/myr/adventures/the-old-road/adventure-renamed.md"), "new-from-s3-service")

  // Source selection: prefer S3 only when it covers every expected local path.
  const localSet = [createSourceFile("a/adventure.md", "A"), createSourceFile("a/encounters/start.md", "S"), createSourceFile("a/characters/hero.json", "{}")]
  const completeRemote = [
    createSourceFile("a/adventure.md", "A2"),
    createSourceFile("a/encounters/start.md", "S2"),
    createSourceFile("a/characters/hero.json", "{ }"),
    createSourceFile("a/encounters/extra.md", "E"),
  ]
  const partialRemote = [createSourceFile("a/adventure.md", "A2")]

  const emptyPick = selectWikiAdventureSourceFiles(localSet, [])
  assert.equal(emptyPick.source, "local")

  const completePick = selectWikiAdventureSourceFiles(localSet, completeRemote)
  assert.equal(completePick.source, "s3")
  assert.equal(completePick.missingPaths.length, 0)
  assert.equal(completePick.files, completeRemote)

  const partialPick = selectWikiAdventureSourceFiles(localSet, partialRemote)
  assert.equal(partialPick.source, "local", "A partial S3 seed must fall back to repo-local source")
  assert.deepEqual(partialPick.missingPaths.sort(), ["a/characters/hero.json", "a/encounters/start.md"])
  assert.equal(partialPick.files, localSet)

  console.log("Batch A foundation checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
