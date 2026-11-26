import type { CastMember } from "./figures/standees"
import type { StagingShot } from "./spec/staging"

// The director: what a moment of a turn means, shot as a film would shoot it. A crit is a low angle and a hard push, a
// death a crane up and away, a threat a slow push into a close-up, a quiet exchange over the shoulder, cutting back and
// forth. No GPU and no DOM, and deterministic: every player at a table sees the same takes.
//
// Two halves. `planTakes` reads a turn's moments in order and decides the grammar: which side of the action the camera
// keeps (the 180 degree rule), and a different framing when the same subject would get the same one twice. `compose`
// turns one plan into a shot on where everyone stands at the moment it is taken, since people walk between paragraphs.

export type Tone = "calm" | "tense" | "hushed" | "loud"
export type Outcome = "hit" | "crit" | "miss" | "fumble"
export type Fate = "revived" | "stable" | "dead"
export type Moment =
  // An encounter opens: the place, with the party in it.
  | { kind: "establish"; party: string[] }
  | { kind: "line"; speaker: string; listener?: string; tone: Tone }
  // The roll that decides an attack, before the blow lands.
  | { kind: "windup"; actor: string; target?: string; outcome: Outcome }
  | { kind: "strike"; actor: string; target: string; outcome: Outcome; ranged?: boolean }
  | { kind: "spell"; actor: string; target?: string; area?: boolean; outcome: Outcome }
  | { kind: "kill"; victim: string; killer?: string }
  // A hero dropped to the ground, dying.
  | { kind: "down"; victim: string }
  | { kind: "deathSave"; hero: string; success: boolean; fate?: Fate }
  | { kind: "check"; actor: string; success: boolean; natural: number }
  | { kind: "heal"; actor: string; target?: string }
  // `speed` is how fast they walk on, in metres a second: a slow one is a prowl, shot for as long as it walks.
  | { kind: "entrance"; who: string; monster: boolean; from: readonly [number, number]; home: readonly [number, number]; speed?: number }
  | { kind: "exit"; who: string }
  | { kind: "action"; actor: string; target?: string }

// How a glide eases: `glide` evenly in and out, `snap` fast off the mark and settling (a whip toward a blow), `drift`
// slow and long (an establishing move).
export type Ease = "glide" | "snap" | "drift"
// A move the camera keeps making once it has arrived, over `seconds`, easing out: `push` is the share of the way to
// what it looks at it closes (negative pulls back), `rise` metres it cranes up (or down), `roll` degrees of dutch tilt.
// `delay` holds it that long first, such as for someone to fall before the crane rises off them.
export interface CameraMove {
  push?: number
  rise?: number
  roll?: number
  seconds: number
  delay?: number
}
// A jolt: `shake` and `punch` (a kick of the lens) 0..1, as the next blow lands on someone, or `now`.
export interface Impact {
  shake: number
  punch?: number
  on: "land" | "now"
  delay?: number
}
export interface Take {
  shot: StagingShot
  follow: string[]
  cut: boolean
  // Of a glide, in milliseconds.
  duration: number
  ease: Ease
  move?: CameraMove
  impact?: Impact
  // What the take is, for the dev page and the stats.
  label: string
  // The camera holds its ground while those in the shot walk, rather than follow them: a prowl grows in the frame.
  planted?: boolean
}
export interface Plan {
  moment: Moment
  // Which side of the line between two people the camera keeps, or of one person's face: 1 or -1.
  side: 1 | -1
  // Another framing of the same idea, when the last take was the same one on the same subject.
  variant: number
}

// ── Planning ──

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

