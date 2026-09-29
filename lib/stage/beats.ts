import { z } from "zod"
import { deg, matName, num, vec2 } from "./builders/types"
import { stagingShot } from "./spec/staging"
import type { Stage } from "./stage"

// Beats: how a resolved turn plays out on the stage, in the set's vocabulary. Deterministic data (every player sees the same
// sequence), validated like any other spec because it will be generated per turn by a model (Stageview phase 4).
//
//   { shot: "party" }                    camera move to a named or inline shot (does not block; follow with a wait)
//   { move: "branka", to: "front1" }     walk to a mark or point (does not block unless wait: true)
//   { face: "garlan", to: "branka" }     turn toward a cast member, mark, point, or a heading in degrees
//   { line: "garlan", text: "Next!" }    a spoken line: bubble at the head and a portrait plate; blocks for its duration
//   { narrate: 2 }                       the narrative paragraph being told (the panel highlights it; TTS will sync here)
//   { wait: 1.5 }                        a pause in seconds
const id = matName
export const beatSchema = z.union([
  z.object({ shot: z.union([id, stagingShot]), cut: z.boolean().optional() }).strict(),
  z.object({ move: id, to: z.union([id, vec2]), speed: num(0.3, 4).optional(), wait: z.boolean().optional() }).strict(),
  z.object({ face: id, to: z.union([id, vec2, deg]) }).strict(),
  z.object({ line: id, text: z.string().min(1).max(400), duration: num(0.5, 20).optional() }).strict(),
  z.object({ narrate: z.number().int().min(0).max(200) }).strict(),
  z.object({ wait: num(0, 30) }).strict(),
])
export type Beat = z.infer<typeof beatSchema>
export const beatsSchema = z.array(beatSchema).max(200)

export interface BeatHooks {
  onLine?: (castId: string, text: string, seconds: number) => void
  onNarrate?: (paragraph: number) => void
}

// Reading time for a spoken line: long enough to read in a bubble, short enough to keep the scene moving.
export const lineSeconds = (text: string) => Math.min(9, 1.3 + text.length * 0.052)

// Plays beats in order. skip() finishes the sequence at once: camera moves and walks jump to their ends, lines and
// waits are dropped, and the last narrated paragraph is still reported, so the scene lands where the beats would leave it.
export class BeatPlayer {
  private skipping = false
  private wake: (() => void) | null = null
  playing = false

  constructor(
    private stage: Stage,
    private hooks: BeatHooks = {}
  ) {}

  private sleep(seconds: number) {
    if (this.skipping || seconds <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, seconds * 1000)
      function done() {
        clearTimeout(t)
        resolve()
      }
      this.wake = done
    })
  }

  async play(input: Beat[]) {
    const beats = beatsSchema.parse(input)
    this.skipping = false
    this.playing = true
    const s = this.stage
    try {
      for (const b of beats) {
        if ("shot" in b) s.shot(b.shot, { instant: this.skipping || !!b.cut })
        else if ("move" in b) {
          const arrive = s.moveCast(b.move, b.to, { speed: b.speed })
          if (this.skipping) s.finishMoves()
          else if (b.wait) await Promise.race([arrive, new Promise<void>((r) => (this.wake = r))])
        } else if ("face" in b) s.faceCast(b.face, b.to)
        else if ("line" in b) {
          if (this.skipping) continue
          const seconds = b.duration ?? lineSeconds(b.text)
          this.hooks.onLine?.(b.line, b.text, seconds)
          await this.sleep(seconds)
        } else if ("narrate" in b) this.hooks.onNarrate?.(b.narrate)
        else if ("wait" in b) await this.sleep(b.wait)
      }
    } finally {
      if (this.skipping) {
        s.finishShot()
        s.finishMoves()
      }
      this.playing = false
      this.skipping = false
    }
  }

  skip() {
    if (!this.playing) return
    this.skipping = true
    this.stage.finishShot()
    this.stage.finishMoves()
    this.wake?.()
  }
}
