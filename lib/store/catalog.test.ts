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

test("the desktop build bundles every catalog adventure, or only the free ones for a store build", async () => {
  const { readFile } = await import("node:fs/promises")
  const build = await readFile(new URL("../../apps/desktop/scripts/build-runtime.ts", import.meta.url), "utf8")
  const list = (name: string) => JSON.parse(build.match(new RegExp(`const ${name} = (\\[.*\\])`))?.[1] ?? "[]") as string[]
  assert.deepEqual(list("ALL").sort(), CATALOG.map((e) => e.id).sort())
  assert.deepEqual(
    list("FREE").sort(),
    CATALOG.filter((e) => e.free)
      .map((e) => e.id)
      .sort()
  )
})

test("library marks free and owned adventures and ignores unknown ids", () => {
  const library = libraryOf(["covert-cargo", "not-for-sale"])
  assert.deepEqual(
    library.filter((entry) => entry.owned).map((entry) => entry.id),
    ["the-midnight-summons", "covert-cargo"]
  )
  assert.equal(library.length, CATALOG.length)
})

test("catalogEntry finds known ids only", () => {
  assert.equal(catalogEntry("march-of-davos")?.priceCents, 500)
  assert.equal(catalogEntry("nope"), undefined)
})
