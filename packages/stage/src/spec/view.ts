import type { CastMember } from "../figures/standees"
import { frameShot, type ResolvedShot } from "./resolve"
import { type Lens, roomAt, type Seen, type Sight, viewCost } from "./sight"
import type { StagingShot } from "./staging"

// Where a view of the cast is taken from, so that nothing solid hides anyone it is on: a wall or a cabin, a trunk
// between the lens and them, a root filling the picture beside it. The view is swung round what it looks at, drawn in,
// drawn back or raised, and the one that hides least is taken. The authored view is kept when it is clear.
// No GPU and no DOM: `stage:check` asks the same question of every staging.

type Position = [number, number, number]
export interface ViewCost {
  hidden: number
  out: number
  cover: number
}
export interface ViewAsk {
  shot: StagingShot
  // Everyone on stage, where they stand now.
  cast: readonly CastMember[]
  // The shot's own subjects, then whoever else it is to keep in the picture.
  ids: readonly string[]
  sight: Sight
  // The set's camera box, which pulls a camera back inside it, and its rooms.
  box: { min: readonly number[]; max: readonly number[] }
  rooms?: readonly { box: readonly number[] }[]
  aspect: number
  // The lens a shot's own gives on this screen.
  lens?: (fov: number) => number
  crowd?: readonly { x: number; y: number; z: number; kind: string; s: number }[]
  // Whether a cast member is on stage: someone who is not hides no one and is not looked for.
  present?: (m: CastMember) => boolean
  // A cast member as the sight test sees them: someone crouched or fallen is less to hide.
  seen?: (m: CastMember) => Seen
  // What the lens would really see, where something can say: a look may stand models where the set built its own
  // trees, thicker than the set knows. Asked of the few best views only, in order, until one is clear.
  truth?: (lens: Lens, figures: readonly Seen[]) => ViewCost | null
}

// Swinging round, drawing in or back, or rising costs a little, so a view far from the authored one, such as the
// subject's back, has to be worth it: one bystander at the edge of the frame is better than looking at the subject
// from behind.
const SCALES = [
  [1, 0],
  [0.75, 0.2],
  [0.55, 0.5],
  [1.3, 0.35],
]
const LIFTS = [
  [0, 0],
  [0.9, 0.4],
]
const SWINGS = [0, 30, -30, 60, -60, 90, -90, 135, -135, 180]
// A view this good is taken without looking further.
const FINE = 0.2
// How many views are put to `truth`.
const TRIES = 6

// What a view's faults weigh. Someone hidden weighs most. Being outside the picture counts only for those the shot
// was asked to keep in it: its own subjects are framed as their shot frames them.
// Something at the edge of the picture is framing, so cover counts once it takes a quarter of the middle.
// Someone kept in the picture may be cut by its edge, as a near shoulder is: they count once most of them is outside.
const weigh = (v: ViewCost, kept: ViewCost | null) => v.hidden * 24 + (kept ? Math.max(0, kept.out - 0.5) * 12 : 0) + v.cover * 0.2 + Math.max(0, v.cover - 0.25) * 6

