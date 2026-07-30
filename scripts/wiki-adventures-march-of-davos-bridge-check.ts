import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildLocalWikiTurnCharacters, isLocalWikiAdventure, isLocalWikiFinalEncounter, loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import type { TurnCharacter } from "@/types/adventure"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "march-of-davos"

function main() {
  const migrationReport = JSON.parse(readFileSync("content/settings/realm-of-myr/adventures/march-of-davos/migration-report.json", "utf8")) as {
    warnings: Array<{ code: string }>
  }
  const adventureManifest = readFileSync("content/settings/realm-of-myr/adventures/march-of-davos/adventure.md", "utf8")
  const firstEncounter = readFileSync("content/settings/realm-of-myr/adventures/march-of-davos/encounters/the-gates-of-kordavos.md", "utf8")

  assert.equal(isLocalWikiAdventure(SETTING_ID, PLAN_ID), true)
  assert.ok(adventureManifest.includes('startEncounter: "the-gates-of-kordavos"'), "March of Davos manifest does not start at the-gates-of-kordavos")
  assert.equal(firstEncounter.includes("[[encounter:the-harvest-festival]]"), true, "First encounter does not infer a linear transition")
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "legacy-format-normalized"),
    true
  )
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "linear-transitions-inferred"),
    true
  )
  assert.equal(
    migrationReport.warnings.some((warning) => warning.code === "legacy-start-repaired"),
    true
  )

  const { artifacts, contentRef } = loadLocalWikiAdventureRuntime(SETTING_ID, PLAN_ID)
  assert.equal(contentRef.settingId, SETTING_ID)
  assert.equal(contentRef.planId, PLAN_ID)
  assert.equal(artifacts.validationReport.status, "passed")
  assert.equal(artifacts.manifest.startEncounterId, "the-gates-of-kordavos")
  assert.deepEqual(artifacts.manifest.premadeCharacterIds, ["branka-stoneveil", "milos-radan", "yeva-softstep", "cassia-verane", "wrenna-faelendar", "ilya-veles"])
  assert.equal(Object.keys(artifacts.encounters).length, 45)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).length, 35)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).length, 6)
  assert.equal(artifacts.graph.encounterTransitions.length, 57)
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === "the-gates-of-kordavos" && transition.toEncounterId === "the-harvest-festival"),
    true
  )
  assert.equal(isLocalWikiFinalEncounter(artifacts, "final-confrontation"), true)
  assert.equal(isLocalWikiFinalEncounter(artifacts, "the-gates-of-kordavos"), false)

  const savedCharacter: TurnCharacter = {
    id: "saved-fighter",
    name: "Saved Fighter",
    type: "pc",
    userId: "user_test",
    initiative: 0,
    hasReplied: false,
    isComplete: false,
    image: "https://d20-public.s3.us-east-1.amazonaws.com/images/test/saved-fighter.png",
    race: "Human",
    archetype: "Fighter",
    appearance: "A traveler ready for the March of Davos.",
    healthPercent: 100,
    attributes: {
      strength: 14,
      dexterity: 12,
      constitution: 13,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  }
  const characters = buildLocalWikiTurnCharacters({
    artifacts,
    encounter: artifacts.encounters[artifacts.manifest.startEncounterId],
    players: [
      { userId: "user_test", characterId: "saved-fighter" },
      // AI companion resolved from the compiled premade sheets by key tail,
      // carrying the owner's userId plus the controlledBy marker.
      { userId: "user_test", characterId: "characters/user_test/branka-stoneveil.json", controlledBy: "ai" },
    ],
    existingPlayerCharacters: [savedCharacter],
  })
  assert.equal(
    characters.some((character) => character.id === "saved-fighter" && character.name === "Saved Fighter" && character.type === "pc"),
    true
  )
  const companion = characters.find((character) => character.id === "branka-stoneveil")
  assert.ok(companion, "AI companion premade sheet did not resolve")
  assert.equal(companion.type, "pc")
  assert.equal(companion.type === "pc" && companion.userId, "user_test")
  assert.equal(companion.type === "pc" && companion.controlledBy, "ai")
  assert.equal(
    characters.some((character) => character.id === "garlan-ironfist" && character.type === "npc"),
    true
  )

  console.log("March of Davos playthrough bridge checks passed")
}

main()
