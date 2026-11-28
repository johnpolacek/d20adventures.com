import { isHidden } from "@d20/gm-core/sheet/conditions"
import { metres } from "@d20/gm-core/sheet/space"
import type { ObjectKind, Ready, StoryBeat } from "@d20/gm-core/story/beats"
import { isDead, isDown } from "@d20/gm-core/utils/turn-actors"
import type { SoundCue, Stage } from "@d20/stage"
import { compose, speakerShot, type ComposeContext, type Take } from "@d20/stage/director"

type PlannedTake = Parameters<typeof compose>[0]
import type { StagingShot } from "@d20/stage/spec/staging"
import { castIdFor } from "./scenes"

// Explicit stage choreography controller owned per Stage instance.
// Consolidates entrances, exits/falls, hero-down falls, weapons/props/FX/sounds,
// strolls, engine walks, and camera framing behind explicit CameraPhase and
// per-cast ActorChoreographyState machines with AbortController cancellation.

export const PACE = { walk: 1.2, hurry: 2.4, sprint: 4.5, sneak: 0.8 } as const
export const STROLL = 0.6
export const PROWL = 0.5
export const REVEAL_BEAT = 1400
export const FALL_DELAY = 1500
export const ESTABLISH_HOLD = 4000
const SETTLE = { push: 0.07, rise: 0.12, seconds: 9 }

export type Aim = { pair: [string, string] } | { place: string } | { subject: string }
export type View = Aim | null

export type CameraPhase =
  | { phase: "unframed" }
  | { phase: "preview" }
  | { phase: "establish_hold"; at: string; until: number }
  | { phase: "paragraph"; turnId: string | undefined; paragraph: number; sig: string | null }
  | { phase: "actor"; actorId: string }
  | { phase: "manual"; targetId: string | null }

export type ActorChoreographyState =
  | { kind: "idle"; atKey: string | null }
  | { kind: "entering"; key: string; atKey: string | null; abort: AbortController }
  | { kind: "strolling"; atKey: string | null; abort: AbortController }
  | { kind: "walking"; atKey: string; abort: AbortController }
  | { kind: "exiting"; atKey: string | null; abort: AbortController }
  | { kind: "falling"; atKey: string | null; abort: AbortController }

export type EntranceCue = {
  cast: string
  from: string | [number, number]
  when?: string
  shot?: string
  speed: number
  sneak: boolean
  here: boolean
  at: number
  s: number
}

export type ExitCue = {
  run: boolean
  to?: string | [number, number]
  via?: (string | [number, number])[]
  lands?: string | [number, number]
  shot?: string
  speed: number
  sneak?: boolean
  at: number
  s: number
}

export type WalkCue = {
  cast: string
  from: string | [number, number]
  via?: (string | [number, number])[]
  speed: number
  sneak: boolean
  at: number
  s: number
}

export type SpotInfo = {
  character: string
  at: [number, number]
  walked?: true
  teleport?: true
  pace?: keyof typeof PACE
}

export type StagedEffectEntry = {
  key: string
  beat: Extract<StoryBeat, { kind: "action" }>
  effect: boolean
  miss: boolean
  outcome?: "crit" | "fumble"
  using?: string
  s: number
}

export type SoundedEntry = {
  key: string
  cue: SoundCue
  actor?: string
  s: number
}

export type ChoreographyCharacter = {
  id: string
  name: string
  type: "pc" | "npc"
  hitPoints?: number
  maxHitPoints?: number
  dead?: boolean
  fled?: boolean
  conditions?: readonly unknown[]
  position?: { x: number; y: number }
  rollRequired?: { rollType?: string } | null
  deathSaves?: { successes: number; failures: number }
}

export type ChoreographyParagraph = {
  text: string
  beats: StoryBeat[]
}

export type ChoreographySnapshot = {
  turnId: string | undefined
  shown: { adventureId: string; encounterId: string; characters: ChoreographyCharacter[] } | undefined
  isSameTurnAsShown: boolean
  priorCharacters: ChoreographyCharacter[] | undefined
  reading: boolean
  paragraph: number
  started: boolean
  heard: number
  holding: boolean
  actorId: string | undefined
  actorCastId: string | undefined
  ringedCastId: string | null
  openingAt: number
  heroes: string[]
  text: string[]
  paragraphs: ChoreographyParagraph[]
  beatsView: View
  lead: string | undefined
  plan: PlannedTake | null
  spots: Map<string, SpotInfo>
  cues: EntranceCue[]
  arriving: EntranceCue | undefined
  exits: Map<string, ExitCue>
  departing: ExitCue | undefined
  walks: WalkCue[]
  staged: Map<number, StagedEffectEntry[]>
  sounded: Map<number, SoundedEntry[]>
  readied: string
  inHand: string
  castOf: (characterId: string | undefined) => string | undefined
}

