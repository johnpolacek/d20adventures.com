import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { keepPatchedPlayersAlive, keepPlayersAlive, MIN_PLAYER_HEALTH, pendingRescue } from "@d20/gm-core/wiki-adventures/player-safety"
import { assembleGameplayContextPacket, buildWikiEncounterProgressionPrompt } from "@d20/gm-core/wiki-adventures/runtime-context"
import { buildLocalWikiTurnCharacters, isLocalWikiAdventure, isLocalWikiFinalEncounter, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "covert-cargo"

async function main() {
  // The start action hands wiki adventures to lib/wiki-adventures/start.ts.
  const startAction = readFileSync("app/_actions/start-adventure.ts", "utf8") + readFileSync("lib/wiki-adventures/start.ts", "utf8")
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
  assert.deepEqual(artifacts.manifest.premadeCharacterIds, ["1749159962941", "1749307435667", "thalbern"])
  assert.deepEqual([artifacts.manifest.minPlayers, artifacts.manifest.maxPlayers], [3, 3])
  assert.equal(Object.keys(artifacts.encounters).length, 9)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).length, 5)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).length, 3)
  assert.equal(artifacts.characterSheets.premadeCharacters.thalbern.sheet.name, "Thalbern")
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

  // Three heroes: Thalbern plays, so nobody comes to the rescue. Heroes still cannot die.
  assert.equal(artifacts.manifest.playerDeath, false)
  assert.equal(artifacts.manifest.rescue, undefined)
  const premise = artifacts.manifest.premise ?? ""
  assert.match(premise, /^Lyra, Poppen and Thalbern have never met/)
  assert.match(premise, /Poppen and Thalbern do not know of each other/)
  assert.match(premise, /Once Silas hands over the payment they leave the boat/)
  // The two watchers stay strangers until a check passes, in every encounter at the pier.
  for (const id of ["the-shipment", "the-transaction", "the-fake", "the-disturbance", "battle-on-the-boat"])
    assert.match(artifacts.encounters[id].sections.gmNotes ?? "", /Perception check, DC 15/, id)
  assert.match(artifacts.encounters["the-shipment"].sections.intro ?? "", /Neither of them knew of the third watcher/)
  const hurt = (healthPercent: number) => [
    { type: "pc", healthPercent },
    { type: "pc", healthPercent: 100 },
    { type: "npc", healthPercent: 10 },
  ]
  assert.equal(pendingRescue({ artifacts, encounterId: "battle-on-the-boat", characters: hurt(20), playedEncounterIds: [] }), undefined, "no rescue is authored")
  // The rescue rule itself, on a copy that authors one: the fight leads to the crate when a hero is at half health.
  const rescued = structuredClone(artifacts)
  rescued.manifest.rescue = { encounterId: "the-crate", atHealthPercent: 50 }
  const rescueFrom = (encounterId: string, healthPercent: number, playedEncounterIds: string[] = []) =>
    pendingRescue({ artifacts: rescued, encounterId, characters: hurt(healthPercent), playedEncounterIds })
  assert.equal(rescueFrom("battle-on-the-boat", 50)?.toEncounterId, "the-crate")
  assert.equal(rescueFrom("battle-on-the-boat", 51), undefined, "the rescue waits for half health")
  assert.equal(rescueFrom("battle-on-the-boat", 20, ["the-crate"]), undefined, "the rescue plays once")
  assert.equal(rescueFrom("the-shipment", 20), undefined, "the rescue needs an authored transition")

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
  assert.deepEqual(packet.outputContract.allowedNextEncounterIds, ["battle-on-the-boat", "the-escape", "the-crate"])
  // With a rescue authored, the GM is never offered it.
  const rescuedPacket = assembleGameplayContextPacket({
    artifacts: rescued,
    contentRef,
    session: {
      adventureInstanceId: "a",
      currentTurnOrder: 1,
      currentTurn: { id: "t", adventureId: "a", encounterId: battle.id, title: battle.title, narrative: "", characters: battleCharacters },
      allTurns: [],
    },
  })
  assert.deepEqual(rescuedPacket.outputContract.allowedNextEncounterIds, ["battle-on-the-boat", "the-escape"], "the GM is never offered the rescue")
  assert.match(buildWikiEncounterProgressionPrompt(packet), /Perception check, DC 15/)
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
