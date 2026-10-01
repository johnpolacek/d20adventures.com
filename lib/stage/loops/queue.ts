import * as THREE from "three"
import type { CrowdPerson } from "../figures/crowd"
import type { CastMember } from "../figures/standees"
import type { Rand } from "../kit/rng"

// A queue loop: an official works a line of people at a checkpoint, one group at a time. Ported from the Kordavos
// prototype's Director and generalized: the set says where the line runs and where people go (QueueLoopSpec), the staging
// says who works it, who the party is and what gets said (QueueLoopStaging).
//
//   arrive     the front group shuffles up to the head of the line
//   question   the official questions them; they answer, pay (a coin arcs to the counter), and pass through
//   held       the party has reached the front: the loop waits while the encounter's turns play out, until release()
//
// Those who pass walk through and are recycled: they reappear behind the stalls, walk back and rejoin at the tail.
// Named characters can stand in the line too (the party, and others the staging places): they pass into the city
// instead of being recycled. While they stand still they are the encounter's to move; when the line moves on, anyone
// who has stepped out walks back to their place first.
// A stalled loop finishes the exchange at the counter and then waits (the official busy with a cart) until resumed.
// Cues: `<id>:next` on every call, `<id>:called` when the party is called up, `<id>:front` once it stands at the front.

export interface QueueLoopSpec {
  id: string
  crowd: string
  path: [number, number][]
  station: [number, number]
  counter: [number, number, number]
  pass: [number, number][]
  passEnd: [number, number, number, number]
  castEnd: [number, number]
  recycle: { spawn: [number, number, number, number][]; via: [number, number][]; park: [number, number]; parkJitter: [number, number] }
  spacing: { within: number; between: number; pair: number }
}
export interface QueueLoopStaging {
  official: string
  party?: { members: string[]; position: number; lateral?: number[]; pair?: number }
  cast?: { members: string[]; position: number; lateral?: number[] }[]
  lines: { next: string[]; question: string[]; replies: string[]; fees: string[] }
}
export interface LoopHost {
  crowdPose: (p: CrowdPerson, x: number, z: number, ry: number, walk: number) => void
  say: (speaker: { castId: string } | { point: () => THREE.Vector3; name?: string }, text: string) => void
  cue: (name: string) => void
  coin: (from: THREE.Vector3, to: THREE.Vector3) => void
}

type Ent = {
  npc?: CrowdPerson
  cast?: CastMember
  d: number
  target: number
  delay: number
  lat: number
  route: [number, number][] | null
  phase: "queue" | "passing" | "parking" | "parked" | "returning" | "city"
  // A named character the loop is walking up the line (so it settles them, standing, when they arrive).
  shuffling?: boolean
}
type Group = { members: Ent[]; party?: boolean; cast?: boolean; fresh?: boolean }

class Path {
  seg: { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; d0: number; len: number }[] = []
  length = 0
  constructor(pts: [number, number][]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-4) continue
      this.seg.push({ ax, az, bx, bz, dx: (bx - ax) / len, dz: (bz - az) / len, d0: this.length, len })
      this.length += len
    }
  }
  at(d: number) {
    d = THREE.MathUtils.clamp(d, 0, this.length)
    const s = this.seg.find((q) => d <= q.d0 + q.len) || this.seg[this.seg.length - 1]
    const t = (d - s.d0) / s.len
    return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t, dx: s.dx, dz: s.dz }
  }
}

const WALK = 1.2
const SHUFFLE = 1.05

export class QueueLoop {
  readonly id: string
  // A paused loop freezes the line (the title card before play); walkers and life elsewhere carry on.
  paused = false
  stalled = false
  state: "arrive" | "question" | "held" = "arrive"
  groups: Group[] = []
  private waiting: Group[] = []
  private moving: Ent[] = []
  private coins: { mesh: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; t: number }[] = []
  private path: Path
  private t = 0
  private step = 0
  private tail = 0
  private official: CastMember | null
  private partyEnts: Ent[] = []
  private castOut = 0