export type ChoreographerCallbacks = {
  onProwlingChange: (key: string, active: boolean) => void
  onHandedOver: () => void
  onActiveShotChange: (shot: string | null) => void
  onError: (message: string) => void
  logShot?: (turnId: string | undefined, paragraph: number, label: string, cut: boolean) => void
  traceLine?: (line: string) => void
  traceShot?: (
    stage: ChoreographerStage,
    paragraph: number,
    which: unknown,
    take: Take | null,
    cast: readonly { id: string; x: number; z: number; height: number }[],
    words?: string
  ) => void
}

/** Narrow structural interface over `Stage` so `StageChoreographer` is testable without WebGL. */
export type ChoreographerStage = Pick<
  Stage,
  | "activeShot"
  | "cast"
  | "loops"
  | "set"
  | "staging"
  | "shots"
  | "castAt"
  | "circleOn"
  | "effect"
  | "faceCast"
  | "isDown"
  | "isLow"
  | "isOnStage"
  | "keepObject"
  | "moveCast"
  | "onShotChange"
  | "placeCast"
  | "point"
  | "prop"
  | "reach"
  | "readyWeapon"
  | "route"
  | "sees"
  | "setDown"
  | "setLow"
  | "setOnStage"
  | "setTurn"
  | "shot"
  | "shotSettled"
  | "sound"
>

export function entrancePace(pace: "prowl" | "stroll" | keyof typeof PACE | undefined): number | undefined {
  return pace === "prowl" ? PROWL : pace === "stroll" ? STROLL : pace ? PACE[pace] : undefined
}

const keptLow = (c: ChoreographyCharacter) => isHidden(c as never) || c.rollRequired?.rollType === "Hide (Stealth)"

function alive(shot: StagingShot | string, turn: number): StagingShot | string {
  if (typeof shot === "string" || "orbit" in shot) return shot
  const way = turn % 2 ? -1 : 1
  return { ...shot, orbit: way * 2.5, sweep: 10 }
}

/** A way off for someone who leaves with no exit of their own. */
export function wayOff(stage: ChoreographerStage, id: string, heroes: string[]): [number, number] | null {
  const me = stage.castAt(id)
  const party = heroes.filter((h) => h !== id && stage.isOnStage(h)).map((h) => stage.castAt(h))
  const cx = party.reduce((n, c) => n + c.x, 0) / Math.max(1, party.length)
  const cz = party.reduce((n, c) => n + c.z, 0) / Math.max(1, party.length)
  const away = party.length && Math.hypot(me.x - cx, me.z - cz) > 0.1 ? Math.atan2(me.x - cx, me.z - cz) : me.ry
  for (const off of [0, 30, -30, 60, -60, 90, -90, 135, -135]) {
    const a = away + (off * Math.PI) / 180
    const hit = stage.reach(id, { x: me.x + Math.sin(a) * 10, z: me.z + Math.cos(a) * 10 }, 10)
    if (hit.distance >= 6) return [hit.x, hit.z]
  }
  return null
}

