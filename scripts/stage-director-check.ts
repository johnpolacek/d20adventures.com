// Checks the stage's director (packages/stage/src/director.ts) and the reading of a turn's story into its moments
// (apps/desktop/src/moments.ts): each kind of moment gets the take it should, and the grammar holds across a turn.
import assert from "node:assert/strict"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { compose, type Moment, planTakes } from "@d20/stage/director"
import type { CastMember } from "@d20/stage/figures/standees"
import { storyMoments, toneOf } from "../apps/desktop/src/moments"

const member = (id: string, x: number, z: number, ry: number, height = 1.75, voice?: "beast"): CastMember => ({
  id,
  name: id,
  role: "",
  height,
  art: { front: "/stage/x.png" },
  x,
  z,
  ry,
  walking: false,
  walk: 0,
  stride: 0,
  voice,
})
// Hero and foe face each other four metres apart, a bear off to the side.
const cast = [member("hero", 0, 0, 0), member("foe", 0, 4, Math.PI), member("bear", 6, 4, -Math.PI / 2, 2.6, "beast")]
const ctx = { cast }
const shoot = (m: Moment, seed = "t") => {
  const [plan] = planTakes([m], seed)
  const take = compose(plan!, ctx)
  assert.ok(take, `no take for ${m.kind}`)
  return take
}
let checks = 0
const check = (name: string, fn: () => void) => {
  fn()
  checks++
  console.log(`ok ${name}`)
}

