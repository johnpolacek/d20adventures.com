import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { stagingSpecSchema } from "@d20/stage/spec/staging"
import { PNG } from "pngjs"
import { type FigureArt, heroFigure, STOCK_FIGURES } from "../src/figures"
import { partyScene, portraitFor, SCENES } from "../src/scenes"
import { game, type Packs, transitionsOf } from "./game"
import { heroCommand } from "./heroes"
import { cutStandee, readArt, storeArt } from "./paint"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const offline: Llm = {
  generateText: async () => {
    throw new Error("offline")
  },
  generateObject: async () => {
    throw new Error("offline")
  },
}

// A green-screen sheet: two figures, an olive patch on the front, and a pocket of backdrop enclosed inside it.
function sheet() {
  const png = new PNG({ width: 400, height: 300 })
  const paint = (x0: number, y0: number, x1: number, y1: number, rgb: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) png.data.set([...rgb, 255], (y * 400 + x) * 4)
  }
  paint(0, 0, 400, 300, [20, 230, 30])
  paint(40, 20, 150, 280, [120, 80, 60])
  paint(60, 120, 90, 160, [110, 120, 60])
  paint(100, 120, 120, 160, [20, 230, 30])
  paint(250, 22, 360, 278, [90, 70, 50])
  return png
}
const at = (png: PNG, x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]

test("a painted sheet is keyed, split into front and back, and a portrait is cropped from the front", () => {
  const art = cutStandee(sheet(), "Human")
  const [front, back, portrait] = [PNG.sync.read(art.front), PNG.sync.read(art.back), PNG.sync.read(art.portrait)]
  // Each half is cropped to its figure with a small margin; the eroded edge costs a pixel.
  assert.ok(Math.abs(front.width - 120) <= 2 && Math.abs(front.height - 272) <= 2, `${front.width}x${front.height}`)
  assert.ok(Math.abs(back.width - 122) <= 2 && Math.abs(back.height - 268) <= 2, `${back.width}x${back.height}`)
  assert.equal(at(front, 0, 0)[3], 0)
  // The olive patch survives and the enclosed backdrop pocket is cleared.
  assert.equal(at(front, 6 + 75 - 40, 6 + 140 - 20)[3], 255)
  assert.deepEqual(at(front, 6 + 75 - 40, 6 + 140 - 20).slice(0, 3), [110, 120, 60])
  assert.equal(at(front, 6 + 110 - 40, 6 + 140 - 20)[3], 0)
  assert.equal(portrait.width, 512)
  assert.deepEqual(at(portrait, 0, 0).slice(0, 3), [0x3b, 0x42, 0x56])
  assert.throws(() => cutStandee(new PNG({ width: 100, height: 100, fill: true }), "Human"), /no figure/)
  const noise = new PNG({ width: 100, height: 100 })
  for (let i = 0; i < noise.data.length; i++) noise.data[i] = i % 4 === 3 ? 255 : (i * 7919) % 256
  assert.throws(() => cutStandee(noise, "Human"), /no clear background/)
})

test("painted art is stored by hero, read back as data URLs, and carried into a new game", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-paint-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    const sheetFor = (name: string) => ({
      name,
      race: "Human",
      archetype: "Fighter",
      gender: "Female",
      image: "",
      appearance: "Tall.",
      healthPercent: 100,
      type: "pc" as const,
      attributes: { strength: 12, dexterity: 12, constitution: 12, intelligence: 12, wisdom: 12, charisma: 12 },
      figure: "human-b",
    })
    await heroCommand({ kind: "saveHero", hero: sheetFor("Rosa Vell") }, store, packs, offline)
    const [rosa] = store.heroes()
    storeArt(dir, rosa.id, cutStandee(sheet(), "Human"))
    store.putHero({ ...rosa, painted: true })
    const files = { data: dir, scratch: dir }
    const { art } = await heroCommand({ kind: "art", ids: [rosa.id, "hero-none"] }, store, packs, offline, files)
    assert.deepEqual(Object.keys(art!), [rosa.id])
    assert.match(art![rosa.id].front, /^data:image\/png;base64,/)
    assert.deepEqual(readArt(dir, ["../../etc"]), {})
    await assert.rejects(() => heroCommand({ kind: "paintHero", provider: "grok", id: "hero-missing" }, store, packs, offline, files), /no longer in your roster/)

    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-road-to-kordavos", party: [{ id: rosa.id, ai: false }] })
    assert.deepEqual(store.state!.painted, [rosa.id])
    assert.deepEqual(store.state!.figures, { [rosa.id]: "human-b" })
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a painted hero stands as their art at the stock figure's height, and blob art passes the staging rules", () => {
  const painted: Record<string, FigureArt> = {
    "hero-aaaa1111": {
      front: "blob:tauri://localhost/0f1e2d3c-1111-2222-3333-444455556666",
      back: "blob:tauri://localhost/0f1e2d3c-1111-2222-3333-444455556667",
      portrait: "blob:tauri://localhost/0f1e2d3c-1111-2222-3333-444455556668",
    },
  }
  const hero = { id: "hero-aaaa1111", name: "Rosa Vell", race: "Human", archetype: "Fighter", gender: "Female", type: "pc" }
  const chosen = { [hero.id]: "human-b" }
  const figure = heroFigure(hero, chosen, painted)
  assert.equal(figure.height, STOCK_FIGURES["human-b"].height)
  assert.equal(figure.art, painted[hero.id])
  assert.equal(portraitFor(undefined, hero, chosen, painted), painted[hero.id].portrait)
  const { staging } = partyScene(SCENES["the-gates-of-kordavos"], [hero], chosen, painted)
  assert.equal(staging.cast.find((m) => m.id === hero.id)!.art.front, painted[hero.id].front)
  assert.doesNotThrow(() => stagingSpecSchema.parse(staging))
  const hostile = structuredClone(staging)
  hostile.cast.find((m) => m.id === hero.id)!.art.front = "https://example.com/x.png"
  assert.throws(() => stagingSpecSchema.parse(hostile))
})
