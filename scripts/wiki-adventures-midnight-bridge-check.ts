import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  buildMidnightTurnCharacters,
  isMidnightFinalEncounter,
  loadMidnightSummonsRuntime,
  MIDNIGHT_SUMMONS_PLAN_ID,
  MIDNIGHT_SUMMONS_SETTING_ID,
} from "@/lib/wiki-adventures/midnight-summons-runtime"

function main() {
  const startAction = readFileSync("app/_actions/start-adventure.ts", "utf8")
  const createAction = readFileSync("app/_actions/create-adventure.ts", "utf8")
  const advanceAction = readFileSync("app/_actions/advance-turn.ts", "utf8")

  assert.ok(createAction.includes("contentRef: localWikiRuntime?.contentRef"), "createAdventure does not pin local wiki contentRef")
  assert.ok(createAction.includes("currentEncounterId: localWikiRuntime?.artifacts.manifest.startEncounterId"), "createAdventure does not initialize currentEncounterId")
  assert.ok(createAction.includes("localWikiRuntime?.artifacts.characterSheets.premadeCharacters"), "createAdventure does not copy premade from migrated wiki sheet")
  assert.ok(startAction.includes("loadWikiAdventureRuntime"), "startAdventure does not load wiki runtime")
  assert.ok(startAction.includes("buildLocalWikiTurnCharacters"), "startAdventure does not build characters from wiki sheets")
  assert.ok(advanceAction.includes("buildWikiEncounterProgressionPrompt"), "advanceTurn does not use wiki gameplay prompt")
  assert.ok(advanceAction.includes("validatePacketTransition"), "advanceTurn does not validate wiki transitions")
  assert.ok(advanceAction.includes("commitWikiTurnAdvance"), "advanceTurn does not use guarded Convex commit")

  const { artifacts, contentRef } = loadMidnightSummonsRuntime()
  assert.equal(contentRef.settingId, MIDNIGHT_SUMMONS_SETTING_ID)
  assert.equal(contentRef.planId, MIDNIGHT_SUMMONS_PLAN_ID)
  assert.equal(artifacts.validationReport.status, "passed")
  assert.equal(artifacts.manifest.startEncounterId, "broken-silence")
  assert.equal(Object.keys(artifacts.encounters).length, 7)
  assert.equal(Object.keys(artifacts.characterSheets.premadeCharacters).includes("thalbern"), true)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).includes("wollandora"), true)
  assert.equal(Object.keys(artifacts.characterSheets.npcs).includes("owlbear"), true)
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.toEncounterId === "wollandora-intervention"),
    false
  )
  assert.equal(
    artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === "broken-silence" && transition.toEncounterId === "timely-rescue"),
    true
  )
  assert.equal(
    artifacts.graph.encounterTransitions.some(
      (transition) => transition.fromEncounterId === "broken-silence" && transition.toEncounterId === "owlbear-confrontation" && transition.condition.includes("detects the approaching creature")
    ),
    true
  )
  assert.equal(isMidnightFinalEncounter(artifacts, "preparing-for-the-city"), true)
  assert.equal(isMidnightFinalEncounter(artifacts, "back-home"), true)
  assert.equal(isMidnightFinalEncounter(artifacts, "meeting-at-the-stones"), false)

  const firstEncounter = artifacts.encounters[artifacts.manifest.startEncounterId]
  const characters = buildMidnightTurnCharacters({
    artifacts,
    encounter: firstEncounter,
    players: [{ userId: "user_test", characterId: "characters/user_test/thalbern.json" }],
  })
  assert.equal(characters.length, 1)
  assert.equal(characters[0].id, "thalbern")
  assert.equal(characters[0].type, "pc")
  assert.equal(characters[0].userId, "user_test")

  const owlbearCharacters = buildMidnightTurnCharacters({
    artifacts,
    encounter: artifacts.encounters["owlbear-confrontation"],
    players: [{ userId: "user_test", characterId: "thalbern" }],
  })
  assert.equal(
    owlbearCharacters.some((character) => character.id === "owlbear" && character.type === "npc"),
    true
  )

  console.log("The Midnight Summons playthrough bridge checks passed")
}

main()