export function clearView(ask: ViewAsk): { shot: ResolvedShot; moved: boolean; cost: number } {
  const { shot: which, cast, sight } = ask
  const first = frameShot(which, cast as CastMember[])
  const present = ask.present ?? (() => true)
  const figures = [...new Set(ask.ids)].map((id) => cast.find((m) => m.id === id)).filter((m): m is CastMember => !!m && present(m))
  if (!figures.length || !sight.bits.length) return { shot: first, moved: false, cost: 0 }
  const c = "subject" in which ? cast.find((m) => m.id === which.subject) : undefined
  const own = new Set("subject" in which ? [which.subject] : "subjects" in which ? which.subjects : [])
  const seen = ask.seen ?? ((m: CastMember): Seen => ({ x: m.x, z: m.z, y: m.y, height: m.height }))
  const all = figures.map(seen)
  // A camera put at a point, such as over someone's shoulder, was put there for its picture: it moves only for what
  // hides the people in it, not for who stands where in the frame.
  const placed = "position" in which
  const extra = placed ? [] : figures.filter((m) => !own.has(m.id)).map(seen)
  const fov = ask.lens ? ask.lens(first.fov) : first.fov
  const { min, max } = ask.box
  const fit = (p: Position): Position => [0, 1, 2].map((i) => Math.min(max[i], Math.max(min[i], p[i]))) as Position
  // How badly people spoil a view of someone: anyone in the sight line (a shorter person in front is looked over), or
  // close enough beside the lens to fill the frame. Cast count for much more than the crowd, which the renderer fades.
  const crowding = (x: number, y: number, z: number) => {
    if (placed) return 0
    let score = 0
    for (const f of figures) {
      const look = (f.y ?? 0) + (f === c && "subject" in which ? which.lookHeight : f.height * 0.65)
      const dx = f.x - x
      const dz = f.z - z
      const len2 = dx * dx + dz * dz
      const spoils = (m: { x: number; z: number }, height: number) => {
        const t = ((m.x - x) * dx + (m.z - z) * dz) / len2
        if (t <= 0 || t >= 1) return false
        const off = Math.hypot(x + dx * t - m.x, z + dz * t - m.z)
        return (off < 0.4 && y + (look - y) * t < height) || (off < 1.1 && Math.hypot(m.x - x, m.z - z) < 1.8)
      }
      // Those a shot frames together stand as its author grouped them: one in front of another is the picture.
      for (const m of cast) if (m !== f && present(m) && !(own.has(m.id) && own.has(f.id)) && spoils(m, (m.y ?? 0) + m.height)) score += 3
      for (const p of ask.crowd ?? []) if (Math.hypot(p.x - x, p.y + 1.1 - y, p.z - z) >= 1.1 && spoils(p, (p.kind === "child" ? 1.2 : 1.7) * p.s)) score += 0.2
    }
    return score / figures.length
  }
  const lensAt = (position: Position): Lens => ({ position, target: first.target, fov, aspect: ask.aspect })
  // What a camera position costs, or nothing if it will not do at all: on top of someone, or with no elbow room.
  const cost = (position: Position) => {
    const [x, y, z] = position
    if (figures.some((f) => Math.hypot(x - f.x, z - f.z) <= Math.min(1.5, 0.6 + f.height * 0.5)) || !roomAt(sight, x, y, z)) return undefined
    // Nor inside anyone else's body, below the top of their head: a view of Thalbern on the ground put the lens in the
    // Owlbear standing over him, and the picture was all feathers.
    if (cast.some((m) => present(m) && !own.has(m.id) && y < (m.y ?? 0) + m.height && Math.hypot(x - m.x, z - m.z) <= 0.35 + m.height * 0.15)) return undefined
    const lens = lensAt(position)
    return weigh(viewCost(sight, lens, all), extra.length ? viewCost(sight, lens, extra) : null) + crowding(x, y, z)
  }
  // The same of what is really drawn, when something can say.
  const truly = (position: Position) => {
    const lens = lensAt(position)
    const v = ask.truth?.(lens, all)
    if (!v) return undefined
    return weigh(v, extra.length ? (ask.truth?.(lens, extra) ?? null) : null) + crowding(position[0], position[1], position[2])
  }
  const [tx, ty, tz] = first.target
  const ox = first.position[0] - tx
  const oy = first.position[1] - ty
  const oz = first.position[2] - tz
  // The authored view is nearly always clear, and is asked for often: it is tried alone first.
  const asIs = fit([...first.position] as Position)
  const plain = cost(asIs)
  if (plain !== undefined && plain < FINE) {
    const real = truly(asIs)
    if (real === undefined || real < FINE) return { shot: { ...first, position: asIs }, moved: false, cost: real ?? plain }
  }
  // Someone in a room is framed from inside it if any spot there will do. A camera out on deck, looking in through
  // the door, is tried only when nowhere in the room can see them.
  const room = c && ask.rooms?.find(({ box: b }) => c.x > b[0] && c.z > b[2] && c.x < b[3] && c.z < b[5])?.box
  let views: { position: Position; moved: boolean; score: number; move: number }[] = []
  for (const pass of room ? [1, 0] : [0]) {
    for (const [scale, drawn] of SCALES)
      for (const [lift, raised] of LIFTS)
        for (const swing of SWINGS) {
          const a = (swing * Math.PI) / 180
          const position = fit([tx + (ox * Math.cos(a) + oz * Math.sin(a)) * scale, ty + oy + lift, tz + (oz * Math.cos(a) - ox * Math.sin(a)) * scale])
          const [x, y, z] = position
          if (room && pass && !(x > room[0] && y > room[1] && z > room[2] && x < room[3] && y < room[4] && z < room[5])) continue
          const view = cost(position)
          if (view === undefined) continue
          const move = drawn + raised + (Math.abs(swing) >= 135 ? 2.5 : Math.abs(swing) / 90)
          views.push({ position, moved: move > 0, score: view + move, move })
        }
    if (views.length) break
  }
  if (!views.length) return { shot: first, moved: false, cost: plain ?? Number.POSITIVE_INFINITY }
  // Stable, so of two views as good the one tried first is kept.
  views = views.map((v, i) => ({ v, i })).sort((p, q) => p.v.score - q.v.score || p.i - q.i).map(({ v }) => v)
  let best = views[0]
  if (ask.truth) {
    let found: (typeof views)[number] | undefined
    for (const v of views.slice(0, TRIES)) {
      const real = truly(v.position)
      if (real === undefined) break
      const score = real + v.move
      if (!found || score < found.score - 1e-9) found = { ...v, score }
      if (real < FINE) break
    }
    if (found) best = found
  }
  return { shot: { ...first, position: best.position }, moved: best.moved, cost: best.score }
}
