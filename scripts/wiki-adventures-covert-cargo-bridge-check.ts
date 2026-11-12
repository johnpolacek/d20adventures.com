import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { conditionWords } from "@d20/gm-core/sheet/conditions"
import { killed, withDamage } from "@d20/gm-core/sheet/death"
import { pendingRescue } from "@d20/gm-core/wiki-adventures/player-safety"
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
  assert.equal(Object.keys(artifacts.encounters).length, 10)
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
  assert.match(artifacts.encounters["the-shipment"].sections.intro ?? "", /Neither knows of the third watcher/)
  const hurt = (hitPoints: number, dead?: true) => [
    { type: "pc", hitPoints, ...(dead ? { dead } : {}) },
    { type: "pc", hitPoints: 6 },
    { type: "npc", hitPoints: 0, dead: true as const },
  ]
  assert.equal(pendingRescue({ artifacts, encounterId: "battle-on-the-boat", characters: hurt(0), playedEncounterIds: [] }), undefined, "no rescue is authored")
  // The rescue rule itself, on a copy that authors one: the fight leads to the crate when a hero is at 0 and not dead.
  const rescued = structuredClone(artifacts)
  rescued.manifest.rescue = { encounterId: "the-crate" }
  const rescueFrom = (encounterId: string, hitPoints: number, playedEncounterIds: string[] = [], dead?: true) =>
    pendingRescue({ artifacts: rescued, encounterId, characters: hurt(hitPoints, dead), playedEncounterIds })
  assert.equal(rescueFrom("battle-on-the-boat", 0)?.toEncounterId, "the-crate")
  assert.equal(rescueFrom("battle-on-the-boat", 1), undefined, "the rescue waits for a hero at 0")
  assert.equal(rescueFrom("battle-on-the-boat", 0, [], true), undefined, "the dead are not rescued")
  assert.equal(rescueFrom("battle-on-the-boat", 0, ["the-crate"]), undefined, "the rescue plays once")
  assert.equal(rescueFrom("the-shipment", 0), undefined, "the rescue needs an authored transition")

  const battle = artifacts.encounters["battle-on-the-boat"]
  const battleCharacters = buildLocalWikiTurnCharacters({ artifacts, encounter: battle, players: [{ userId: "user_test", characterId: "1749159962941" }] })
  const packet = assembleGameplayContextPacket({
    artifacts,
    contentRef,
    session: {
      adventureInstanceId: "a",
      currentTurnOrder: 1,
      currentTurn: { id: "t", adventureId: "a", encounterId: battle.id, title: battle.title, story: [], characters: battleCharacters },
      allTurns: [],
    },
  })
  // The fight is written to end with Lyra in the river and the tug gone, and that way out is offered first.
  assert.deepEqual(packet.outputContract.allowedNextEncounterIds, ["battle-on-the-boat", "overboard", "the-crate", "the-escape"])
  assert.match(battle.sections.gmNotes ?? "", /throw her over the side into the river and cast off with the crate for Kordavos\. This is the most likely way the fight ends/)
  assert.deepEqual(artifacts.encounters.overboard.npcRefs, [])
  assert.deepEqual(
    artifacts.graph.encounterTransitions.filter((t) => t.fromEncounterId === "overboard").map((t) => t.toEncounterId),
    ["return-to-the-city", "the-end"]
  )
  // With a rescue authored, the GM is never offered it.
  const rescuedPacket = assembleGameplayContextPacket({
    artifacts: rescued,
    contentRef,
    session: {
      adventureInstanceId: "a",
      currentTurnOrder: 1,
      currentTurn: { id: "t", adventureId: "a", encounterId: battle.id, title: battle.title, story: [], characters: battleCharacters },
      allTurns: [],
    },
  })
  assert.deepEqual(rescuedPacket.outputContract.allowedNextEncounterIds, ["battle-on-the-boat", "overboard", "the-escape"], "the GM is never offered the rescue")
  assert.match(buildWikiEncounterProgressionPrompt(packet), /Perception check, DC 15/)
  assert.match(packet.currentEncounter.gmNotes ?? "", /cannot die/)

  // Lyra has 6 hit points. Player death is off here, so a blow that would kill her outright, 12 or more with 6 left
  // over, leaves her Stable at 0 instead. Where it is on, the same blow kills.
  const lyra = battleCharacters.find((c) => c.id === "1749159962941")
  assert.ok(lyra)
  const outright = withDamage(lyra, 12, { rules: artifacts.manifest })
  assert.deepEqual(
    [outright.character.hitPoints, outright.character.dead, conditionWords(outright.character).includes("Unconscious"), outright.character.deathSaves?.stable, outright.fate],
    [0, undefined, true, true, "stable"]
  )
  assert.deepEqual([killed(lyra, artifacts.manifest).dead, conditionWords(killed(lyra, artifacts.manifest)).includes("Unconscious")], [undefined, true])
  assert.equal(killed(lyra, {}).dead, true, "other adventures keep their deaths")

  console.log("Covert Cargo playthrough bridge checks passed")
}

main()