// The cast members a moment is about, in the order its framing reads them.
export function subjectsOf(m: Moment): string[] {
  switch (m.kind) {
    case "establish":
      return m.party
    case "line":
      return m.listener ? [m.speaker, m.listener] : [m.speaker]
    case "windup":
    case "spell":
    case "action":
      return m.target ? [m.actor, m.target] : [m.actor]
    case "strike":
      return [m.actor, m.target]
    case "kill":
      return [m.victim]
    case "down":
      return [m.victim]
    case "deathSave":
      return [m.hero]
    case "check":
      return [m.actor]
    case "heal":
      return [m.target ?? m.actor]
    case "entrance":
    case "exit":
      return [m.who]
  }
}
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// A turn's moments in order, planned as one sequence. `seed` is the same for everyone at the table, such as the turn.
export function planTakes(moments: readonly (Moment | null)[], seed: string): (Plan | null)[] {
  const sides = new Map<string, 1 | -1>()
  let last: { key: string; variant: number } | null = null
  return moments.map((m, i) => {
    if (!m) return null
    const ids = subjectsOf(m)
    // Two people keep the side the camera first took of them for the rest of the turn, so a cut back and forth never
    // flips who is on the left. One person alone gets a side of their own, the same for the turn.
    const key = ids.length >= 2 ? pairKey(ids[0], ids[1]) : (ids[0] ?? "")
    let side = sides.get(key)
    if (!side) {
      side = hash(`${seed}:${key}`) & 1 ? 1 : -1
      sides.set(key, side)
    }
    const framing = `${m.kind}:${ids.join(",")}`
    const variant = last?.key === framing ? last.variant + 1 : hash(`${seed}:${i}`) % 2
    last = { key: framing, variant }
    return { moment: m, side, variant }
  })
}

// ── Composing ──

export interface ComposeContext {
  // Everyone on stage, where they stand now.
  cast: readonly CastMember[]
  // Whether a camera can stand at a point behind someone, looking past them: nothing solid in the way. Without it,
  // anywhere will do.
  clear?: (from: CastMember, at: { x: number; z: number }) => boolean
  // Whether a lens sees a figure of a height at each spot, nothing solid in the way and room for the camera. Without it,
  // any view will do.
  sees?: (lens: { position: [number, number, number]; target: [number, number, number]; fov: number }, height: number, spots: { x: number; z: number }[]) => boolean
}

const DEG = Math.PI / 180
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const fovFor = (half: number, far: number) => clamp((2 * Math.atan(half / Math.max(0.5, far))) / DEG, 18, 70)
// Someone much taller than a person, to be looked up at: a beast, an ogre, a drake.
const big = (c: Pick<CastMember, "height" | "voice">) => c.height >= 2.3 || c.voice === "beast"

type Subject = Extract<StagingShot, { subject: string }>
// The size of shot on one person, scaled by how tall they are. `side` swings it off their face, `low` and `high` put
// the lens below their eyes or above their head.
function on(c: CastMember, size: "extreme" | "close" | "medium" | "wide", side: number, angle = 22, lens?: number): Subject {
  const h = c.height
  // A close shot sized for a person shows only the crown of a beast's head. A big one is framed from the shoulders up
  // instead, from a little below, so its face and eyes fill the frame.
  if (big(c) && (size === "extreme" || size === "close")) {
    const look = h * 0.74
    const distance = clamp(h * (size === "extreme" ? 1.15 : 1.45), 2.6, 9)
    return { subject: c.id, distance, angle: side * angle, height: h * 0.6, lookHeight: look, fov: fovFor(h * (size === "extreme" ? 0.24 : 0.32), distance) }
  }
  if (size === "extreme") return { subject: c.id, distance: clamp(h * 0.62, 0.9, 3), angle: side * angle * 0.7, height: h * 0.9, lookHeight: h * 0.9, fov: lens ?? 28 }
  if (size === "close") return { subject: c.id, distance: clamp(h * 0.95, 1.3, 4), angle: side * angle, height: h * 0.88, lookHeight: h * 0.86, fov: lens ?? 32 }
  if (size === "medium") return { subject: c.id, distance: clamp(h * 2.1, 2.6, 7), angle: side * angle, height: h * 0.95, lookHeight: h * 0.66, fov: lens ?? 40 }
  return { subject: c.id, distance: clamp(h * 3.6 + 2, 5, 16), angle: side * angle, height: h * 1.25, lookHeight: h * 0.5, fov: lens ?? 48 }
}
// A speaker's view, framed for a person. Someone much taller stands farther off and is looked at higher up, so the
// whole of them is in the frame: framed as a person, the owlbear's head went off the top.
export function speakerShot(c: Pick<CastMember, "id" | "height" | "voice">, shot: Omit<Subject, "subject">): Subject {
  if (!big(c)) return { subject: c.id, ...shot }
  const h = c.height
  return { ...shot, subject: c.id, distance: clamp(h * 2.2, shot.distance, 12), height: h * 0.55, lookHeight: h * 0.6, fov: Math.max(shot.fov, 45) }
}
// From below, looking up: a hero's moment, or a monster's size.
const low = (c: CastMember, side: number, near = 1.6): Subject => ({
  subject: c.id,
  distance: clamp(c.height * near, 1.8, 9),
  angle: side * 28,
  height: clamp(c.height * 0.22, 0.35, 1.2),
  lookHeight: c.height * 0.78,
  fov: big(c) ? 52 : 44,
})
// From above, looking down on them: someone fallen, failing, or lying in the dirt.
const high = (c: CastMember, side: number): Subject => ({
  subject: c.id,
  distance: clamp(c.height * 0.9 + 0.9, 1.8, 5),
  angle: side * 35,
  height: c.height + 2,
  lookHeight: 0.35,
  fov: 42,
})

