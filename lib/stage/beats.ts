import { z } from "zod"
import { deg, matName, num, vec2 } from "./builders/types"
import { type StagingShot, stagingShot } from "./spec/staging"
import type { Stage } from "./stage"

// Beats: how a resolved turn plays out on the stage, in the set's vocabulary. Deterministic data (every player sees the same
// sequence), validated like any other spec because it will be generated per turn by a model (Stageview phase 4).
//
//   { shot: "party" }                    camera move to a named or inline shot (does not block; follow with a wait)
//   { move: "branka", to: "front1" }     walk to a mark or point (does not block unless wait: true)
//   { face: "garlan", to: "branka" }     turn toward a cast member, mark, point, or a heading in degrees
//   { line: "garlan", text: "Next!" }    a spoken line: bubble at the head and a portrait plate; blocks for its duration
//   { narrate: 2 }                       the narrative paragraph being told; it holds the scene for its reading time (or
//                                        its audio, once voiced): the next paragraph, a spoken line and the end of the
//                                        beats wait for it, while shots, walks and waits carry on underneath
//   { wait: 1.5 }                        a pause in seconds
//   { cue: "gate-line:front" }           wait for a named moment (a loop bringing the party to the front); skip jumps to it
//   { loop: "gate-line", do: "release" } tell a loop the party is done (they pass and the line carries on)
const id = matName
export const beatSchema = z.union([
  z.object({ shot: z.union([id, stagingShot]), cut: z.boolean().optional() }).strict(),
  z.object({ move: id, to: z.union([id, vec2]), speed: num(0.3, 4).optional(), wait: z.boolean().optional() }).strict(),
  z.object({ face: id, to: z.union([id, vec2, deg]) }).strict(),
  z.object({ line: id, text: z.string().min(1).max(400), duration: num(0.5, 20).optional() }).strict(),
  z.object({ narrate: z.number().int().min(0).max(200) }).strict(),
  z.object({ wait: num(0, 30) }).strict(),
  z.object({ cue: z.string().min(1).max(80) }).strict(),
  z.object({ loop: id, do: z.enum(["release"]) }).strict(),
])
export type Beat = z.infer<typeof beatSchema>
export const beatsSchema = z.array(beatSchema).max(200)

export interface BeatHooks {
  onLine?: (castId: string, text: string, seconds: number) => void
  onNarrate?: (paragraph: number) => void
  // How long a paragraph holds the scene, in seconds: its reading time, or its audio's length when it is voiced.
  narrationSeconds?: (paragraph: number) => number | Promise<number>
  // How long a spoken line stays up (default lineSeconds; its audio's length when voiced).
  lineSeconds?: (castId: string, text: string) => number | Promise<number>
}

// Reading time for a spoken line: long enough to read in a bubble, short enough to keep the scene moving.
export const lineSeconds = (text: string) => Math.min(9, 1.3 + text.length * 0.052)
// Reading time for a narrated paragraph, at about 170 words a minute while the scene plays.
export const readingSeconds = (text: string) => 1.5 + text.trim().split(/\s+/).length / 2.8

// Where the scene stood when a paragraph began: the camera's shot, and the cast members the beats move or turn.
interface Mark {
  shot: string | StagingShot | null
  cast: { id: string; x: number; z: number; ry: number }[]
}

// Plays beats in order, one paragraph at a time.
// - skip() finishes the sequence at once. Camera moves and walks jump to their ends and lines and waits are dropped;
//   the last paragraph is still reported, so the scene lands where the beats would leave it.
// - next() does the same up to the next paragraph.
// - back() and replay() return to the start of an earlier paragraph (or the first) and play on from there. The camera
//   and the cast the beats move are put back as they were then; a loop's crowd carries on, and cues it has already
//   given resolve at once.
// replay() also works after the beats have finished, to watch the turn again.
export class BeatPlayer {
  private beats: Beat[] = []
  private skipping = false
  private stopAt: number | null = null
  private jumpTo: number | null = null
  private wake: (() => void) | null = null
  private narrationEnds = 0
  private marks = new Map<number, Mark>()
  private actors: string[] = []
  private lastShot: string | StagingShot | null = null
  private index = 0
  private section = -1
  playing = false

  constructor(
    private stage: Stage,
    private hooks: BeatHooks = {}
  ) {}

  private get hurrying() {
    return this.skipping || this.jumpTo !== null
  }

