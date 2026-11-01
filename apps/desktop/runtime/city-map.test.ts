import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { cityContext, withCityContext } from "@d20/gm-core/citymap"
import type { Packs } from "./game"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["welcome-to-kordavos"]

test("the GM is told where each Welcome to Kordavos scene stands in Kordavos, which way its ways on lead, and no secrets", () => {
  const map = pack.cityMap
  assert.ok(map, "Welcome to Kordavos carries the Kordavos map")
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
  assert.match(withCityContext("staging", map, encounters, "the-harvest-festival") ?? "", /^staging\n\nMap of Kordavos/)
})

test("the GM is told where each Midnight Summons scene stands in the Valkarr woods", () => {
  const midnight = packs["the-midnight-summons"]
  const map = midnight.cityMap
  assert.ok(map, "The Midnight Summons carries the woods map")
  const { encounters } = midnight.artifacts
  for (const id of Object.keys(encounters)) assert.match(cityContext(map, encounters, id) ?? "", /- Here: /, id)
  const home = cityContext(map, encounters, "preparing-for-the-city") ?? ""
  assert.match(home, /^Map of The Valkarr Woods/)
  assert.match(home, /Here: Thalbern's Home\./)
  assert.match(cityContext(map, encounters, "owlbear-confrontation") ?? "", /The Old Standing Stones, east, about a mile/)
  assert.match(cityContext(map, encounters, "meeting-at-the-stones") ?? "", /Thalbern's Home, west, about 3 miles/)
})

test("the GM is told Covert Cargo's pier is three miles up the river from Kordavos", () => {
  const cargo = packs["covert-cargo"]
  assert.equal(cargo.cityMap?.id, "valkarr-woods")
  const pier = cityContext(cargo.cityMap!, cargo.artifacts.encounters, "the-shipment") ?? ""
  assert.match(pier, /Here: The Forest Pier\./)
  assert.match(pier, /Kordavos, west, about 3 miles/)
})