  constructor(
    private spec: QueueLoopSpec,
    private staging: QueueLoopStaging | null,
    people: CrowdPerson[],
    cast: CastMember[],
    private host: LoopHost,
    private rand: Rand
  ) {
    this.id = spec.id
    this.path = new Path(spec.path)
    this.official = staging ? (cast.find((c) => c.id === staging.official) ?? null) : null
    const pool: Ent[] = people.map((p) => ({ npc: p, d: 0, target: 0, delay: 0, lat: rand(-0.14, 0.14), route: null, phase: "queue" }))
    const party = staging?.party
    if (party) {
      this.partyEnts = party.members.flatMap((id, i) => {
        const c = cast.find((m) => m.id === id)
        return c ? [{ cast: c, d: 0, target: 0, delay: 0, lat: party.lateral?.[i] ?? (i % 2 ? 0.3 : -0.3), route: null, phase: "queue" as const }] : []
      })
    }
    const queue = [...pool]
    while (queue.length) this.groups.push({ members: queue.splice(0, Math.min(queue.length, rand.pick([1, 2, 2, 3]))) })
    // Named groups and the party take their places in the line, front first.
    const placed: { position: number; group: Group }[] = []
    for (const g of staging?.cast ?? []) {
      const members = g.members.flatMap((id, i) => {
        const c = cast.find((m) => m.id === id)
        return c ? [{ cast: c, d: 0, target: 0, delay: 0, lat: g.lateral?.[i] ?? 0, route: null, phase: "queue" as const }] : []
      })
      if (members.length) placed.push({ position: g.position, group: { members, cast: true } })
    }
    if (this.partyEnts.length) placed.push({ position: party?.position ?? 0, group: { members: this.partyEnts, party: true } })
    for (const p of placed.sort((a, b) => a.position - b.position)) this.groups.splice(Math.min(p.position, this.groups.length), 0, p.group)
    this.layout(true)
    this.poseAll()
  }

  get partyPosition() {
    return this.groups.findIndex((g) => g.party)
  }
  // Where a member stands in the line, at their current distance along it.
  private slot(e: Ent) {
    const p = this.path.at(e.d)
    return { x: p.x - p.dz * e.lat, z: p.z + p.dx * e.lat }
  }
  // Who speaks for a place in the line: `group` counts from the front (0 is the group at the counter); `fromParty`
  // counts from the party's group (-1 is the group just ahead of them, 1 the one behind).
  speaker(at: { group?: number; fromParty?: number }): { castId: string } | { point: () => THREE.Vector3 } | null {
    const i = at.fromParty !== undefined ? this.partyPosition + at.fromParty : (at.group ?? 0)
    const e = this.groups[i]?.members[0]
    if (!e || (at.fromParty !== undefined && this.partyPosition < 0)) return null
    if (e.cast) return { castId: e.cast.id }
    const p = e.npc!
    return { point: () => new THREE.Vector3(p.x, 2.1 * p.s, p.z) }
  }
  private pos(e: Ent) {
    return e.cast ? { x: e.cast.x, z: e.cast.z } : { x: e.npc!.x, z: e.npc!.z }
  }
  private pose(e: Ent, x: number, z: number, ry: number, walking: boolean) {
    if (e.cast) {
      e.cast.x = x
      e.cast.z = z
      e.cast.ry = ry
      e.cast.walking = walking
    } else this.host.crowdPose(e.npc!, x, z, ry, walking ? 1 : 0)
  }
  private layout(instant = false) {
    const { within, between, pair } = this.spec.spacing
    let cursor = 0
    let k = 0
    const kept: Group[] = []
    for (const g of this.groups) {
      if (cursor + (g.members.length - 1) * within > this.path.length - 0.5) {
        this.waiting.push(g)
        for (const e of g.members) this.park(e)
        continue
      }
      kept.push(g)
      const perRow = g.party ? (this.staging?.party?.pair ?? 2) : 1
      g.members.forEach((e, j) => {
        e.target = cursor + Math.floor(j / perRow) * (perRow > 1 ? pair : within)
        e.delay = instant ? 0 : k * 0.09
        if (instant) e.d = e.target
        k++
      })
      cursor += Math.floor((g.members.length - 1) / perRow) * (perRow > 1 ? pair : within) + between
    }
    this.groups = kept
    this.tail = cursor
  }
  private park(e: Ent) {
    if (!e.npc) return
    const [px, pz] = this.spec.recycle.park
    const [jx, jz] = this.spec.recycle.parkJitter
    e.route = [[px + this.rand(-jx, jx), pz + this.rand(-jz, jz)]]
    e.phase = "parking"
  }
  private poseAll() {
    const front = this.groups[0]
    for (const g of this.groups)
      for (const e of g.members) {
        const p = this.path.at(e.d)
        const x = p.x - p.dz * e.lat
        const z = p.z + p.dx * e.lat
        const facing = g === front && (this.state === "question" || this.state === "held") ? Math.atan2(this.spec.station[0] - x, this.spec.station[1] - z) : Math.atan2(-p.dx, -p.dz)
        this.pose(e, x, z, facing, false)
      }
  }

