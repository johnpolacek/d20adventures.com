import assert from "node:assert/strict"
import { test } from "node:test"
import { inheritBrief, recolorPixels } from "./variant"

test("inheritBrief inherits base pipeline settings, keeps variant overrides, and drops nulled holds", () => {
  const base = {
    id: "caravan-guard-a",
    maker: "hi3d",
    height: 1.82,
    gloss: 0.5,
    cloak: true,
    borrowed: { Idle: "ual1:Idle" },
    holds: { what: "spear", hand: "R", length: 2.1 },
  }
  const variant = {
    id: "caravan-guard-b",
    variantOf: "caravan-guard-a",
    height: 1.72,
    holds: null,
  }
  const merged = inheritBrief<Record<string, unknown>>(variant, base)
  assert.equal(merged.maker, "hi3d")
  assert.equal(merged.height, 1.72)
  assert.equal(merged.gloss, 0.5)
  assert.equal(merged.cloak, true)
  assert.deepEqual(merged.borrowed, { Idle: "ual1:Idle" })
  assert.equal("holds" in merged, false)
})

test("recolorPixels shifts only the targeted hue band (including red wrap-around) while protecting skin, metal, and painted faces", () => {
  // 5 texels: crimson tunic, forest cloak, warm skin, bright steel metal, painted face (crimson lip on face mask).
  const pixels = new Uint8Array([
    180, 30, 35, // 0: crimson tunic (hue ~358)
    40, 120, 55, // 1: forest cloak (hue ~131)
    210, 165, 130, // 2: skin (hue ~26)
    180, 30, 35, // 3: red-tinted metal (metal = 220)
    180, 30, 35, // 4: painted face pixel (faceMask = 1)
  ])
  const metal = new Uint8Array([0, 0, 0, 220, 0])
  const faceMask = new Uint8Array([0, 0, 0, 0, 1])

  const touched = recolorPixels(pixels, 3, [{ hue: [340, 20], minSat: 0.2, shift: 140 }], metal, faceMask)
  assert.equal(touched, 1)
  // Texel 0 shifted from crimson (~358 deg) to green (~138 deg): green dominates.
  assert.ok(pixels[1] > pixels[0] && pixels[1] > pixels[2], `expected green, got ${[pixels[0], pixels[1], pixels[2]]}`)
  // Texels 1..4 untouched.
  assert.deepEqual([...pixels.slice(3, 6)], [40, 120, 55])
  assert.deepEqual([...pixels.slice(6, 9)], [210, 165, 130])
  assert.deepEqual([...pixels.slice(9, 12)], [180, 30, 35])
  assert.deepEqual([...pixels.slice(12, 15)], [180, 30, 35])
})

test("recolorPixels supports horse/creature coat recolouring with keepSkin: false and tint", () => {
  // Bay horse coat (warm brown, which would normally fall in skin hues).
  const coat = new Uint8Array([140, 82, 48])
  const touched = recolorPixels(coat, 3, [{ keepSkin: false, sat: 0.15, light: 1.45 }])
  assert.equal(touched, 1)
  // Pale dapple grey: brighter and nearly desaturated.
  assert.ok(coat[0] > 120 && Math.abs(coat[0] - coat[2]) < 25, `expected pale grey, got ${[...coat]}`)

  // Tinting a grey tunic toward dark forest green preserves mid luminance while taking the target hue.
  const grey = new Uint8Array([120, 120, 120])
  recolorPixels(grey, 3, [{ tint: "#2f6b3c", strength: 0.8 }])
  assert.ok(grey[1] > grey[0] && grey[1] > grey[2], `expected green tint, got ${[...grey]}`)
})
