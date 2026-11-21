"use client"

import type { BodyEvent, EffectEvent, Element, PropKind } from "@d20/stage"
import { audio, play, preload, whoosh } from "./engine"

// The stage's effects as sound: recorded takes for blades, blows, fire and spells (CC0, see public/stage/sounds/SOURCES.md),
// and made air for what has no recording, a flight or a swing that misses. All soft and short. Nothing pitched, so no
// effect ever chimes. A character's own body is heard as well: footfalls, a fall, a beast's growl (`bodySound`).

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
  step: takes("step", 5),
  growl: takes("growl", 3),
  hurt: takes("hurt", 2),
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

// What a character's body does, as sound. Each is sized to the one who makes it: someone big is lower, slower and a
// little louder, and anyone far from the camera is fainter. A person makes no sound of their own beyond their steps,
// their fall and their clothes. A beast growls as it comes on and as it strikes, and cries out when struck.
function bodySound(e: BodyEvent) {
  // 1 for someone of a person's height. The Owlbear is near 1.8.
  const size = Math.min(2.2, Math.max(0.6, e.height / 1.8))
  // Full within a few metres, half by nine, and never gone: the camera is often far from the one who acts.
  const far = 1 / (1 + (e.near / 9) ** 2)
  const level = LEVEL * (0.35 + 0.65 * far)
  const beast = e.voice === "beast"
  switch (e.act) {
    case "step": {
      // A creeping step is barely there, and a run lands harder.
      const tread = e.pace < 0.8 ? 0.4 : e.pace > 2 ? 1.2 : 0.8
      return void play(FX.step, "fx", { gain: 0.5 * tread * size * level, rate: 1 / Math.sqrt(size), vary: 0.08, muffle: 2400 / size })
    }
    case "fall":
      // The body lands a moment after it starts to go, with their clothes.
      void play(FX.hit, "fx", { gain: 0.8 * size * level, rate: 0.62 / Math.sqrt(size), muffle: 650, delay: 0.42 })
      return void play(FX.cloth, "fx", { gain: 0.5 * level, muffle: 2600, delay: 0.3 })
    case "crouch":
      return void play(FX.cloth, "fx", { gain: 0.45 * level, muffle: 2800 })
    case "dodge":
      return swish(0.05 * (0.35 + 0.65 * far), 1700, 600, 0.2)
    case "enter":
    case "strike":
      if (beast) void play(FX.growl, "fx", { gain: (e.act === "enter" ? 0.55 : 0.75) * level, rate: 0.9 / Math.sqrt(size), vary: 0.06, muffle: 1700 })
      return
    case "struck":
      if (beast) void play(FX.hurt, "fx", { gain: 0.6 * level, rate: 0.85 / Math.sqrt(size), vary: 0.06, muffle: 2000, delay: 0.06 })
      return
  }
}

export function effectSound(e: EffectEvent) {
  if (e.type === "body") return bodySound(e)
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