// Whether anyone but `skip` stands across the line from a camera at `at` to `to`: between the two, and within their
// own width and a little of it.
function inTheWay(at: { x: number; z: number }, to: CastMember, skip: string[], cast: readonly CastMember[]) {
  const lx = to.x - at.x
  const lz = to.z - at.z
  const len = Math.hypot(lx, lz)
  if (len < 0.01) return false
  return cast.some((c) => {
    if (skip.includes(c.id)) return false
    const t = ((c.x - at.x) * lx + (c.z - at.z) * lz) / (len * len)
    if (t <= 0.05 || t >= 0.95) return false
    const off = Math.abs((c.x - at.x) * lz - (c.z - at.z) * lx) / len
    return off < 0.35 + c.height * 0.12
  })
}
// Over `from`'s shoulder toward `to`, framed on `to`'s upper body. Null when something solid stands behind `from`, or
// `from` is too tall to see past.
function overShoulder(from: CastMember, to: CastMember, side: number, ctx: ComposeContext, tight = true): StagingShot | null {
  const d = Math.hypot(to.x - from.x, to.z - from.z)
  if (d < 0.4 || d > 16 || from.height > 2.2) return null
  const dx = (to.x - from.x) / d
  const dz = (to.z - from.z) / d
  const back = tight ? 1.25 : 2.2
  const off = tight ? 0.55 : 0.85
  const at = { x: from.x - dx * back - dz * off * side, z: from.z - dz * back + dx * off * side }
  if (ctx.clear && !ctx.clear(from, at)) return null
  // Someone else standing across the look fills the frame instead: Silas a step in front of Reinhard.
  if (inTheWay(at, to, [from.id, to.id], ctx.cast)) return null
  const fy = from.y ?? 0
  const ty = to.y ?? 0
  const far = d + back
  // Close enough that `to` fills the frame from the chest up; a big one is framed whole.
  const half = big(to) ? to.height * 0.62 : tight ? to.height * 0.42 : to.height * 0.7
  const look = big(to) ? to.height * 0.6 : to.height * 0.82
  return { position: [at.x, fy + from.height * 1.02, at.z], target: [to.x, ty + look, to.z], fov: fovFor(half, far) }
}
// Side on to two people, both in the picture: the line between them runs across the frame.
// Indoors the wide spot can be through a wall: the other side, then nearer with a wider lens, takes the first spot
// with nothing solid between it and either of them.
function profile(a: CastMember, b: CastMember, side: number, lift = 0, ctx?: ComposeContext): StagingShot {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const mx = (a.x + b.x) / 2
  const mz = (a.z + b.z) / 2
  const my = ((a.y ?? 0) + (b.y ?? 0)) / 2
  const dx = d > 0.01 ? (b.x - a.x) / d : 1
  const dz = d > 0.01 ? (b.z - a.z) / d : 0
  const tall = Math.max(a.height, b.height)
  // No farther off than a set's camera can usually stand: a lens that has to be wider is wider.
  const off = Math.min(7.5, Math.max(3.2, d * 0.85 + 2.2 + tall * 0.4))
  const half = (d / 2 + 1 + tall * 0.2) / 1.6
  const shot = (s: number, o: number): StagingShot => ({ position: [mx - dz * o * s, my + 1.45 + lift, mz + dx * o * s], target: [mx, my + Math.min(1.2, tall * 0.55), mz], fov: fovFor(half, o) })
  const clear = ctx?.clear
  if (!clear) return shot(side, off)
  const tries = [off, off * 0.7, off * 0.5, Math.min(off, 1.8)].flatMap((o) => [[side, o], [-side, o]] as const)
  for (const [s, o] of tries) {
    const at = { x: mx - dz * o * s, z: mz + dx * o * s }
    if (clear(a, at) && clear(b, at)) return shot(s, o)
  }
  return shot(side, off)
}

