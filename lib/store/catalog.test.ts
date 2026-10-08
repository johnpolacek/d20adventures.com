import assert from "node:assert/strict"
import { test } from "node:test"
import { CATALOG, catalogEntry, libraryOf } from "./catalog"

test("catalog ids are unique and prices are whole cents", () => {
  assert.equal(new Set(CATALOG.map((entry) => entry.id)).size, CATALOG.length)
  for (const entry of CATALOG) {
    assert.ok(Number.isInteger(entry.priceCents) && entry.priceCents >= 0, entry.id)
    assert.equal(entry.free, entry.priceCents === 0, `${entry.id} is free exactly when its price is 0`)
  }
})

test("Stripe's 50 cent minimum holds for every paid adventure", () => {
  for (const entry of CATALOG.filter((e) => !e.free)) assert.ok(entry.priceCents >= 50, entry.id)
})

test("a crossed-out price appears only on free adventures", () => {
  for (const entry of CATALOG.filter((e) => e.listPriceCents !== undefined)) {
    assert.ok(entry.free, entry.id)
    assert.ok(Number.isInteger(entry.listPriceCents) && entry.listPriceCents! > 0, entry.id)
  }
})

test("library marks free and owned adventures and ignores unknown ids", () => {
  const catalog = [
    { id: "free", settingId: "s", priceCents: 0, free: true },
    { id: "paid", settingId: "s", priceCents: 500, free: false },
    { id: "bought", settingId: "s", priceCents: 500, free: false },
  ]
  const library = libraryOf(["bought", "not-for-sale"], catalog)
  assert.deepEqual(
    library.filter((entry) => entry.owned).map((entry) => entry.id),
    ["free", "bought"]
  )
  assert.equal(library.length, catalog.length)
})

test("catalogEntry finds known ids only", () => {
  assert.equal(catalogEntry("march-of-davos")?.listPriceCents, 500)
  assert.equal(catalogEntry("nope"), undefined)
})