check("a crit cuts in and lands hard", () => {
  const t = shoot({ kind: "strike", actor: "hero", target: "foe", outcome: "crit" })
  assert.equal(t.cut, true)
  assert.equal(t.impact?.on, "land")
  assert.equal(t.impact?.shake, 1)
  assert.ok((t.move?.push ?? 0) > 0.1)
  assert.ok(t.move?.roll)
})
check("a plain hit snaps and jolts less", () => {
  const t = shoot({ kind: "strike", actor: "hero", target: "foe", outcome: "hit" })
  assert.equal(t.cut, false)
  assert.equal(t.ease, "snap")
  assert.ok((t.impact?.shake ?? 0) < 1)
})
check("a miss is side on, with no jolt", () => {
  const t = shoot({ kind: "strike", actor: "hero", target: "foe", outcome: "miss" })
  assert.equal(t.impact, undefined)
  assert.ok("position" in t.shot)
  // The camera stands off the line between them.
  if ("position" in t.shot) assert.ok(Math.abs(t.shot.position[0]) > 2)
})
check("a death lifts away after the fall", () => {
  const t = shoot({ kind: "kill", victim: "foe", killer: "hero" })
  assert.ok((t.move?.rise ?? 0) > 2)
  assert.ok((t.move?.push ?? 0) < 0)
  assert.ok((t.move?.delay ?? 0) > 0.5)
  assert.equal(t.cut, true)
})
check("a monster comes on from low", () => {
  const t = shoot({ kind: "entrance", who: "bear", monster: true, from: [14, 4], home: [6, 4] })
  assert.ok("position" in t.shot && t.shot.position[1] < 1)
  assert.equal(t.cut, true)
})
check("a monster that prowls on is one long take from low that holds its ground", () => {
  const t = shoot({ kind: "entrance", who: "bear", monster: true, from: [14, 4], home: [6, 4], speed: 0.45 })
  assert.equal(t.label, "monster prowls in")
  assert.equal(t.planted, true)
  assert.ok((t.move?.seconds ?? 0) >= 8 / 0.45)
  assert.ok((t.move?.push ?? 0) > 0)
  assert.ok("position" in t.shot && t.shot.position[1] < 1 && t.shot.position[0] < 6)
  assert.ok(Math.abs(t.shot.orbit ?? 0) > 0 && Math.abs(t.shot.orbit ?? 0) < 3)
  assert.ok(!t.impact && !t.move?.roll)
})
check("a tense line pushes in close and tilts", () => {
  const t = shoot({ kind: "line", speaker: "foe", listener: "hero", tone: "tense" })
  assert.ok("subject" in t.shot && t.shot.distance < 2.5 && t.shot.fov <= 34)
  assert.ok(t.move?.roll)
  assert.ok((t.move?.push ?? 0) >= 0.12)
})
check("a quiet word is over the listener's shoulder", () => {
  const t = shoot({ kind: "line", speaker: "foe", listener: "hero", tone: "calm" })
  assert.ok("position" in t.shot)
  if ("position" in t.shot) assert.ok(t.shot.position[2] < 0, "behind the hero, looking at the foe")
  assert.equal(t.move?.roll, undefined)
})
check("no shot over the shoulder with someone standing in the look", () => {
  const crowd = [...cast, member("guard", 0, 3, Math.PI)]
  const [plan] = planTakes([{ kind: "line", speaker: "foe", listener: "hero", tone: "calm" }], "t")
  const t = compose(plan!, { cast: crowd })
  assert.notEqual(t?.label, "over the shoulder")
})
check("a spell across a cabin keeps the camera inside its walls", () => {
  // Walls two metres either side of the pair: a spot beyond them is not clear.
  const [plan] = planTakes([{ kind: "spell", actor: "hero", target: "foe", outcome: "hit" }], "t")
  const t = compose(plan!, { cast, clear: (_from, at) => Math.abs(at.x) < 2 })
  assert.ok(t && "position" in t.shot && Math.abs(t.shot.position[0]) < 2)
})
check("a party split across the set gets no establishing shot", () => {
  const [together] = planTakes([{ kind: "establish", party: ["hero", "foe"] }], "t")
  assert.ok(compose(together!, ctx))
  const split = [...cast, member("scout", 20, 9, 0)]
  const [apartPlan] = planTakes([{ kind: "establish", party: ["hero", "scout"] }], "t")
  assert.equal(compose(apartPlan!, { cast: split }), null)
})
check("a tense line and a quiet one look different", () => {
  const a = shoot({ kind: "line", speaker: "foe", listener: "hero", tone: "tense" })
  const b = shoot({ kind: "line", speaker: "foe", listener: "hero", tone: "calm" })
  assert.notEqual(a.label, b.label)
  assert.notDeepEqual(a.shot, b.shot)
})
check("shot and reverse shot keep the same side of the line", () => {
  const plans = planTakes(
    [
      { kind: "line", speaker: "foe", listener: "hero", tone: "calm" },
      { kind: "line", speaker: "hero", listener: "foe", tone: "calm" },
    ],
    "turn-1"
  )
  const [a, b] = plans.map((p) => compose(p!, ctx)!)
  assert.ok("position" in a.shot && "position" in b.shot)
  if (!("position" in a.shot && "position" in b.shot)) return
  // Hero and foe stand on x = 0. Both cameras stand off to the same side of that line.
  assert.equal(Math.sign(a.shot.position[0]), Math.sign(b.shot.position[0]))
})
check("the same framing twice gets a variant", () => {
  const m: Moment = { kind: "check", actor: "hero", success: true, natural: 12 }
  const [p, q] = planTakes([m, m], "seed")
  assert.equal(q!.variant, p!.variant + 1)
})
check("every player sees the same takes", () => {
  const ms: Moment[] = [
    { kind: "windup", actor: "hero", target: "foe", outcome: "hit" },
    { kind: "strike", actor: "hero", target: "foe", outcome: "hit" },
  ]
  assert.deepEqual(planTakes(ms, "turn-9"), planTakes(ms, "turn-9"))
})
check("tones", () => {
  assert.equal(toneOf("Come closer.", "whispered", false), "hushed")
  assert.equal(toneOf("Get down!", "shouting", false), "loud")
  assert.equal(toneOf("You will regret this.", "coldly", false), "tense")
  assert.equal(toneOf("Welcome, travellers.", undefined, false), "calm")
  assert.equal(toneOf("Welcome, travellers.", undefined, true), "tense")
})
check("a crit roll and the blow after it read as a crit", () => {
  const by = { step: "roll" as const, character: "h" }
  const paragraphs: { beats: StoryBeat[] }[] = [
    { beats: [{ kind: "roll", by, character: "h", name: "Hero", check: "Attack", natural: 20, total: 25, dc: 13, success: true, attack: { target: "f", critical: true } }] },
    { beats: [{ kind: "narration", by, text: "The blade bites deep." }] },
  ]
  const ids: Record<string, string> = { h: "hero", f: "foe" }
  const moments = storyMoments(paragraphs, {
    castOf: (id) => (id ? ids[id] : undefined),
    big: () => false,
    killed: () => [],
    dropped: () => [],
    arriving: () => undefined,
    effects: (i) => (i === 1 ? [{ actor: "hero", target: "foe", kind: "slash", miss: false }] : []),
    party: ["hero"],
  })
  assert.deepEqual(moments[0], { kind: "windup", actor: "hero", target: "foe", outcome: "crit" })
  assert.deepEqual(moments[1], { kind: "strike", actor: "hero", target: "foe", outcome: "crit", ranged: false })
})
console.log(`${checks} checks passed`)