/** The shot for an aim, framed on where everyone stands now. */
export function shotFor(stage: ChoreographerStage, aim: Aim, heroes: string[]): StagingShot | string | null {
  const on = (id: string, shot: { distance: number; angle: number; height: number; lookHeight: number; fov: number }) => {
    const c = stage.cast.find((m) => m.id === id)
    return c ? speakerShot(c, shot) : { subject: id, ...shot }
  }
  if ("subject" in aim) return on(aim.subject, { distance: 4.5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  if ("pair" in aim) {
    const [actor, target] = aim.pair
    const both = Object.entries(stage.staging?.shots ?? {}).find(([, shot]) => "subjects" in shot && shot.subjects.includes(actor) && shot.subjects.includes(target))
    if (both) return both[0]
    const a = stage.castAt(actor)
    const b = stage.castAt(target)
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    const dx = (b.x - a.x) / Math.max(d, 0.001)
    const dz = (b.z - a.z) / Math.max(d, 0.001)
    const cam = { x: a.x - dx * 2.4 + dz * 0.9, z: a.z - dz * 2.4 - dx * 0.9 }
    if (d > 0.3 && d < 14 && a.height <= 2.2 && !stage.reach(actor, cam, 4).short)
      return { position: [cam.x, a.y + 1.9, cam.z], target: [a.x + dx * d * 0.6, a.y + (b.y - a.y) * 0.6 + 1.2, a.z + dz * d * 0.6], fov: 48 }
    return on(target, { distance: 6, angle: 25, height: 1.8, lookHeight: 1.2, fov: 48 })
  }
  const mark = stage.set.marks[aim.place]
  if (!mark) return null
  const onStage = stage.cast.filter((c) => stage.isOnStage(c.id))
  const party = onStage.some((c) => heroes.includes(c.id)) ? onStage.filter((c) => heroes.includes(c.id)) : onStage
  const px = party.reduce((n, c) => n + c.x, 0) / Math.max(1, party.length)
  const pz = party.reduce((n, c) => n + c.z, 0) / Math.max(1, party.length)
  const [mx, mz] = mark.at
  const d = Math.hypot(px - mx, pz - mz) || 1
  if (d < 2.5 && party.some((c) => heroes.includes(c.id))) {
    const ids = party.map((c) => c.id)
    const authored = Object.entries(stage.staging?.shots ?? {}).find(([, shot]) => "subjects" in shot && ids.every((id) => shot.subjects.includes(id)))
    return authored ? authored[0] : { subjects: ids, offset: [0, 1.7, 4.5], target: [0, 1.1, 0], relative: "facing", fov: 46 }
  }
  const cam = { x: px + ((px - mx) / d) * 3, z: pz + ((pz - mz) / d) * 3 }
  const hero = party[0]
  if (!hero || !stage.reach(hero.id, cam, 6).short) return { position: [cam.x, 2, cam.z], target: [mx, 1, mz], fov: 50 }
  const near = Object.entries(stage.shots).sort(([, p], [, q]) => Math.hypot(p.target[0] - mx, p.target[2] - mz) - Math.hypot(q.target[0] - mx, q.target[2] - mz))[0]
  return near?.[0] ?? null
}

function waitAbortable(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve(true)
    }, Math.max(0, ms))
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export class StageChoreographer {
  private disposed = false
  private cameraPhase: CameraPhase = { phase: "unframed" }
  private hasFramedLive = false
  private lastShotSig: string | null = null
  private lastActorFrameKey: string | null = null
  private establishAbort: AbortController | null = null
  private unsubShot: () => void

  private actors = new Map<string, ActorChoreographyState>()
  private entered = new Set<string>()
  private ran = new Set<string>()
  private strolled = new Set<string>()
  private heroFalls = new Map<string, AbortController>()

  private encounterKey: string | null = null
  private pendingJump: { turnId: string; where: "start" | "end" } | null = null
  private pendingReframeTurnId: string | null = null

  private played = new Set<string>()
  private handedOver = new WeakSet<StoryBeat>()
  private showingKey = ""
  private fxAbort: AbortController | null = null

  private lastReadied: string | null = null
  private lastInHand: string | null = null
  private lastTurnRing: string | null | undefined = undefined

  private latest: ChoreographySnapshot | null = null
  private timers: { establishMs: number; revealMs: number; fallMs: number; fxSettleMs: number }

  constructor(
    private readonly stage: ChoreographerStage,
    private readonly callbacks: ChoreographerCallbacks,
    opts?: { initialTurnId?: string; timers?: Partial<{ establishMs: number; revealMs: number; fallMs: number; fxSettleMs: number }> }
  ) {
    this.timers = {
      establishMs: opts?.timers?.establishMs ?? ESTABLISH_HOLD,
      revealMs: opts?.timers?.revealMs ?? REVEAL_BEAT,
      fallMs: opts?.timers?.fallMs ?? FALL_DELAY,
      fxSettleMs: opts?.timers?.fxSettleMs ?? 2600,
    }
    for (const loop of stage.loops.values()) loop.paused = true
    callbacks.logShot?.(opts?.initialTurnId, -1, `new stage, opening ${stage.staging?.shot ?? "none"}`, true)
    if (stage.staging?.shot) stage.shot(stage.staging.shot, { instant: true })
    callbacks.onActiveShotChange(stage.activeShot)
    this.unsubShot = stage.onShotChange((shot) => {
      if (!this.disposed) callbacks.onActiveShotChange(shot)
    })
  }

  get camera(): CameraPhase {
    return this.cameraPhase
  }

  actorState(castId: string): ActorChoreographyState {
    return this.actors.get(castId) ?? { kind: "idle", atKey: null }
  }

  hasHandedOver(beat: StoryBeat): boolean {
    return this.handedOver.has(beat)
  }

  /** Marks a round jump so the next sync places actors immediately and reframes unframed paragraphs. */
  requestRoundJump(turnId: string, where: "start" | "end") {
    this.pendingJump = { turnId, where }
    this.pendingReframeTurnId = turnId
  }

  /** Clears the cached paragraph shot signature so replaying the turn plays its opening take again. */
  clearReplayShot() {
    this.lastShotSig = null
  }

  /**
   * Focuses a clicked character on stage.
   * Returns `true` when the camera moved to focus them, or `false` if they were already focused (caller opens their sheet).
   */
  focusCharacter(characterId: string, castId: string | null | undefined): boolean {
    if (this.disposed || !castId) return false
    if (this.cameraPhase.phase === "manual" && this.cameraPhase.targetId === characterId) return false
    this.cancelEstablishHold()
    const member = this.stage.cast.find((c) => c.id === castId)
    const shot = { distance: 4, angle: 18, height: 1.6, lookHeight: 1.1, fov: 40 }
    this.stage.shot(member ? speakerShot(member, shot) : { subject: castId, ...shot })
    this.cameraPhase = { phase: "manual", targetId: characterId }
    return true
  }

  /** Switches to a named view manually (toolbar or number hotkey). */
  selectShot(viewId: string) {
    if (this.disposed) return
    this.cancelEstablishHold()
    this.stage.shot(viewId)
    this.cameraPhase = { phase: "manual", targetId: null }
  }

  /** Synchronizes every stage choreography subsystem from the current render snapshot. */
  sync(snap: ChoreographySnapshot) {
    if (this.disposed) return
    this.latest = snap

    this.syncTurnRing(snap.ringedCastId)
    this.syncEquipment(snap.readied, snap.inHand)
    this.syncEntrances(snap)
    this.syncExits(snap)
    this.syncHeroDown(snap)
    this.syncStrolls(snap)
    this.syncPositions(snap)
    this.syncCamera(snap)
    this.syncEffects(snap)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.unsubShot()
    this.cancelEstablishHold()
    this.fxAbort?.abort()
    this.fxAbort = null
    for (const state of this.actors.values()) {
      if (state.kind !== "idle") state.abort.abort()
    }
    this.actors.clear()
    for (const abort of this.heroFalls.values()) abort.abort()
    this.heroFalls.clear()
    this.entered.clear()
    this.ran.clear()
    this.strolled.clear()
    this.played.clear()
  }

  private atKeyOf(castId: string): string | null {
    return this.actors.get(castId)?.atKey ?? null
  }

  private setActor(castId: string, next: ActorChoreographyState) {
    const prev = this.actors.get(castId)
    if (prev && prev.kind !== "idle" && (next.kind === "idle" || prev.abort !== next.abort)) {
      prev.abort.abort()
    }
    this.actors.set(castId, next)
  }

  private abortActor(castId: string, nextAtKey?: string | null) {
    const prev = this.actors.get(castId)
    const atKey = nextAtKey !== undefined ? nextAtKey : (prev?.atKey ?? null)
    if (prev && prev.kind !== "idle") prev.abort.abort()
    this.actors.set(castId, { kind: "idle", atKey })
  }

  private cancelEstablishHold() {
    this.establishAbort?.abort()
    this.establishAbort = null
  }

  private reached(snap: ChoreographySnapshot, at: number, s: number): boolean {
    return snap.reading && snap.paragraph === at && snap.heard >= s
  }

  private toCome(snap: ChoreographySnapshot, at: number, s: number): boolean {
    return snap.reading && at >= 0 && (snap.paragraph < at || (snap.paragraph === at && snap.heard < s))
  }

  private syncTurnRing(ringedCastId: string | null) {
    if (this.lastTurnRing === ringedCastId) return
    this.lastTurnRing = ringedCastId
    this.stage.setTurn(ringedCastId)
  }

  private syncEquipment(readied: string, inHand: string) {
    if (this.lastReadied !== readied) {
      this.lastReadied = readied
      const kept = new Map<string, Ready>(readied ? JSON.parse(readied) : [])
      for (const c of this.stage.cast) {
        const what = kept.get(c.id)
        this.stage.readyWeapon(c.id, what === "bow" || what === "blade" ? what : null)
      }
    }
    if (this.lastInHand !== inHand) {
      this.lastInHand = inHand
      const hands = new Map<string, ObjectKind>(inHand ? JSON.parse(inHand) : [])
      for (const c of this.stage.cast) this.stage.keepObject(c.id, hands.get(c.id) ?? null)
    }
  }

  private syncEntrances(snap: ChoreographySnapshot) {
    const spot = (at: string | number[] | undefined) => (typeof at === "string" ? this.stage.set.marks[at]?.at : at) as [number, number] | undefined
    for (const e of snap.cues) {
      const home = this.stage.staging?.cast.find((c) => c.id === e.cast)
      const to = snap.spots.get(e.cast)?.at ?? spot(home?.at)
      const from = spot(e.from)
      if (!home || !to || !from) continue
      const key = `${e.cast}:${e.at}`
      if (this.toCome(snap, e.at, e.s)) {
        this.entered.delete(key)
        const cur = this.actors.get(e.cast)
        if (cur?.kind === "entering" && cur.key === key) this.abortActor(e.cast)
        this.callbacks.onProwlingChange(key, false)
        this.stage.placeCast(e.cast, from, e.here ? home.facing : undefined)
        this.stage.setOnStage(e.cast, e.here)
      } else if (this.reached(snap, e.at, e.s) && !this.entered.has(key)) {
        this.entered.add(key)
        const abort = new AbortController()
        this.setActor(e.cast, { kind: "entering", key, atKey: this.atKeyOf(e.cast), abort })
        this.stage.placeCast(e.cast, from, to)
        this.stage.setOnStage(e.cast, true)
        const prowl = e.speed <= PROWL
        if (prowl) {
          this.callbacks.onProwlingChange(key, true)
          const seconds = Math.hypot(to[0] - from[0], to[1] - from[1]) / e.speed + this.timers.revealMs / 1000 + 3
          void waitAbortable(seconds * 1000, abort.signal).then((ok) => {
            if (ok && !this.disposed) this.callbacks.onProwlingChange(key, false)
          })
        }
        void (async () => {
          if (e.shot || prowl) {
            const ok = await waitAbortable(this.timers.revealMs, abort.signal)
            if (!ok || this.disposed) {
              this.callbacks.onProwlingChange(key, false)
              return
            }
          }
          if (abort.signal.aborted || this.disposed || !this.entered.has(key)) {
            this.callbacks.onProwlingChange(key, false)
            return
          }
          await this.stage.moveCast(e.cast, to, { speed: e.speed, pace: e.sneak ? "sneak" : undefined })
          if (abort.signal.aborted || this.disposed) return
          this.stage.faceCast(e.cast, home.facing)
          this.callbacks.onProwlingChange(key, false)
          if (this.actors.get(e.cast)?.kind === "entering") {
            this.actors.set(e.cast, { kind: "idle", atKey: this.atKeyOf(e.cast) })
          }
        })()
      } else if (!this.stage.isOnStage(e.cast)) {
        this.stage.setOnStage(e.cast, true)
        this.stage.placeCast(e.cast, to, home.facing)
      }
    }
  }

  private syncExits(snap: ChoreographySnapshot) {
    // Cancel any falling timer for cast members no longer in exits.
    for (const [id, state] of this.actors) {
      if (state.kind === "falling" && !snap.exits.has(id)) this.abortActor(id)
    }
    for (const [id, e] of snap.exits) {
      const home = this.stage.staging?.cast.find((c) => c.id === id)
      if (this.toCome(snap, e.at, e.s)) {
        const at = snap.spots.get(id)?.at ?? home?.at
        const cur = this.actors.get(id)
        if (cur && (cur.kind === "exiting" || cur.kind === "falling")) this.abortActor(id)
        if ((this.ran.delete(id) || this.stage.isDown(id)) && at) this.stage.placeCast(id, at, home?.facing)
        this.stage.setOnStage(id, true)
        this.stage.setDown(id, false)
      } else if (!e.run) {
        if (!this.reached(snap, e.at, e.s)) {
          if (this.actors.get(id)?.kind === "falling") this.abortActor(id)
          this.stage.setDown(id, true, true, e.lands)
        } else if (!this.stage.isDown(id) && this.actors.get(id)?.kind !== "falling") {
          const abort = new AbortController()
          this.setActor(id, { kind: "falling", atKey: this.atKeyOf(id), abort })
          void waitAbortable(this.timers.fallMs, abort.signal).then((ok) => {
            if (!ok || this.disposed) return
            this.stage.setDown(id, true, false, e.lands)
            if (this.actors.get(id)?.kind === "falling") {
              this.actors.set(id, { kind: "idle", atKey: this.atKeyOf(id) })
            }
          })
        }
      } else if (this.stage.isOnStage(id) && !this.ran.has(id)) {
        this.ran.add(id)
        const to = e.to ?? (this.reached(snap, e.at, e.s) ? wayOff(this.stage, id, snap.heroes) : null)
        if (!(this.reached(snap, e.at, e.s) && to)) {
          this.stage.setOnStage(id, false)
        } else {
          const legs = [...(e.via ?? []), to].map((leg) => this.stage.point(leg))
          const abort = new AbortController()
          this.setActor(id, { kind: "exiting", atKey: this.atKeyOf(id), abort })
          void (async () => {
            this.stage.setLow(id, false)
            for (const leg of legs) {
              for (const p of this.stage.route(id, leg, 40)) {
                if (abort.signal.aborted || this.disposed || !this.ran.has(id)) return
                await this.stage.moveCast(id, [p.x, p.z], { speed: e.speed, pace: e.sneak ? "sneak" : undefined })
              }
            }
            if (!abort.signal.aborted && !this.disposed && this.ran.has(id)) {
              this.stage.setOnStage(id, false)
              if (this.actors.get(id)?.kind === "exiting") {
                this.actors.set(id, { kind: "idle", atKey: this.atKeyOf(id) })
              }
            }
          })()
        }
      }
    }
  }

  private syncHeroDown(snap: ChoreographySnapshot) {
    if (!snap.shown) return
    const activeHeroFalls = new Set<string>()
    for (const c of snap.shown.characters) {
      const id = c.type === "pc" ? castIdFor(this.stage.cast, c) : undefined
      if (!id || snap.exits.has(id) || !this.stage.isOnStage(id)) continue
      if (!isDown(c as never) || isDead(c as never)) {
        this.heroFalls.get(id)?.abort()
        this.heroFalls.delete(id)
        if (this.stage.isDown(id)) this.stage.setDown(id, false)
        continue
      }
      const at = snap.paragraphs.findLastIndex((p) =>
        p.beats.some(
          (b) =>
            (b.kind === "roll" && (b.attack?.target === c.id || b.harm?.some((h) => h.target === c.id && h.kind === "damage"))) ||
            (b.kind === "feature" && b.harm?.some((h) => h.target === c.id && h.kind === "damage"))
        )
      )
      if (at >= 0 && this.toCome(snap, at, 0)) {
        this.heroFalls.get(id)?.abort()
        this.heroFalls.delete(id)
        if (this.stage.isDown(id)) this.stage.setDown(id, false)
      } else if (!this.stage.isDown(id)) {
        if (at >= 0 && this.reached(snap, at, 0)) {
          activeHeroFalls.add(id)
          if (!this.heroFalls.has(id)) {
            const abort = new AbortController()
            this.heroFalls.set(id, abort)
            void waitAbortable(this.timers.fallMs, abort.signal).then((ok) => {
              if (this.heroFalls.get(id) === abort) this.heroFalls.delete(id)
              if (ok && !this.disposed) this.stage.setDown(id, true)
            })
          }
        } else {
          this.heroFalls.get(id)?.abort()
          this.heroFalls.delete(id)
          this.stage.setDown(id, true, true)
        }
      }
    }
    for (const [id, abort] of this.heroFalls) {
      if (!activeHeroFalls.has(id)) {
        abort.abort()
        this.heroFalls.delete(id)
      }
    }
  }

  private syncStrolls(snap: ChoreographySnapshot) {
    if (!snap.reading) return
    for (const w of snap.walks) {
      const home = this.stage.staging?.cast.find((c) => c.id === w.cast)
      const spot = snap.spots.get(w.cast)?.at ?? home?.at
      if (!spot || !this.stage.isOnStage(w.cast)) continue
      const legs = [...(w.via ?? []), spot].map((leg) => this.stage.point(leg))
      if (this.toCome(snap, w.at, w.s)) {
        this.strolled.delete(w.cast)
        if (this.actors.get(w.cast)?.kind === "strolling") this.abortActor(w.cast)
        this.stage.placeCast(w.cast, w.from, [legs[0].x, legs[0].z])
      } else if (this.reached(snap, w.at, w.s) && !this.strolled.has(w.cast)) {
        this.strolled.add(w.cast)
        const abort = new AbortController()
        this.setActor(w.cast, { kind: "strolling", atKey: this.atKeyOf(w.cast), abort })
        this.stage.placeCast(w.cast, w.from, [legs[0].x, legs[0].z])
        void (async () => {
          for (const leg of legs) {
            for (const p of this.stage.route(w.cast, leg, 60)) {
              if (abort.signal.aborted || this.disposed) return
              await this.stage.moveCast(w.cast, [p.x, p.z], { speed: w.speed, pace: w.sneak ? "sneak" : undefined })
            }
          }
          if (!abort.signal.aborted && !this.disposed && this.actors.get(w.cast)?.kind === "strolling") {
            this.actors.set(w.cast, { kind: "idle", atKey: this.atKeyOf(w.cast) })
          }
        })()
      } else if (!this.strolled.has(w.cast)) {
        this.strolled.add(w.cast)
        this.stage.placeCast(w.cast, spot)
      }
    }
  }

  private syncPositions(snap: ChoreographySnapshot) {
    if (!snap.shown) return
    const encounter = `${snap.shown.adventureId}:${snap.shown.encounterId}`
    const fresh = this.encounterKey !== encounter
    if (fresh) {
      this.encounterKey = encounter
      for (const [id, state] of this.actors) {
        if (state.kind === "walking") this.abortActor(id, null)
        else this.actors.set(id, { ...state, atKey: null })
      }
    }
    const jump = this.pendingJump?.turnId === snap.turnId && snap.isSameTurnAsShown ? this.pendingJump : null
    if (jump) this.pendingJump = null

    for (const [id, { character, at: to, walked, teleport, pace }] of snap.spots) {
      if (jump) {
        const was = jump.where === "start" ? snap.priorCharacters?.find((c) => c.id === character)?.position : undefined
        const from: [number, number] = was ? [metres(was.x), metres(was.y)] : to
        this.abortActor(id, from.join())
        const cued = snap.cues.some((e) => e.cast === id && e.here && (this.toCome(snap, e.at, e.s) || this.reached(snap, e.at, e.s)))
        if (!cued && this.stage.isOnStage(id)) this.stage.placeCast(id, from)
        continue
      }
      const key = to.join()
      if (this.atKeyOf(id) === key) continue
      const cued = snap.cues.some((e) => e.cast === id && e.here && (this.toCome(snap, e.at, e.s) || this.reached(snap, e.at, e.s)))
      if (fresh || !this.stage.isOnStage(id) || cued) {
        const cur = this.actors.get(id)
        this.actors.set(id, cur ? { ...cur, atKey: key } : { kind: "idle", atKey: key })
        if (cued) continue
        if (this.stage.isOnStage(id) && !(snap.reading && snap.walks.some((w) => w.cast === id))) this.stage.placeCast(id, to)
        continue
      }
      let from = walked ? -1 : snap.paragraphs.findLastIndex((p) => p.beats[0]?.by.character === character)
      while (
        from > 0 &&
        snap.paragraphs[from - 1].beats[0]?.by.character === character &&
        snap.paragraphs[from - 1].beats[0]?.by.step === snap.paragraphs[from].beats[0]?.by.step
      )
        from--
      if (this.toCome(snap, from, 0)) continue

      if (teleport) {
        this.abortActor(id, key)
        this.stage.placeCast(id, to)
        continue
      }

      this.strolled.add(id)
      const abort = new AbortController()
      this.setActor(id, { kind: "walking", atKey: key, abort })
      void (async () => {
        for (const p of this.stage.route(id, { x: to[0], z: to[1] }, Number.POSITIVE_INFINITY)) {
          if (abort.signal.aborted || this.disposed) return
          const now = this.stage.castAt(id)
          if (Math.hypot(p.x - now.x, p.z - now.z) > 0.05) this.stage.faceCast(id, [p.x, p.z])
          await this.stage.moveCast(id, [p.x, p.z], pace ? { speed: PACE[pace], pace: pace === "sneak" ? "sneak" : undefined } : {})
        }
        if (abort.signal.aborted || this.disposed) return
        const now = this.stage.castAt(id)
        if (Math.hypot(to[0] - now.x, to[1] - now.z) > 0.05) this.stage.placeCast(id, to)
        const latest = this.latest
        const view = latest?.reading ? latest.beatsView : null
        if (view && (("subject" in view && view.subject === id) || ("pair" in view && view.pair.includes(id)))) {
          const shot = shotFor(this.stage, view, latest?.heroes ?? [])
          if (shot) this.stage.shot(shot, { follow: "pair" in view ? view.pair : [] })
        }
        if (this.actors.get(id)?.kind === "walking") {
          this.actors.set(id, { kind: "idle", atKey: key })
        }
      })().catch((error) => this.callbacks.onError(`Could not draw the move: ${String(error)}`))
    }

    for (const c of snap.shown.characters) {
      const id = castIdFor(this.stage.cast, c)
      if (!id) continue
      const spot = snap.spots.get(id)
      const low = keptLow(c) && (!spot || this.atKeyOf(id) === spot.at.join())
      if (low !== this.stage.isLow(id)) this.stage.setLow(id, low, fresh)
    }
  }

  private syncCamera(snap: ChoreographySnapshot) {
    if (!snap.reading) {
      this.cancelEstablishHold()
      this.lastShotSig = null
      const actorKey = `${snap.actorId ?? ""}:${snap.reading}:${snap.holding}`
      if (actorKey !== this.lastActorFrameKey) {
        this.lastActorFrameKey = actorKey
        if (snap.actorCastId && !snap.holding) {
          const h = this.stage.cast.find((c) => c.id === snap.actorCastId)?.height ?? 1.7
          this.stage.shot(
            { subject: snap.actorCastId, distance: Math.min(3.6, Math.max(2.4, h * 1.9)), angle: 18, height: h * 0.9 + 0.15, lookHeight: h * 0.62, fov: 45, orbit: 1.5, sweep: 8 },
            { move: { push: 0.04, seconds: 10 } }
          )
          this.cameraPhase = { phase: "actor", actorId: snap.actorCastId }
        }
      }
      return
    }
    this.lastActorFrameKey = null

    const preview = !snap.started
    if (preview && (this.hasFramedLive || this.cameraPhase.phase === "preview")) return

    let cut = !this.hasFramedLive
    if (preview) this.cameraPhase = { phase: "preview" }
    else this.hasFramedLive = true

    const hereKey = `${snap.turnId}:${snap.paragraph}`
    const arrived = this.pendingReframeTurnId === snap.turnId
    if (arrived && !preview) this.pendingReframeTurnId = null

    const composeCtx = (): ComposeContext => {
      const cast = this.stage.cast.filter((c) => this.stage.isOnStage(c.id))
      return {
        cast,
        clear: (from, at) => !this.stage.reach(from.id, at, Math.hypot(at.x - from.x, at.z - from.z) + 0.1).blocked,
        sees: (lens, height, spots) => this.stage.sees(lens, height, spots),
      }
    }

    const runShot = (
      current: ChoreographySnapshot,
      which: Parameters<Stage["shot"]>[0],
      take: Take | null,
      isCut: boolean,
      isPreview: boolean,
      follow: string[] = take?.follow ?? []
    ) => {
      if (isPreview) {
        this.stage.shot(take ? which : alive(which, current.paragraph), { instant: true })
        return
      }
      const sig = `${current.turnId}:${current.paragraph}:${JSON.stringify(which)}`
      if (!isCut && !take?.cut && this.lastShotSig === sig) {
        this.callbacks.traceLine?.(`shot p${current.paragraph} repeat skipped`)
        return
      }
      this.lastShotSig = sig
      this.callbacks.logShot?.(current.turnId, current.paragraph, typeof which === "string" ? which : (take?.label ?? "view"), isCut || !!take?.cut)
      const cast = this.stage.cast.filter((c) => this.stage.isOnStage(c.id))
      this.callbacks.traceShot?.(this.stage, current.paragraph, which, take, cast, current.text[current.paragraph])
      this.stage.shot(take ? which : alive(which, current.paragraph), {
        instant: isCut || !!take?.cut,
        follow,
        duration: take?.duration ?? 2600,
        ease: take?.ease,
        move: take ? take.move : SETTLE,
        impact: take?.impact,
        take: take?.label,
        planted: take?.planted,
      })
      this.cameraPhase = { phase: "paragraph", turnId: current.turnId, paragraph: current.paragraph, sig }
    }

    const frameParagraph = (current: ChoreographySnapshot, isCut: boolean, isPreview: boolean, didArrive: boolean) => {
      const take = current.plan ? compose(current.plan, composeCtx()) : null
      if (current.departing?.shot) return runShot(current, current.departing.shot, take, isCut, isPreview)
      if (current.arriving?.shot && !(take && current.arriving.speed <= PROWL)) return runShot(current, current.arriving.shot, take, isCut, isPreview)
      if (take) return runShot(current, take.shot, take, isCut, isPreview)
      if (current.lead) {
        const shot = { distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 }
        const leader = this.stage.cast.find((c) => c.id === current.lead)
        return runShot(current, leader ? speakerShot(leader, shot) : { subject: current.lead, ...shot }, null, isCut, isPreview)
      }
      const view = current.beatsView
      if (!view) {
        if (didArrive && this.stage.staging?.shot) return runShot(current, this.stage.staging.shot, null, isCut, isPreview)
        if (!isPreview && !isCut) this.stage.circleOn(current.paragraph % 2 ? -3 : 3, 12)
        if (!isPreview) this.cameraPhase = { phase: "paragraph", turnId: current.turnId, paragraph: current.paragraph, sig: this.lastShotSig }
        return
      }
      const shot = shotFor(this.stage, view, current.heroes)
      if (shot) runShot(current, shot, null, isCut, isPreview, "pair" in view ? view.pair : [])
    }

    if ((cut || preview) && snap.paragraph === snap.openingAt && snap.plan?.moment.kind !== "establish" && !snap.departing?.shot && !snap.arriving?.shot) {
      const party = snap.heroes.filter((id) => this.stage.isOnStage(id))
      const wide = party.length ? compose({ moment: { kind: "establish", party }, side: snap.plan?.side ?? 1, variant: 0 }, composeCtx()) : null
      const opening = wide?.shot ?? this.stage.staging?.shot
      if (opening) {
        runShot(snap, opening, wide, cut, preview)
        this.stage.circleOn((snap.plan?.side ?? 1) * -4, 90)
        if (preview) return
        cut = false
        this.cancelEstablishHold()
        const until = Date.now() + this.timers.establishMs
        this.cameraPhase = { phase: "establish_hold", at: hereKey, until }
        const abort = new AbortController()
        this.establishAbort = abort
        void waitAbortable(this.timers.establishMs, abort.signal).then((ok) => {
          if (!ok || this.disposed || !this.latest?.reading) return
          this.establishAbort = null
          frameParagraph(this.latest, false, false, false)
        })
        return
      }
    }

    if (this.cameraPhase.phase === "establish_hold") {
      if (this.cameraPhase.at === hereKey && this.cameraPhase.until > Date.now()) {
        // Keep the existing hold timer running; when it fires it reads `this.latest`.
        return
      }
      this.cancelEstablishHold()
    }

    frameParagraph(snap, cut, preview, arrived)
  }

  private syncEffects(snap: ChoreographySnapshot) {
    const here = snap.reading && snap.turnId ? `${snap.turnId}:${snap.paragraph}` : ""
    if (this.showingKey !== here) {
      this.showingKey = here
      this.fxAbort?.abort()
      this.fxAbort = here ? new AbortController() : null
    }
    if (!here || !snap.turnId || !this.fxAbort) return
    const signal = this.fxAbort.signal

    for (const { key, beat: b, effect, miss, outcome, using, s } of snap.staged.get(snap.paragraph) ?? []) {
      if (this.played.has(key) || snap.heard < s) continue
      const actor = snap.castOf(b.actor)
      if (!actor || !this.stage.isOnStage(actor)) continue
      this.played.add(key)
      const target = snap.castOf(b.target)
      const propTo = b.object ? snap.castOf(b.object.to) : undefined
      void Promise.race([this.stage.shotSettled(), waitAbortable(this.timers.fxSettleMs, signal)]).then(() => {
        if (signal.aborted || this.disposed || this.showingKey !== here) return
        if (effect && b.effect) void this.stage.effect(b.effect.kind, actor, target, b.effect.element, { miss, outcome, using })
        else if (b.object) {
          void this.stage.prop(b.object.kind, actor, propTo)
          this.handedOver.add(b)
          this.callbacks.onHandedOver()
        }
      })
    }

    for (const { key, cue, actor, s } of snap.sounded.get(snap.paragraph) ?? []) {
      if (this.played.has(key) || snap.heard < s) continue
      this.played.add(key)
      this.stage.sound(cue, snap.castOf(actor))
    }
  }
}
