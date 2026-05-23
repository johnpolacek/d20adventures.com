import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildLocalWikiTurnCharacters, isLocalWikiAdventure, isLocalWikiFinalEncounter, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "covert-cargo"

async function main() {
  const startAction = readFileSync("app/_actions/start-adventure.ts", "utf8")
  const createAction = readFileSync("app/_actions/create-adventure.ts", "utf8")
  const advanceAction = readFileSync("app/_actions/advance-turn.ts", "utf8")
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
  assert.equal(migrationReport.warnings.some((warning) => warning.code === "legacy-start-repaired"), true)
  assert.equal(migrationReport.warnings.some((warning) => warning.code === "legacy-transition-dropped"), true)

  const { artifacts, contentRef } = await loadWikiAdventureRuntime(SETTING_ID, PLAN_ID)
  assert.equal(contentRef.settingId, SETTING_ID)
  assert.equal(contentRef.planId, PLAN_ID)
  assert.equal(artifacts.validationReport.status, "passed")
  assert.equal(artifacts.manifest.startEncounterId, "the-shipment")
  assert.deepEqual(artifacts.manifest.premadeCharacterIds, ["1749159962941", "1749307435667"])
  assert.equal(Object.keys(artifacts.encounters).length, 9)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).length, 5)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).length, 2)
  assert.equal(artifacts.graph.encounterTransitions.some((transition) => transition.toEncounterId === ""), false)
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

  assert.equal(characters.some((character) => character.id === "1749159962941" && character.name === "Lyra Silvanus" && character.type === "pc"), true)
  assert.equal(characters.some((character) => character.id === "1749307435667" && character.name === "Poppen Quickfoot" && character.type === "pc"), true)

  console.log("Covert Cargo playthrough bridge checks passed")
}

main()