  private say(e: Ent | "official", text: string) {
    if (e === "official") {
      if (this.official) this.host.say({ castId: this.official.id }, text)
      return
    }
    if (e.cast) this.host.say({ castId: e.cast.id }, text)
    else {
      const p = e.npc!
      this.host.say({ point: () => new THREE.Vector3(p.x, 2.1 * p.s, p.z) }, text)
    }
  }
  private line(kind: keyof QueueLoopStaging["lines"]) {
    const list = this.staging?.lines[kind] ?? []
    return list.length ? this.rand.pick(list) : null
  }

  // The front group walks through; everyone shuffles forward.
  next(quiet = false) {
    const front = this.groups.shift()
    if (!front) return
    const [ex0, ez0, ex1, ez1] = this.spec.passEnd
    front.members.forEach((e) => {
      e.phase = "passing"
      const end: [number, number] = e.cast ? this.castEnd() : [this.rand(ex0, ex1), this.rand(ez0, ez1)]
      e.route = [...this.spec.pass.map((p) => [...p] as [number, number]), end]
    })
    this.moving.push(...front.members)
    this.layout()
    this.state = "arrive"
    this.t = 0
    const n = quiet ? null : this.line("next")
    if (n) this.say("official", n)
    this.host.cue(`${this.id}:next`)
    if (this.groups[0]?.party) this.host.cue(`${this.id}:called`)
  }
  // Where the next named character to pass stops inside the city, so they don't stand on one another.
  private castEnd(): [number, number] {
    const k = this.castOut++
    return [this.spec.castEnd[0] + (k % 5) * 1.3, this.spec.castEnd[1] - Math.floor(k / 5) * 1.2 - (k % 2) * 0.5]
  }
  // The encounter is done with the party at the front: they pass and the line carries on.
  release() {
    if (this.state === "held") this.next(true)
  }
  // Skip ahead to the party's turn at the front (a player skipping the intro).
  skipToFront() {
    if (!this.groups.some((g) => g.party)) return
    while (this.groups[0] && !this.groups[0].party) {
      const g = this.groups.shift()!
      if (g.cast) {
        // Named characters ahead of the party have been through already.
        for (const e of g.members) {
          const [x, z] = this.castEnd()
          e.phase = "city"
          e.route = null
          this.pose(e, x, z, Math.PI, false)
        }
        continue
      }
      for (const e of g.members) e.phase = "queue"
      this.groups.push(g)
    }
    this.layout(true)
    this.host.cue(`${this.id}:called`)
    this.arrived()
  }
  private arrived() {
    const front = this.groups[0]
    if (!front) return
    if (front.party) {
      this.state = "held"
      this.poseAll()
      this.host.cue(`${this.id}:front`)
    } else {
      this.state = "question"
      this.t = 0
      this.step = 0
    }
  }