const apart = (a: CastMember, b: CastMember) => Math.hypot(b.x - a.x, b.z - a.z)
// Two people, one acting on the other: over the actor's shoulder, or past the one acted on at the actor coming at
// them (the way to see a monster's blow), or side on. Each in turn, as the set allows; the variant swaps the first two.
function twoShot(actor: CastMember, target: CastMember, side: number, variant: number, ctx: ComposeContext, tight: boolean): StagingShot {
  const forward = () => overShoulder(actor, target, side, ctx, tight)
  const reverse = () => overShoulder(target, actor, -side, ctx, false)
  const [first, second] = variant % 2 === 0 ? [forward, reverse] : [reverse, forward]
  return first() ?? second() ?? (apart(actor, target) < 7 ? profile(actor, target, side, 0, ctx) : (on(target, "medium", side) as StagingShot))
}

// An entrance walked for at least this many seconds is a prowl, shot as one long move.
const PROWL_SECONDS = 6

export function compose(plan: Plan, ctx: ComposeContext): Take | null {
  const byId = new Map(ctx.cast.map((c) => [c.id, c]))
  const get = (id: string | undefined) => (id ? byId.get(id) : undefined)
  const { moment: m, side: s, variant: v } = plan
  const take = (shot: StagingShot, label: string, more: Partial<Take> = {}): Take => ({ shot, follow: [], cut: false, duration: 1800, ease: "glide", label, ...more })
  switch (m.kind) {
    case "establish": {
      const party = m.party.filter((id) => byId.has(id))
      if (!party.length) return null
      // A party split across the set, as in the Shipment (Lyra aboard, Poppen and Thalbern hidden on the bank), has no
      // behind to stand at: the view from behind them all lands in the reeds. The scene's own opening view stands.
      const spread = Math.max(...party.flatMap((a) => party.map((b) => apart(byId.get(a)!, byId.get(b)!))))
      if (spread > 8) return null
      // Behind the party and above, looking past them at where they face, circling slowly round for as long as it holds.
      return take({ subjects: party, offset: [s * 2.4, 3.4, -6.5], target: [0, 1.2, 5], relative: "facing", fov: 52, orbit: s * -4, sweep: 90 }, "establishing", {
        duration: 3200,
        ease: "drift",
        move: { push: 0.12, rise: -0.6, seconds: 9 },
      })
    }
    case "line": {
      const speaker = get(m.speaker)
      if (!speaker) return null
      const listener = get(m.listener)
      if (m.tone === "hushed")
        return take(on(speaker, "extreme", s), "hushed close-up", { duration: 2400, ease: "drift", move: { push: 0.2, seconds: 8 } })
      if (m.tone === "loud")
        return take(big(speaker) ? low(speaker, s, 1.3) : on(speaker, "close", s, 18, 36), "shout", {
          cut: true,
          move: { push: 0.08, seconds: 1.2 },
          impact: { shake: 0.35, punch: 0.25, on: "now", delay: 0.15 },
        })
      if (m.tone === "tense")
        // A slow push into a close-up, from a touch below the eyes, and a tilt that grows as the line goes on.
        return take({ ...on(speaker, "close", s, 16), height: speaker.height * 0.78 }, "tense close-up", {
          duration: 2600,
          ease: "drift",
          move: { push: 0.28, roll: s * 3.5, seconds: 7 },
        })
      // A quiet exchange: over the listener's shoulder onto the speaker, cutting to the reverse as the other answers.
      const reverse = listener && overShoulder(listener, speaker, s * (listener.id < speaker.id ? 1 : -1), ctx)
      if (reverse) return take(reverse, "over the shoulder", { duration: 1400, move: { push: 0.04, seconds: 6 } })
      return take(on(speaker, v % 2 ? "close" : "medium", s), "speaker", { duration: 1600, move: { push: 0.05, seconds: 6 } })
    }
    case "windup": {
      const actor = get(m.actor)
      if (!actor) return null
      // A crit or a fumble is decided on the die: the camera already knows.
      if (m.outcome === "crit") return take(low(actor, s, 1.3), "crit windup", { cut: true, move: { push: 0.32, roll: s * 5, seconds: 2.6 } })
      if (m.outcome === "fumble") return take(high(actor, s), "fumble windup", { duration: 1400, move: { push: -0.08, roll: -s * 4, seconds: 4 } })
      const target = get(m.target)
      const ots = target && overShoulder(actor, target, s, ctx, false)
      if (ots && v % 2 === 0) return take(ots, "windup over the shoulder", { duration: 1300, move: { push: 0.06, seconds: 3 } })
      return take(on(actor, "medium", s), "windup", { duration: 1300, move: { push: 0.07, seconds: 3 } })
    }
    case "strike": {
      const actor = get(m.actor)
      const target = get(m.target)
      if (!actor || !target) return null
      const follow = [actor.id, target.id]
      if (m.outcome === "crit") {
        // Cut in tight on the one struck, from low, and take the blow with them.
        // Not followed: following asks the view to keep the attacker in it too, which swings it off the face.
        return take(big(target) ? low(target, -s, 1.1) : on(target, "close", -s, 30, 36), "critical hit", {
          cut: true,
          move: { push: 0.3, roll: -s * 6, seconds: 1.8 },
          impact: { shake: 1, punch: 0.8, on: "land" },
        })
      }
      if (m.outcome === "miss" || m.outcome === "fumble")
        // Side on, so the dodge reads across the frame, when they stand close enough to share it.
        return take(apart(actor, target) < 7 ? profile(actor, target, s, 0, ctx) : twoShot(actor, target, s, 1, ctx, false), m.outcome === "fumble" ? "fumble" : "miss", {
          duration: 1100,
          ease: "snap",
          follow,
          move: { push: -0.05, roll: m.outcome === "fumble" ? s * 4 : 0, seconds: 3 },
        })
      const shot = twoShot(actor, target, s, v, ctx, !m.ranged)
      return take(shot, "strike", { duration: 900, ease: "snap", follow, move: { push: 0.06, seconds: 2 }, impact: { shake: 0.5, punch: 0.3, on: "land" } })
    }
    case "spell": {
      const actor = get(m.actor)
      if (!actor) return null
      const target = get(m.target)
      const hard = m.outcome === "crit"
      if (m.area || !target)
        // From low and wide on the caster, circling as the power gathers.
        return take({ ...low(actor, s, 2.4), orbit: s * 6, sweep: 26 }, "spell", {
          duration: 1500,
          move: { push: 0.1, rise: 0.3, seconds: 5 },
          impact: { shake: hard ? 0.8 : 0.45, punch: hard ? 0.5 : 0.2, on: "land" },
        })
      return take(apart(actor, target) < 7 ? profile(actor, target, s, 0.3, ctx) : twoShot(actor, target, s, v, ctx, false), "spell across", {
        duration: 1000,
        ease: "snap",
        follow: [actor.id, target.id],
        move: { push: 0.05, seconds: 3 },
        impact: m.outcome === "miss" ? undefined : { shake: hard ? 0.9 : 0.4, punch: hard ? 0.6 : 0.2, on: "land" },
      })
    }
    case "kill": {
      const victim = get(m.victim)
      if (!victim) return null
      // Eye to eye with them as the blow lands, then the camera lifts away as they fall, and holds.
      return take(on(victim, "medium", s, 30), "death", {
        cut: true,
        move: { push: -0.15, rise: 2.2, seconds: 8, delay: 1.3 },
        impact: { shake: 0.7, punch: 0.4, on: "land" },
      })
    }
    case "down": {
      const victim = get(m.victim)
      if (!victim) return null
      return take(high(victim, s), "down", { duration: 1600, move: { push: 0.12, roll: s * 4, seconds: 6, delay: 1.2 }, impact: { shake: 0.5, punch: 0.3, on: "land" } })
    }
    case "deathSave": {
      const hero = get(m.hero)
      if (!hero) return null
      if (m.fate === "dead") return take(high(hero, s), "death save lost", { duration: 2200, ease: "drift", move: { push: -0.4, rise: 3.5, seconds: 9, delay: 1 } })
      if (m.fate === "revived") return take(low(hero, s, 1.4), "back from the brink", { cut: true, move: { push: 0.15, seconds: 3 }, impact: { shake: 0.3, punch: 0.35, on: "now", delay: 0.4 } })
      // Straight down on them, turning slowly, closing in: the dice decide.
      return take({ ...high(hero, s), height: hero.height + 2.6, distance: 1.4, orbit: s * 7, sweep: 40 }, "death save", {
        duration: 2000,
        ease: "drift",
        move: { push: m.success ? 0.06 : 0.14, seconds: 6 },
      })
    }
    case "check": {
      const actor = get(m.actor)
      if (!actor) return null
      if (m.natural === 20) return take(low(actor, s), "natural 20", { cut: true, move: { push: 0.14, seconds: 3 }, impact: { shake: 0.2, punch: 0.35, on: "now", delay: 0.2 } })
      if (m.natural === 1) return take(high(actor, s), "natural 1", { duration: 1400, move: { push: -0.1, roll: s * 4, seconds: 4 } })
      return take(on(actor, v % 2 ? "close" : "medium", s), m.success ? "check" : "check failed", { duration: 1500, move: { push: m.success ? 0.07 : -0.05, seconds: 4 } })
    }
    case "heal": {
      const who = get(m.target) ?? get(m.actor)
      if (!who) return null
      return take(on(who, "medium", s, 26), "heal", { duration: 2000, ease: "drift", move: { push: 0.06, rise: 0.35, seconds: 6 } })
    }
    case "entrance": {
      const who = get(m.who)
      const [fx, fz] = m.from
      const [hx, hz] = m.home
      const d = Math.hypot(hx - fx, hz - fz) || 1
      // How long they walk on for. A beast that takes its time is a prowl.
      const walk = m.speed ? d / m.speed : 0
      if (m.monster && who && walk >= PROWL_SECONDS) {
        // Low on the ground just past where it will stop, looking back up the way it comes. The camera holds its ground
        // and only drifts in, so the beast walks out of the dark and grows step by step until it looms over the lens.
        // No tilt and no jolt: the weight is the pace. The line it walks is turned a little either way until a trunk
        // stands neither in the way nor where the camera would be.
        const ux = (hx - fx) / d
        const uz = (hz - fz) / d
        const back = 2 + who.height * 1.4
        const target: [number, number, number] = [hx, who.height * 0.52, hz]
        const seconds = Math.min(24, walk + 2)
        const at = (deg: number): [number, number, number] => {
          const r = deg * s * DEG
          return [hx + (ux * Math.cos(r) - uz * Math.sin(r)) * back, 0.4, hz + (ux * Math.sin(r) + uz * Math.cos(r)) * back]
        }
        const spots = [
          { x: hx, z: hz },
          { x: fx, z: fz },
        ]
        const turns = [0, 8, -8, 16, -16, 24, -24, 32, -32]
        const position = at(turns.find((t) => !ctx.sees || ctx.sees({ position: at(t), target, fov: 40 }, who.height, spots)) ?? 0)
        return take({ position, target, fov: 40, orbit: s, sweep: 14 }, "monster prowls in", {
          cut: true,
          ease: "drift",
          planted: true,
          move: { push: 0.2, rise: 0, seconds },
        })
      }
      if (m.monster && who) {
        // From low, on the ground where they will stop, looking back the way they come: they fill the frame on arrival.
        const k = (2.4 + who.height * 0.8) / d
        return take({ position: [hx + (hx - fx) * k, 0.45, hz + (hz - fz) * k], target: [(fx + hx * 2) / 3, who.height * 0.7, (fz + hz * 2) / 3], fov: 56 }, "monster entrance", {
          cut: true,
          move: { push: 0.12, roll: s * 3, seconds: 6 },
          impact: { shake: 0.4, punch: 0.15, on: "now", delay: 2.4 },
        })
      }
      // Facing the way they come: from beyond their place, looking back at where they enter.
      const k = 3.6 / d
      return take({ position: [hx + (hx - fx) * k, 1.75, hz + (hz - fz) * k], target: [(fx + hx) / 2, 1.3, (fz + hz) / 2], fov: 50 }, "entrance", {
        duration: 1800,
        move: { push: 0.06, seconds: 6 },
      })
    }
    case "exit": {
      const who = get(m.who)
      if (!who) return null
      return take(on(who, "wide", s, 40), "exit", { duration: 1400, follow: [who.id], move: { push: -0.12, seconds: 5 } })
    }
    case "action": {
      const actor = get(m.actor)
      if (!actor) return null
      const target = get(m.target)
      if (target) {
        return take(twoShot(actor, target, s, v, ctx, false), "two-shot", { duration: 1600, follow: [actor.id, target.id], move: { push: 0.05, seconds: 5 } })
      }
      return take(on(actor, v % 2 ? "close" : "medium", s), "on them", { duration: 1600, move: { push: 0.05, seconds: 5 } })
    }
  }
}

// How a glide eases, 0..1 to 0..1.
export function eased(ease: Ease, t: number) {
  if (ease === "snap") return 1 - (1 - t) ** 4
  if (ease === "drift") return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2
  return t * t * (3 - 2 * t)
}