  private sleep(seconds: number) {
    if (this.hurrying || seconds <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, seconds * 1000)
      function done() {
        clearTimeout(t)
        resolve()
      }
      this.wake = done
    })
  }

  // Waits for a walk or a cue, unless the player is asked to move on first.
  private orWake(p: Promise<void>) {
    if (this.hurrying) return Promise.resolve()
    return Promise.race([p, new Promise<void>((r) => (this.wake = r))])
  }

  // Waits until the paragraph being narrated has had its time.
  private narrated() {
    return this.sleep((this.narrationEnds - performance.now()) / 1000)
  }

  private snapshot(): Mark {
    return {
      shot: this.lastShot,
      cast: this.actors.map((id) => {
        const p = this.stage.castAt(id)
        return { id, x: p.x, z: p.z, ry: p.ry }
      }),
    }
  }

  private restore(i: number) {
    const s = this.stage
    s.finishMoves()
    const m = this.marks.get(i)
    if (!m) return
    for (const c of m.cast) s.placeCast(c.id, [c.x, c.z], (c.ry * 180) / Math.PI)
    if (m.shot) {
      this.lastShot = m.shot
      s.shot(m.shot)
    }
  }

  async play(input: Beat[]) {
    this.beats = beatsSchema.parse(input)
    const cast = new Set(this.stage.cast.map((c) => c.id))
    this.actors = [...new Set(this.beats.flatMap((b) => ("move" in b ? [b.move] : "face" in b ? [b.face] : [])))].filter((id) => cast.has(id))
    this.marks.clear()
    this.lastShot = this.stage.activeShot
    this.marks.set(0, this.snapshot())
    return this.run(0)
  }

  // Watch the beats again from the start: during play it jumps back; afterwards it plays them through once more.
  replay() {
    if (this.playing) {
      this.jump(0)
      return Promise.resolve()
    }
    if (!this.beats.length) return Promise.resolve()
    this.restore(0)
    return this.run(0)
  }

  // Back to the start of the previous paragraph (the first paragraph restarts itself).
  back() {
    const starts = [...this.marks.keys()].filter((i) => i > 0 || "narrate" in (this.beats[0] ?? {})).sort((a, b) => a - b)
    const earlier = starts.filter((i) => i < this.section)
    this.jump(earlier.length ? earlier[earlier.length - 1] : (starts[0] ?? 0))
  }

  // On to the next paragraph now (the last one finishes the beats).
  next() {
    if (!this.playing) return
    const n = this.beats.findIndex((b, j) => j > this.index && "narrate" in b)
    if (n < 0) return this.skip()
    this.stopAt = n
    this.narrationEnds = 0
    this.skipping = true
    this.stage.finishShot()
    this.stage.finishMoves()
    this.wake?.()
  }

  skip() {
    if (!this.playing) return
    this.stopAt = null
    this.skipping = true
    this.stage.finishShot()
    this.stage.finishMoves()
    this.wake?.()
  }

  private jump(i: number) {
    if (!this.playing) return
    this.jumpTo = i
    this.skipping = false
    this.stopAt = null
    this.narrationEnds = 0
    this.wake?.()
  }

  private async run(from: number) {
    this.playing = true
    this.skipping = false
    this.stopAt = null
    this.jumpTo = null
    this.narrationEnds = 0
    let i = from
    try {
      for (;;) {
        if (this.jumpTo !== null) {
          i = this.jumpTo
          this.jumpTo = null
          this.restore(i)
        }
        if (i >= this.beats.length) {
          // The last paragraph still has its time (and can be stepped back from).
          await this.narrated()
          if (this.jumpTo !== null) continue
          break
        }
        this.index = i
        await this.step(this.beats[i], i)
        i++
      }
    } finally {
      if (this.skipping) {
        this.stage.finishShot()
        this.stage.finishMoves()
      }
      this.playing = false
      this.skipping = false
      this.stopAt = null
      this.jumpTo = null
    }
  }

  private async step(b: Beat, i: number) {
    const s = this.stage
    if ("shot" in b) {
      this.lastShot = b.shot
      s.shot(b.shot, { instant: this.skipping || !!b.cut })
    } else if ("move" in b) {
      const arrive = s.moveCast(b.move, b.to, { speed: b.speed })
      if (this.skipping) s.finishMoves()
      else if (b.wait) await this.orWake(arrive)
    } else if ("face" in b) s.faceCast(b.face, b.to)
    else if ("line" in b) {
      await this.narrated()
      if (this.hurrying) return
      const seconds = b.duration ?? (await this.hooks.lineSeconds?.(b.line, b.text)) ?? lineSeconds(b.text)
      s.say({ castId: b.line, text: b.text, seconds })
      this.hooks.onLine?.(b.line, b.text, seconds)
      await this.sleep(seconds)
    } else if ("narrate" in b) {
      if (this.stopAt !== null && i >= this.stopAt) {
        this.skipping = false
        this.stopAt = null
      }
      await this.narrated()
      if (this.jumpTo !== null) return
      if (!this.marks.has(i)) this.marks.set(i, this.snapshot())
      this.section = i
      this.hooks.onNarrate?.(b.narrate)
      const seconds = this.skipping ? 0 : ((await this.hooks.narrationSeconds?.(b.narrate)) ?? 0)
      this.narrationEnds = performance.now() + seconds * 1000
    } else if ("wait" in b) await this.sleep(b.wait)
    else if ("cue" in b) {
      if (this.skipping) s.skipLoops()
      await this.orWake(s.waitCue(b.cue))
      if (this.skipping) {
        s.skipLoops()
        await s.waitCue(b.cue)
      }
    } else if ("loop" in b) s.loops.get(b.loop)?.release()
  }
}