  update(dt: number) {
    if (this.paused) return
    const front = this.groups[0]
    this.t += dt
    if (this.state === "arrive" && front && front.members.every((e) => Math.abs(e.d - e.target) < 0.03)) this.arrived()
    if (this.state === "question" && front) {
      const cue = (i: number, at: number, fn: () => void) => {
        if (this.step === i && this.t > at) {
          fn()
          this.step++
        }
      }
      cue(0, 0.6, () => {
        const q = this.line("question")
        if (q) this.say("official", q)
      })
      cue(1, 3.2, () => {
        const r = this.line("replies")
        if (r) this.say(front.members[0], r)
      })
      cue(2, 5.6, () => {
        const f = this.line("fees")
        if (f) this.say("official", f)
      })
      cue(3, 7.4, () => {
        const p = this.pos(front.members[0])
        this.host.coin(new THREE.Vector3(p.x, 1.1, p.z), new THREE.Vector3(...this.spec.counter))
      })
      if (!this.stalled) cue(4, 8.8, () => this.next())
    }
    // Queue members creep forward in a ripple, facing the head of the line; the front group faces the official.
    for (const g of this.groups)
      for (const e of g.members) {
        if (e.delay > 0) e.delay -= dt
        const gap = e.target - e.d
        const moving = e.delay <= 0 && Math.abs(gap) > 0.02
        // Named characters standing still are the encounter's to move: the loop settles them once, standing, when their
        // shuffle up the line ends. When the line moves on, anyone who has stepped out walks back to their place first.
        if (e.cast && !moving) {
          if (e.shuffling) {
            e.shuffling = false
            const s = this.slot(e)
            const p = this.path.at(e.d)
            const facing = g === front && (this.state === "question" || this.state === "held") ? Math.atan2(this.spec.station[0] - s.x, this.spec.station[1] - s.z) : Math.atan2(-p.dx, -p.dz)
            this.pose(e, s.x, s.z, facing, false)
          }
          continue
        }
        if (e.cast) {
          e.shuffling = true
          const s = this.slot(e)
          const off = Math.hypot(s.x - e.cast.x, s.z - e.cast.z)
          if (off > 0.25) {
            const k = Math.min(1, (dt * WALK) / off)
            this.pose(e, e.cast.x + (s.x - e.cast.x) * k, e.cast.z + (s.z - e.cast.z) * k, Math.atan2(s.x - e.cast.x, s.z - e.cast.z), true)
            continue
          }
        }
        if (moving) e.d += Math.sign(gap) * Math.min(Math.abs(gap), dt * SHUFFLE)
        const p = this.path.at(e.d)
        const x = p.x - p.dz * e.lat
        const z = p.z + p.dx * e.lat
        const facing = g === front && !moving && (this.state === "question" || this.state === "held") ? Math.atan2(this.spec.station[0] - x, this.spec.station[1] - z) : Math.atan2(-p.dx, -p.dz)
        this.pose(e, x, z, facing, moving)
      }
    // Those who have paid walk through; those recycled walk back to the tail.
    for (const e of [...this.moving, ...this.waiting.flatMap((g) => g.members)]) {
      if (!e.route?.length) continue
      const [tx, tz] = e.route[0]
      const cur = this.pos(e)
      const dx = tx - cur.x
      const dz = tz - cur.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.15) {
        e.route.shift()
        if (!e.route.length) this.done(e)
        continue
      }
      const step = Math.min(dist, dt * WALK)
      this.pose(e, cur.x + (dx / dist) * step, cur.z + (dz / dist) * step, Math.atan2(dx, dz), true)
    }
    const w = this.waiting[0]
    if (w && this.tail + w.members.length * this.spec.spacing.within < this.path.length - 1 && w.members.every((e) => e.phase === "parked")) this.join(this.waiting.shift()!)
    for (const c of this.coins) {
      c.t += dt
      const k = Math.min(1, c.t / 0.8)
      c.mesh.position.lerpVectors(c.a, c.b, k)
      c.mesh.position.y += Math.sin(k * Math.PI) * 0.5
    }
  }
  private done(e: Ent) {
    this.moving = this.moving.filter((m) => m !== e)
    const at = this.pos(e)
    if (e.cast) {
      e.phase = "city"
      this.pose(e, at.x, at.z, Math.PI, false)
      return
    }
    if (e.phase !== "passing") {
      e.phase = "parked"
      this.pose(e, at.x, at.z, Math.PI, false)
      return
    }
    // Recycle: reappear behind the stalls and walk back to the end of the line.
    const r = this.spec.recycle
    const [sx0, sz0, sx1, sz1] = this.rand.pick(r.spawn)
    const sx = this.rand(sx0, sx1)
    const sz = this.rand(sz0, sz1)
    this.pose(e, sx, sz, 0, true)
    const via = r.via.reduce((best, v) => (Math.hypot(v[0] - sx, v[1] - sz) < Math.hypot(best[0] - sx, best[1] - sz) ? v : best), r.via[0])
    e.phase = "returning"
    e.route = [
      [via[0], via[1] + this.rand(-2, 2)],
      [r.park[0] + this.rand(-r.parkJitter[0], r.parkJitter[0]), r.park[1] + this.rand(-r.parkJitter[1], r.parkJitter[1])],
    ]
    let g = this.waiting.find((x) => x.members.length < 3 && x.fresh)
    if (!g) {
      g = { members: [], fresh: true }
      this.waiting.push(g)
    }
    g.members.push(e)
  }
  private join(g: Group) {
    g.fresh = false
    g.members.forEach((e, j) => {
      e.target = this.tail + j * this.spec.spacing.within
      e.d = Math.min(this.path.length, e.target + 2)
      e.delay = 0
      e.route = null
      e.phase = "queue"
    })
    this.tail += (g.members.length - 1) * this.spec.spacing.within + this.spec.spacing.between
    this.groups.push(g)
  }
  addCoin(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    this.coins.push({ mesh, a, b, t: 0 })
    setTimeout(() => {
      mesh.removeFromParent()
      this.coins = this.coins.filter((c) => c.mesh !== mesh)
    }, 900)
  }
}
