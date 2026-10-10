import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { keepPatchedPlayersAlive, keepPlayersAlive, MIN_PLAYER_HEALTH, pendingRescue } from "@d20/gm-core/wiki-adventures/player-safety"
import { assembleGameplayContextPacket, buildWikiEncounterProgressionPrompt } from "@d20/gm-core/wiki-adventures/runtime-context"
import { buildLocalWikiTurnCharacters, isLocalWikiAdventure, isLocalWikiFinalEncounter, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "covert-cargo"

async function main() {
  const startAction = readFileSync("app/_actions/start-adventure.ts", "utf8")
  const createAction = readFileSync("app/_actions/create-adventure.ts", "utf8")
  const advanceAction = readFileSync("packages/gm-core/src/orchestration/advance-turn.ts", "utf8")
  const migrationReport = JSON.parse(readFileSync("content/settings/realm-of-myr/adventures/covert-cargo/migration-report.json", "utf8")) as {
    warnings: Array<{ code: string }>
  }
  const adventureManifest = readFileSync("content/settings/realm-of-myr/adventures/covert-cargo/adventure.md", "utf8")
  const shipmentEncounter = readFileSync("content/settings/realm-of-myr/adventures/covert-cargo/encounters/the-shipment.md", "utf8")

  assert.equal(isLocalWikiAdventure(SETTING_ID, PLAN_ID), true)
  assert.ok(createAction.includes("isLocalWikiAdventure"), "createAdventure does not detect local wiki adventures")
  assert.ok(createAction.includes("loadWikiAdventureRuntime"), "createAdventure does not load wiki runtime")
  assert.ok(startAction.includes("loadWikiAdventureRuntime"), "startAdventure does not load wiki runtime")
  assert.ok(startAction.includes("buildLocalWikiTurnCharacters"), "startAdventure does not build local wiki characters")
  assert.ok(advanceAction.includes("loadWikiAdventureRuntime"), "advanceTurn does not load wiki runtime")
  assert.ok(advanceAction.includes("isLocalWikiFinalEncounter"), "advanceTurn does not use generic wiki final-encounter detection")

  assert.ok(adventureManifest.includes('startEncounter: "the-shipment"'), "Covert Cargo manifest does not start at the-shipment")
  assert.ok(adventureManifest.includes('  - "1749159962941"'), "Lyra premade ID is not quoted as a string")
  assert.ok(adventureManifest.includes('  - "1749307435667"'), "Poppen premade ID is not quoted as a string")
  assert.equal(shipmentEncounter.includes("[[encounter:]]"), false, "Blank transition target was migrated into the-shipment")
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "legacy-start-repaired"),
    true
  )
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "legacy-transition-dropped"),
    true
  )

  const { artifacts, contentRef } = await loadWikiAdventureRuntime(SETTING_ID, PLAN_ID)
  assert.equal(contentRef.settingId, SETTING_ID)
  assert.equal(contentRef.planId, PLAN_ID)
  assert.equal(artifacts.validationReport.status, "passed")
  assert.equal(artifacts.manifest.startEncounterId, "the-shipment")
  assert.deepEqual(artifacts.manifest.premadeCharacterIds, ["1749159962941", "1749307435667"])
  assert.equal(Object.keys(artifacts.encounters).length, 10)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).length, 6)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).length, 2)
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.toEncounterId === ""),
    false
  )
  assert.equal(isLocalWikiFinalEncounter(artifacts, "return-to-the-city"), true)
  assert.equal(isLocalWikiFinalEncounter(artifacts, "the-end"), true)
  assert.equal(isLocalWikiFinalEncounter(artifacts, "the-shipment"), false)

  const firstEncounter = artifacts.encounters[artifacts.manifest.startEncounterId]
  const characters = buildLocalWikiTurnCharacters({
    artifacts,
    encounter: firstEncounter,
    players: [
      { userId: "user_test", characterId: "characters/user_test/1749159962941.json" },
      { userId: "user_test", characterId: "characters/user_test/1749307435667.json" },
    ],
  })

  assert.equal(
    characters.some((character) => character.id === "1749159962941" && character.name === "Lyra Silvanus" && character.type === "pc"),
    true
  )
  assert.equal(
    characters.some((character) => character.id === "1749307435667" && character.name === "Poppen Quickfoot" && character.type === "pc"),
    true
  )

  // The rescue: authored rules, Thalbern's encounter, and a transition only the core takes.
  assert.equal(artifacts.manifest.playerDeath, false)
  assert.deepEqual(artifacts.manifest.rescue, { encounterId: "the-ranger", atHealthPercent: 50 })
  assert.deepEqual(
    artifacts.encounters["the-ranger"].npcRefs.map((ref) => ref.id),
    ["thalbern-npc"]
  )
  assert.equal(artifacts.characterSheets.npcs["thalbern-npc"].sheet.name, "Thalbern")
  assert.equal(isLocalWikiFinalEncounter(artifacts, "the-ranger"), false)
  const hurt = (healthPercent: number) => [
    { type: "pc", healthPercent },
    { type: "pc", healthPercent: 100 },
    { type: "npc", healthPercent: 10 },
  ]
  const rescueFrom = (encounterId: string, healthPercent: number, playedEncounterIds: string[] = []) => pendingRescue({ artifacts, encounterId, characters: hurt(healthPercent), playedEncounterIds })
  assert.equal(rescueFrom("battle-on-the-boat", 50)?.toEncounterId, "the-ranger")
  assert.equal(rescueFrom("battle-on-the-boat", 51), undefined, "the rescue waits for half health")
  assert.equal(rescueFrom("battle-on-the-boat", 20, ["the-ranger"]), undefined, "the rescue plays once")
  assert.equal(rescueFrom("the-crate", 20), undefined, "the rescue needs an authored transition")
  for (const from of ["the-shipment", "the-transaction", "the-fake", "the-disturbance"]) assert.equal(rescueFrom(from, 30)?.toEncounterId, "the-ranger", from)

  const battle = artifacts.encounters["battle-on-the-boat"]
  const battleCharacters = buildLocalWikiTurnCharacters({ artifacts, encounter: battle, players: [{ userId: "user_test", characterId: "1749159962941" }] })
  const packet = assembleGameplayContextPacket({
    artifacts,
    contentRef,
    session: {
      adventureInstanceId: "a",
      currentTurnOrder: 1,
      currentTurn: { id: "t", adventureId: "a", encounterId: battle.id, title: battle.title, narrative: "", characters: battleCharacters },
      allTurns: [],
    },
  })
  assert.deepEqual(packet.outputContract.allowedNextEncounterIds, ["battle-on-the-boat", "the-fake", "the-escape", "the-crate"], "the GM is never offered the rescue")
  assert.equal(buildWikiEncounterProgressionPrompt(packet).includes("the-ranger"), false)
  assert.match(packet.currentEncounter.gmNotes ?? "", /cannot die/)

  const fallen = keepPlayersAlive(artifacts.manifest, [
    { type: "pc", healthPercent: 0, status: "Bleeding" },
    { type: "pc", healthPercent: 40, status: "Dead" },
    { type: "npc", healthPercent: 0, status: "dead" },
  ])
  assert.deepEqual(fallen, [
    { type: "pc", healthPercent: MIN_PLAYER_HEALTH, status: "Bleeding" },
    { type: "pc", healthPercent: 40, status: undefined },
    { type: "npc", healthPercent: 0, status: "dead" },
  ])
  assert.deepEqual(keepPatchedPlayersAlive(artifacts.manifest, [{ characterId: "1749159962941", healthPercent: 0, status: "dead" }], battleCharacters), [
    { characterId: "1749159962941", healthPercent: MIN_PLAYER_HEALTH },
  ])
  assert.equal(keepPlayersAlive({}, [{ type: "pc", healthPercent: 0 }])[0].healthPercent, 0, "other adventures keep their deaths")

  console.log("Covert Cargo playthrough bridge checks passed")
}

main()
