import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildLocalWikiTurnCharacters, isLocalWikiAdventure, isLocalWikiFinalEncounter, loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import type { TurnCharacter } from "@/types/adventure"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "the-road-to-kordavos"

function main() {
  const createAction = readFileSync("app/_actions/create-adventure.ts", "utf8")
  const startAction = readFileSync("app/_actions/start-adventure.ts", "utf8")
  const advanceAction = readFileSync("app/_actions/advance-turn.ts", "utf8")
  const migrationReport = JSON.parse(readFileSync("content/settings/realm-of-myr/adventures/the-road-to-kordavos/migration-report.json", "utf8")) as {
    warnings: Array<{ code: string }>
  }
  const adventureManifest = readFileSync("content/settings/realm-of-myr/adventures/the-road-to-kordavos/adventure.md", "utf8")

  assert.equal(isLocalWikiAdventure(SETTING_ID, PLAN_ID), true)
  assert.ok(createAction.includes("normalizePlayerCharacterKey"), "createAdventure does not normalize saved character keys")
  assert.ok(startAction.includes("loadExistingPlayerCharacters"), "startAdventure does not load saved player characters for wiki starts")
  assert.ok(advanceAction.includes("existingPlayerCharacters"), "advanceTurn does not preserve saved player characters across wiki transitions")

  assert.ok(adventureManifest.includes('startEncounter: "well-met"'), "Road to Kordavos manifest does not start at well-met")
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "legacy-start-repaired"),
    true
  )

  const { artifacts, contentRef } = loadLocalWikiAdventureRuntime(SETTING_ID, PLAN_ID)
  assert.equal(contentRef.settingId, SETTING_ID)
  assert.equal(contentRef.planId, PLAN_ID)
  assert.equal(artifacts.validationReport.status, "passed")
  assert.equal(artifacts.manifest.startEncounterId, "well-met")
  assert.deepEqual(artifacts.manifest.premadeCharacterIds, [])
  assert.equal(Object.keys(artifacts.encounters).length, 3)
  // The player-reply roll path (resolveEncounterContent) reads encounter intro/instructions from
  // the wiki runtime for wiki adventures, so the start encounter must expose intro content here.
  const wellMet = artifacts.encounters["well-met"]
  assert.ok(wellMet, "well-met encounter missing from wiki runtime artifacts")
  assert.ok((wellMet.sections.intro ?? wellMet.sections.body ?? "").length > 0, "well-met must expose intro/body content for the reply roll path")
  assert.equal(Object.keys(artifacts.characterSheets.npcs).length, 4)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).length, 0)
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === "well-met" && transition.toEncounterId === "the-gates-ahead"),
    true
  )
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === "the-fortune-teller" && transition.toEncounterId === "the-gates-ahead"),
    true
  )
  assert.equal(isLocalWikiFinalEncounter(artifacts, "the-gates-ahead"), true)
  assert.equal(isLocalWikiFinalEncounter(artifacts, "well-met"), false)

  const savedCharacter: TurnCharacter = {
    id: "saved-ranger",
    name: "Saved Ranger",
    type: "pc",
    userId: "user_test",
    initiative: 0,
    hasReplied: false,
    isComplete: false,
    image: "https://d20-public.s3.us-east-1.amazonaws.com/images/test/saved-ranger.png",
    race: "Human",
    archetype: "Fighter",
    appearance: "A road-worn ranger with a green cloak.",
    healthPercent: 100,
    attributes: {
      strength: 12,
      dexterity: 12,
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  }
  const characters = buildLocalWikiTurnCharacters({
    artifacts,
    encounter: artifacts.encounters[artifacts.manifest.startEncounterId],
    players: [{ userId: "user_test", characterId: "saved-ranger" }],
    existingPlayerCharacters: [savedCharacter],
  })
  assert.equal(
    characters.some((character) => character.id === "saved-ranger" && character.name === "Saved Ranger" && character.type === "pc"),
    true
  )

  console.log("The Road to Kordavos playthrough bridge checks passed")
}

main()
