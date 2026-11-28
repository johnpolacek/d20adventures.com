import { z } from "zod"
import { deg, idName, num, vec2 } from "./builders/types"
import { type StagingShot, stagingShot } from "./spec/staging"
import type { Stage } from "./stage"

// Beats: how a resolved turn plays out on the stage, in the set's vocabulary. Deterministic data (every player sees the same
// sequence), validated like any other spec because it will be generated per turn by a model (Stageview phase 4).
//
//   { shot: "party" }                    camera move to a named or inline shot (does not block; follow with a wait);
//                                        `duration` in seconds for a slower move (2.2 by default), `cut` for none
//   { move: "branka", to: "front1" }     walk to a mark or point (does not block unless wait: true)
//   { face: "garlan", to: "branka" }     turn toward a cast member, mark, point, or a heading in degrees
//   { line: "garlan", text: "Next!" }    a spoken line: bubble at the head and a portrait plate; blocks for its duration
//   { line: "gate-line", fromParty: -2, text }  a line from someone in a loop's queue (`group` counts from the front)
//   { narrate: 2 }                       the narrative paragraph being told; it holds the scene for its reading time (or
//                                        its audio, once voiced): the next paragraph, a spoken line and the end of the
//                                        beats wait for it, while shots, walks and waits carry on underneath
//   { wait: 1.5 }                        a pause in seconds
//   { cue: "gate-line:front" }           wait for a named moment (a loop bringing the party to the front); skip jumps to it
//   { loop: "gate-line", do: "release" } tell a loop the party is done (they pass and the line carries on); "stall" holds
//                                        the line after the exchange at the counter, "resume" lets it move again
const id = idName
export const beatSchema = z.union([
  z.object({ shot: z.union([id, stagingShot]), cut: z.boolean().optional(), duration: num(0.3, 20).optional() }).strict(),
  z.object({ move: id, to: z.union([id, vec2]), speed: num(0.3, 4).optional(), stop: num(0, 5).optional(), wait: z.boolean().optional() }).strict(),
  z.object({ face: id, to: z.union([id, vec2, deg]) }).strict(),
  z
    .object({
      line: id,
      text: z.string().min(1).max(400),
      duration: num(0.5, 20).optional(),
      group: z.number().int().min(0).max(200).optional(),
      fromParty: z.number().int().min(-50).max(50).optional(),
    })
    .strict(),
  z.object({ narrate: z.number().int().min(0).max(200) }).strict(),
  z.object({ wait: num(0, 30) }).strict(),
  z.object({ cue: z.string().min(1).max(80) }).strict(),
  z.object({ loop: id, do: z.enum(["release", "stall", "resume"]) }).strict(),
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
  // Step mode: the player is waiting for continue() (true), or has moved on (false).
  onWaiting?: (waiting: boolean) => void
}

/** Narrow Stage contract used by BeatPlayer (satisfied by `Stage`). */
export type BeatStage = Pick<
  Stage,
  | "activeShot"
  | "cast"
  | "loops"
  | "castAt"
  | "faceCast"
  | "finishMoves"
  | "finishShot"
  | "moveCast"
  | "placeCast"
  | "say"
  | "shot"
  | "skipLoops"
  | "waitCue"
>

/** Explicit playback phase of BeatPlayer. */
export type BeatPlaybackState =
  | { kind: "idle" }
  | { kind: "running"; index: number; credit: boolean }
  | { kind: "rushing"; index: number; credit: boolean }
  | { kind: "atGate"; index: number }
  | { kind: "skipping"; index: number; stopAt: number | null }
  | { kind: "jumping"; target: number }

// Reading time for a spoken line: long enough to read in a bubble, short enough to keep the scene moving.
export const lineSeconds = (text: string) => Math.min(9, 1.3 + text.length * 0.052)
// Reading time for a narrated paragraph, at about 170 words a minute while the scene plays.
export const readingSeconds = (text: string, wpm = 168) => 1.5 + text.trim().split(/\s+/).length / (wpm / 60)

// Where the scene stood when a paragraph began: the camera's shot, and the cast members the beats move or turn.
interface Mark {
  shot: string | StagingShot | null
  cast: { id: string; x: number; z: number; ry: number }[]
}

// Plays beats in order, one paragraph at a time. Two modes:
// - "auto": each paragraph and spoken line holds the scene for its reading time (or audio), then the beats carry on.
// - "step": each paragraph and each spoken line waits for continue(); camera moves, walks and waits still play out on
//   their own between them. continue() before the beats reach the wait hurries them there (waits and walks stop holding
//   them up, loops skip to their cue) and lets that one wait pass, so it always means "on to the next thing".
// Either way:
// - skip() finishes the sequence at once. Camera moves and walks jump to their ends and lines and waits are dropped;
//   the last paragraph is still reported, so the scene lands where the beats would leave it.
// - next() does the same up to the next paragraph.
// - back() and replay() return to the start of an earlier paragraph (or the first) and play on from there. The camera
//   and the cast the beats move are put back as they were then; a loop's crowd carries on, and cues it has already
//   given resolve at once.
// replay() also works after the beats have finished, to watch the turn again. play(beats, { append: true }) carries on
// with more beats after the last ones (the rest of a turn after a roll), keeping the earlier paragraphs to step back to.
export class BeatPlayer {
  private beats: Beat[] = []
  private state: BeatPlaybackState = { kind: "idle" }
  private runToken = 0
  private waiter: { resolve: () => void; cleanup?: () => void } | null = null
  private narrationEnds = 0
  private marks = new Map<number, Mark>()
  // Loop controls already given in this sequence: stepping back or replaying doesn't move the line again.
  private looped = new Set<number>()
  private actors: string[] = []
  private lastShot: string | StagingShot | null = null
  private section = -1
  private paragraphPending = false
  private _mode: "step" | "auto" = "auto"

  constructor(
    private stage: BeatStage,
    private hooks: BeatHooks = {}
  ) {}

  get playback(): BeatPlaybackState {
    return this.state
  }

  get playing(): boolean {
    return this.state.kind !== "idle"
  }

  get mode(): "step" | "auto" {
    return this._mode
  }

  set mode(next: "step" | "auto") {
    this.setMode(next)
  }

  /** Explicit mode transition: leaving step mode while at a gate releases the gate immediately. */
  setMode(next: "step" | "auto") {
    if (this._mode === next) return
    this._mode = next
    if (next === "auto" && this.state.kind === "atGate") {
      this.transition({ kind: "running", index: this.state.index, credit: false })
    } else if (next === "step" && this.state.kind === "running") {
      this.narrationEnds = 0
      this.cancelWaiter()
    }
  }

  // Leaving: what's left of this stretch is dropped (skipping to the end, or jumping back). Hurrying: nothing waits on a
  // timer, a walk or a cue either (also while rushing to the next step).
  private get isJumping() {
    return this.state.kind === "jumping"
  }

  private get leaving() {
    return this.state.kind === "skipping" || this.state.kind === "jumping"
  }

  private get hurrying() {
    return this.leaving || this.state.kind === "rushing"
  }

  private get currentIndex(): number {
    return this.state.kind === "idle" ? 0 : this.state.kind === "jumping" ? this.state.target : this.state.index
  }

  private cancelWaiter() {
    const w = this.waiter
    if (!w) return
    this.waiter = null
    w.cleanup?.()
    w.resolve()
  }

  private transition(next: BeatPlaybackState) {
    const prev = this.state
    this.state = next
    if (prev.kind === "atGate" && next.kind !== "atGate") {
      this.hooks.onWaiting?.(false)
    } else if (prev.kind !== "atGate" && next.kind === "atGate") {
      this.hooks.onWaiting?.(true)
    }
    if (next.kind === "idle" || next.kind === "skipping" || next.kind === "jumping" || next.kind === "rushing" || prev.kind === "atGate") {
      this.cancelWaiter()
    }
  }

  private sleep(seconds: number, token: number): Promise<void> {
    if (this.runToken !== token || this.hurrying || seconds <= 0) return Promise.resolve()
    this.cancelWaiter()
    return new Promise<void>((resolve) => {
      const done = () => {
        if (this.waiter?.resolve === done) this.waiter = null
        clearTimeout(t)
        resolve()
      }
      const t = setTimeout(done, seconds * 1000)
      this.waiter = { resolve: done, cleanup: () => clearTimeout(t) }
    })
  }

  // Waits for a walk or a cue, unless the player is asked to move on first.
  private orWake(p: Promise<void>, token: number): Promise<void> {
    if (this.runToken !== token || this.hurrying) return Promise.resolve()
    this.cancelWaiter()
    return new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        if (this.waiter?.resolve === done) this.waiter = null
        resolve()
      }
      this.waiter = { resolve: done }
      void p.then(done, done)
    })
  }

  // Waits until the paragraph being narrated has had its time (auto), or until the player continues past it (step).
  private narrated(token: number): Promise<void> {
    if (this.runToken !== token) return Promise.resolve()
    if (this._mode === "auto") return this.sleep((this.narrationEnds - performance.now()) / 1000, token)
    if (!this.paragraphPending) return Promise.resolve()
    this.paragraphPending = false
    return this.gate(token)
  }

  // Step mode: wait for continue(), unless one already came in while the beats were on their way here.
  private async gate(token: number) {
    if (this.runToken !== token || this.leaving) return
    const index = this.currentIndex
    const hasCredit = (this.state.kind === "running" || this.state.kind === "rushing") && this.state.credit
    if (hasCredit) {
      this.transition({ kind: "running", index, credit: false })
      return
    }
    this.transition({ kind: "atGate", index })
    await new Promise<void>((resolve) => {
      const done = () => {
        if (this.waiter?.resolve === done) this.waiter = null
        resolve()
      }
      this.waiter = { resolve: done }
    })
    if (this.runToken !== token) return
    if (this.state.kind === "atGate") {
      this.transition({ kind: "running", index, credit: false })
    }
  }

  // On to the next thing: past the paragraph or line being waited on (step), or to the next paragraph (auto).
  continue() {
    if (!this.playing) return
    if (this._mode === "auto") return this.next()
    if (this.state.kind === "atGate") {
      this.transition({ kind: "running", index: this.state.index, credit: false })
      return
    }
    if (this.state.kind === "running" || this.state.kind === "rushing") {
      this.transition({ kind: "rushing", index: this.state.index, credit: true })
    }
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

  /** Cancels any active run cleanly without starting a new one. */
  stop() {
    if (!this.playing) return
    this.runToken++
    this.transition({ kind: "idle" })
  }

  async play(input: Beat[], { append = false } = {}) {
    const more = beatsSchema.parse(input)
    // Cancel any in-flight run so overlapping play() calls never interleave.
    if (this.playing) {
      this.runToken++
      this.transition({ kind: "idle" })
    }
    const from = append ? this.beats.length : 0
    this.beats = append ? [...this.beats, ...more] : more
    const cast = new Set(this.stage.cast.map((c) => c.id))
    this.actors = [...new Set(this.beats.flatMap((b) => ("move" in b ? [b.move] : "face" in b ? [b.face] : [])))].filter((id) => cast.has(id))
    if (!append) {
      this.marks.clear()
      this.looped.clear()
      this.lastShot = this.stage.activeShot
      this.marks.set(0, this.snapshot())
    }
    return this.run(from)
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
    const index = this.currentIndex
    const n = this.beats.findIndex((b, j) => j > index && "narrate" in b)
    if (n < 0) return this.skip()
    this.narrationEnds = 0
    this.stage.finishShot()
    this.stage.finishMoves()
    this.transition({ kind: "skipping", index, stopAt: n })
  }

  skip() {
    if (!this.playing) return
    this.stage.finishShot()
    this.stage.finishMoves()
    this.transition({ kind: "skipping", index: this.currentIndex, stopAt: null })
  }

  private jump(i: number) {
    if (!this.playing) return
    this.narrationEnds = 0
    this.paragraphPending = false
    this.transition({ kind: "jumping", target: i })
  }

  private async run(from: number) {
    const token = ++this.runToken
    this.narrationEnds = 0
    this.paragraphPending = false
    this.transition({ kind: "running", index: from, credit: false })
    let i = from
    try {
      for (;;) {
        if (this.runToken !== token) return
        if (this.state.kind === "jumping") {
          i = this.state.target
          this.restore(i)
          this.transition({ kind: "running", index: i, credit: false })
        }
        if (i >= this.beats.length) {
          // The last paragraph still has its time (and can be stepped back from).
          await this.narrated(token)
          if (this.runToken !== token) return
          if (this.state.kind === "jumping") continue
          break
        }
        if (this.state.kind === "running" || this.state.kind === "rushing") {
          this.state = { ...this.state, index: i }
        } else if (this.state.kind === "skipping") {
          this.state = { ...this.state, index: i }
        }
        await this.step(this.beats[i], i, token)
        if (this.runToken !== token) return
        if (this.state.kind === "jumping") continue
        i++
      }
    } finally {
      if (this.runToken === token) {
        if (this.state.kind === "skipping") {
          this.stage.finishShot()
          this.stage.finishMoves()
        }
        this.transition({ kind: "idle" })
      }
    }
  }

  private async step(b: Beat, i: number, token: number) {
    if (this.runToken !== token) return
    const s = this.stage
    if ("shot" in b) {
      this.lastShot = b.shot
      s.shot(b.shot, { instant: this.state.kind === "skipping" || !!b.cut, duration: b.duration === undefined ? undefined : b.duration * 1000 })
    } else if ("move" in b) {
      const arrive = s.moveCast(b.move, b.to, { speed: b.speed, stop: b.stop })
      if (this.state.kind === "skipping") s.finishMoves()
      else if (b.wait) await this.orWake(arrive, token)
    } else if ("face" in b) s.faceCast(b.face, b.to)
    else if ("line" in b) {
      await this.narrated(token)
      if (this.runToken !== token || this.leaving) return
      const fromLoop = b.group !== undefined || b.fromParty !== undefined
      const speaker = fromLoop ? s.loops.get(b.line)?.speaker({ group: b.group, fromParty: b.fromParty }) : { castId: b.line }
      if (!speaker) return
      // In step mode a line stays up until the player continues (the caller clears it then).
      const step = this._mode === "step"
      const seconds = step ? 600 : (b.duration ?? (await this.hooks.lineSeconds?.(b.line, b.text)) ?? lineSeconds(b.text))
      if (this.runToken !== token || this.leaving) return
      s.say({ ...speaker, text: b.text, seconds })
      if ("castId" in speaker) this.hooks.onLine?.(speaker.castId, b.text, seconds)
      if (step) await this.gate(token)
      else await this.sleep(seconds, token)
    } else if ("narrate" in b) {
      if (this.state.kind === "skipping" && this.state.stopAt !== null && i >= this.state.stopAt) {
        this.transition({ kind: "running", index: i, credit: false })
      }
      await this.narrated(token)
      if (this.runToken !== token || this.isJumping) return
      if (!this.marks.has(i)) this.marks.set(i, this.snapshot())
      this.section = i
      this.hooks.onNarrate?.(b.narrate)
      if (this._mode === "step") this.paragraphPending = this.state.kind !== "skipping"
      else {
        const seconds = this.state.kind === "skipping" ? 0 : ((await this.hooks.narrationSeconds?.(b.narrate)) ?? 0)
        if (this.runToken !== token || this.isJumping) return
        this.narrationEnds = performance.now() + seconds * 1000
      }
    } else if ("wait" in b) await this.sleep(b.wait, token)
    else if ("cue" in b) {
      if (this.state.kind === "skipping" || this.state.kind === "rushing") s.skipLoops(b.cue)
      await this.orWake(s.waitCue(b.cue), token)
      if (this.runToken !== token) return
      if (this.state.kind === "skipping" || this.state.kind === "rushing") {
        s.skipLoops(b.cue)
        await s.waitCue(b.cue)
      }
    } else if ("loop" in b) {
      if (this.looped.has(i)) return
      this.looped.add(i)
      const loop = s.loops.get(b.loop)
      if (b.do === "release") loop?.release()
      else if (loop) loop.stalled = b.do === "stall"
    }
  }
}
