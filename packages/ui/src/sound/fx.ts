"use client"

import type { EffectEvent, Element, PropKind } from "@d20/stage"
import { audio, play, preload, whoosh } from "./engine"

// The stage's effects as sound: recorded takes for blades, blows, fire and spells (CC0, see public/stage/sounds/SOURCES.md),
// and made air for what has no recording, a flight or a swing that misses. All soft and short. Nothing pitched, so no
// effect ever chimes.

const takes = (cue: string, n: number) => Array.from({ length: n }, (_, i) => `/stage/sounds/fx/${cue}-${i + 1}.mp3`)
const FX = {
  blade: takes("blade", 3),
  hit: takes("hit", 3),
  thunk: takes("thunk", 3),
  fire: takes("fire", 3),
  spell: takes("spell", 2),
  cloth: takes("cloth", 3),
  coins: takes("coins", 2),
  key: takes("key", 1),
  book: takes("book", 1),
  draw: takes("draw", 1),
}
// The files are brought to one level (scripts/sound-assets.ts). This sets them under the dice.
const LEVEL = 0.28

export function preloadFx() {
  preload(Object.values(FX).flat())
}

// A missed swing, or a missile leaving the hand: air, no strike.
function swish(peak = 0.11, from = 2400, to = 700, length = 0.2) {
  const c = audio()
  if (c) whoosh(c, "fx", c.currentTime + 0.01, { peak, from, to, length })
}
// What an element adds to a spell landing. Fire has its recordings. Lightning crackles, frost hisses, and the rest are
// the recorded spell, pushed back for shadow.
function element(e: Element | undefined, gain: number) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.01
  if (e === "fire") return void play(FX.fire, "fx", { gain: gain * LEVEL })
  if (e === "lightning") {
    for (let i = 0; i < 4; i++) whoosh(c, "fx", t + i * 0.035 + Math.random() * 0.02, { peak: 0.1 * gain, from: 4200, to: 2600, length: 0.05, attack: 0.003, q: 0.8 })
    return
  }
  if (e === "frost") return void whoosh(c, "fx", t, { peak: 0.09 * gain, from: 5200, to: 3000, length: 0.45, attack: 0.03, q: 2 })
  void play(FX.spell, "fx", { gain: gain * LEVEL, muffle: e === "shadow" ? 900 : e === "nature" ? 2600 : undefined, rate: e === "shadow" ? 0.85 : 1 })
}

const PROPS: Partial<Record<PropKind, string[]>> = {
  pouch: FX.coins,
  coin: FX.coins,
  key: FX.key,
  book: FX.book,
  blade: FX.draw,
  scroll: FX.cloth,
  letter: FX.cloth,
  map: FX.cloth,
}

export function effectSound(e: EffectEvent) {
  if (e.type === "prop") return void play(PROPS[e.kind] ?? FX.cloth, "fx", { gain: 0.8 * LEVEL })
  const { kind, phase, struck } = e
  if (phase === "start") {
    switch (kind) {
      case "arrow":
        return swish(0.09, 2800, 900, 0.16)
      case "bolt":
        return swish(0.08, 1400, 500, 0.3)
      case "slash":
        if (!struck) return swish()
        void play(FX.blade, "fx", { gain: LEVEL })
        if (e.element) element(e.element, 0.5)
        return
      case "impact":
        if (!struck) return swish(0.12, 1600, 500, 0.22)
        void play(FX.hit, "fx", { gain: LEVEL, muffle: 3200 })
        if (e.element) element(e.element, 0.5)
        return
      case "beam":
      case "burst":
        return element(e.element, kind === "burst" ? 1 : 0.8)
      case "aura":
      case "mist": {
        const c = audio()
        if (c) whoosh(c, "fx", c.currentTime + 0.01, { peak: 0.14, from: 300, to: kind === "aura" ? 900 : 500, length: 1.1, attack: 0.5, q: 0.7 })
        return
      }
      case "sparkles": {
        const c = audio()
        if (c) whoosh(c, "fx", c.currentTime + 0.01, { peak: 0.07, from: 3200, to: 4200, length: 0.9, attack: 0.3, q: 1.5 })
        return
      }
    }
  }
  // A missile lands: on someone, a blow, or a spell's element. A miss strikes wood or stone, softer.
  if (kind === "arrow") return void play(struck ? FX.hit : FX.thunk, "fx", { gain: (struck ? 0.7 : 0.45) * LEVEL, muffle: struck ? 3000 : 2200 })
  element(e.element, struck ? 0.8 : 0.5)
}
