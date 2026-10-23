import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { STOCK_FIGURES } from "../src/figures"
import { castIdFor, partyScene, portraitFor, sceneFor, spatialContext } from "../src/scenes"
import type { Packs } from "./game"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["the-road-to-kordavos"]
const who = (id: string, name: string, race: string, archetype: string, gender: string) => ({ id, name, race, archetype, gender, type: "pc" })

test("every Road to Kordavos encounter has a 3D scene, created heroes take the travellers' places, and the GM gets the road's places", () => {
  const heroes = [who("hero-aaaa1111", "Arin Vale", "Elf", "Ranger", "Female"), who("hero-bbbb2222", "Tobb Underbough", "Halfling", "Rogue", "Male")]
  const where: Record<string, RegExp> = {
    "well-met": /wayside shrine[\s\S]*the head of the caravan/,
    "the-fortune-teller": /crystal ball[\s\S]*Borina's table/,
    "the-gates-ahead": /end of the long line[\s\S]*the sergeant's post/,
  }
  const encounters = Object.values(pack.artifacts.encounters)
  assert.equal(encounters.length, 3)
  for (const encounter of encounters) {
    const authored = sceneFor(encounter.id)
    assert.ok(authored, `${encounter.id} has no scene`)
    const characters = [...buildLocalWikiTurnCharacters({ artifacts: pack.artifacts, encounter, players: [] }), ...heroes]
    assert.equal(characters.length - heroes.length, { "well-met": 3, "the-fortune-teller": 1, "the-gates-ahead": 0 }[encounter.id], encounter.id)
    const { staging } = partyScene(authored, characters)
    const ids = staging.cast.map((m) => m.id)
    // Two heroes take the first two places, and the third stock traveller leaves.
    assert.ok(ids.includes(heroes[0].id) && ids.includes(heroes[1].id), encounter.id)
    assert.ok(!ids.some((id) => id.startsWith("hero-") && !heroes.some((h) => h.id === id)), `${encounter.id}: ${ids.join(", ")}`)
    const arin = staging.cast.find((m) => m.id === heroes[0].id)!
    assert.deepEqual(arin.art, STOCK_FIGURES["elf-b"].art)
    for (const c of characters) {
      assert.ok(castIdFor(staging.cast, c), `${encounter.id}: ${c.name} has no figure`)
      if (c.type !== "pc") assert.match(portraitFor(sceneFor(encounter.id), c) ?? "", /^\/stage\/fixtures\/the-road-to-kordavos\/[a-z-]+-portrait\.jpg$/, c.name)
    }
    assert.match(spatialContext(encounter.id, characters, {}) ?? "", where[encounter.id], encounter.id)
  }
})
