import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { cityContext, withCityContext } from "@d20/gm-core/citymap"
import type { Packs } from "./game"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["march-of-davos"]

test("the GM is told where each March of Davos scene stands in Kordavos, which way its ways on lead, and no secrets", () => {
  const map = pack.cityMap
  assert.ok(map, "March of Davos carries the Kordavos map")
  const { encounters } = pack.artifacts
  for (const id of Object.keys(encounters)) assert.match(cityContext(map, encounters, id) ?? "", /- Here: /, id)

  const festival = cityContext(map, encounters, "the-harvest-festival") ?? ""
  assert.match(festival, /Here: The Harvest Square, in Gate Ward/)
  assert.match(festival, /The Dragonbone Inn, east, a short walk/)
  assert.match(festival, /The Gates of Kordavos, south/)
  // Secrets of the story stay out of Nearby until the party gets there.
  assert.doesNotMatch(festival, /Ambush Lane|Silverhand's Hideout|Black Market/)

  assert.match(cityContext(map, encounters, "the-silver-serpent-tavern") ?? "", /Ways on: Arrival at the Docks at The Quay, south-west/)
  const labyrinth = cityContext(map, encounters, "through-the-labyrinth") ?? ""
  assert.match(labyrinth, /Here: The Labyrinth, underground, beneath The Asterian Quarter/)
  assert.match(labyrinth, /Back up the tunnel: The Powder Chamber[\s\S]*On down the tunnel: The Sealed Door/)
  assert.doesNotMatch(labyrinth, /Nearby/)

  // Staging and city share one block, and a pack with no map leaves the staging as it was.
  assert.equal(withCityContext("staging", undefined, encounters, "the-harvest-festival"), "staging")
  assert.match(withCityContext("staging", map, encounters, "the-harvest-festival") ?? "", /^staging\n\nCity map of Kordavos/)
})
