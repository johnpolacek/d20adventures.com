import assert from "node:assert/strict"
import { test } from "node:test"
import {
  StageChoreographer,
  type ChoreographerCallbacks,
  type ChoreographerStage,
  type ChoreographySnapshot,
} from "./stage-choreographer"

function mockStage() {
  const listeners = new Set<(shot: string | null) => void>()
  const onStage = new Set<string>(["branka", "owlbear"])
  const down = new Set<string>()
  const low = new Set<string>()
  const shotsCalled: { which: unknown; opts?: unknown }[] = []
  const placed: { id: string; at: unknown }[] = []
  const moved: { id: string; to: [number, number] }[] = []
  const sounds: { cue: string; actor?: string }[] = []
  const turnRings: (string | null)[] = []
  const weapons: { id: string; weapon: string | null }[] = []
  let activeShot: string | null = null

  const cast = [
    { id: "branka", name: "Branka", x: 0, y: 0, z: 0, ry: 0, height: 1.4, voice: "human" },
    { id: "owlbear", name: "Owlbear", x: 4, y: 0, z: 4, ry: 0, height: 2.5, voice: "beast" },
  ]

  const stage: ChoreographerStage = {
    get activeShot() {
      return activeShot
    },
    cast: cast as never,
    loops: new Map() as never,
    set: { marks: { trees: { at: [8, 8] }, clearing: { at: [2, 2] } } } as never,
    staging: {
      shot: "opening",
      cast: [
        { id: "branka", at: [0, 0], facing: 0 },
        { id: "owlbear", at: [4, 4], facing: 0 },
      ],
      shots: {},
    } as never,
    shots: { opening: { position: [0, 2, 6], target: [0, 1, 0], fov: 45, label: "Opening" } } as never,
    castAt: (id) => cast.find((c) => c.id === id) as never,
    circleOn: () => {},
    effect: async () => {},
    faceCast: () => {},
    isDown: (id) => down.has(id),
    isLow: (id) => low.has(id),
    isOnStage: (id) => onStage.has(id),
    keepObject: () => {},
    moveCast: async (id, to) => {
      moved.push({ id, to: to as [number, number] })
    },
    onShotChange: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    placeCast: (id, at) => {
      placed.push({ id, at })
    },
    point: (p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: 8, z: 8 }) as never,
    prop: async () => {},
    reach: () => ({ blocked: false, short: false, distance: 10, x: 10, z: 10 }) as never,
    readyWeapon: (id, weapon) => {
      weapons.push({ id, weapon })
      return true
    },
    route: (_id, to) => [{ x: to.x, z: to.z }] as never,
    sees: () => true,
    setDown: (id, v) => {
      if (v) down.add(id)
      else down.delete(id)
    },
    setLow: (id, v) => {
      if (v) low.add(id)
      else low.delete(id)
    },
    setOnStage: (id, v) => {
      if (v) onStage.add(id)
      else onStage.delete(id)
    },
    setTurn: (id) => {
      turnRings.push(id)
    },
    shot: (which, opts) => {
      shotsCalled.push({ which, opts })
      const next = typeof which === "string" ? which : null
      if (activeShot !== next) {
        activeShot = next
        for (const fn of listeners) fn(next)
      }
      return true
    },
    shotSettled: () => Promise.resolve(),
    sound: (cue, actor) => {
      sounds.push({ cue, actor })
    },
  }

  return { stage, shotsCalled, placed, moved, sounds, turnRings, weapons, onStage, down, listeners }
}

function baseSnapshot(overrides: Partial<ChoreographySnapshot> = {}): ChoreographySnapshot {
  return {
    turnId: "t1",
    shown: { adventureId: "adv-1", encounterId: "enc-1", characters: [] },
    isSameTurnAsShown: true,
    priorCharacters: undefined,
    reading: true,
    paragraph: 0,
    started: true,
    heard: Number.POSITIVE_INFINITY,
    holding: false,
    actorId: "branka",
    actorCastId: "branka",
    ringedCastId: "branka",
    openingAt: -1,
    heroes: ["branka"],
    text: ["Branka steps forward."],
    paragraphs: [{ text: "Branka steps forward.", beats: [] }],
    beatsView: { subject: "branka" },
    lead: undefined,
    plan: null,
    spots: new Map(),
    cues: [],
    arriving: undefined,
    exits: new Map(),
    departing: undefined,
    walks: [],
    staged: new Map(),
    sounded: new Map(),
    readied: "",
    inHand: "",
    castOf: (id) => id,
    ...overrides,
  }
}

test("CameraPhase transitions cleanly through unframed -> preview -> establish_hold -> paragraph -> actor -> manual", async () => {
  const { stage, shotsCalled } = mockStage()
  const activeShots: (string | null)[] = []
  const callbacks: ChoreographerCallbacks = {
    onProwlingChange: () => {},
    onHandedOver: () => {},
    onActiveShotChange: (s) => activeShots.push(s),
    onError: () => {},
  }
  const c = new StageChoreographer(stage, callbacks, { timers: { establishMs: 20, revealMs: 10, fallMs: 10, fxSettleMs: 10 } })
  const phase = () => c.camera.phase
  try {
    assert.equal(phase(), "unframed")
    // Initial opening shot triggered onActiveShotChange immediately.
    assert.deepEqual(activeShots, ["opening"])

    // Preview while waiting for narrator/tour.
    c.sync(baseSnapshot({ started: false, openingAt: 0 }))
    assert.equal(phase(), "preview")

    // Live start on opening paragraph enters establish_hold.
    c.sync(baseSnapshot({ started: true, openingAt: 0 }))
    assert.equal(phase(), "establish_hold")

    // Re-syncing during establish_hold does not cut it short.
    c.sync(baseSnapshot({ started: true, openingAt: 0 }))
    assert.equal(phase(), "establish_hold")

    // Once hold elapses, transitions into paragraph phase.
    await new Promise((r) => setTimeout(r, 35))
    assert.equal(phase(), "paragraph")

    // Repeat sync on same paragraph deduplicates shots.
    const countBefore = shotsCalled.length
    c.sync(baseSnapshot({ started: true, openingAt: 0 }))
    assert.equal(shotsCalled.length, countBefore)

    // Clearing replay shot allows the paragraph shot to fire again.
    c.clearReplayShot()
    c.sync(baseSnapshot({ started: true, openingAt: 0 }))
    assert.equal(shotsCalled.length, countBefore + 1)

    // Leaving reading enters actor close-up phase.
    c.sync(baseSnapshot({ reading: false, actorId: "branka", actorCastId: "branka" }))
    assert.deepEqual(c.camera, { phase: "actor", actorId: "branka" })

    // Manual focus: first click focuses and returns true; second click returns false (open sheet).
    assert.equal(c.focusCharacter("owlbear", "owlbear"), true)
    assert.deepEqual(c.camera, { phase: "manual", targetId: "owlbear" })
    assert.equal(c.focusCharacter("owlbear", "owlbear"), false)

    // Manual named shot emits activeShot update via subscription without polling.
    c.selectShot("opening")
    assert.deepEqual(c.camera, { phase: "manual", targetId: null })
    assert.equal(activeShots[activeShots.length - 1], "opening")
  } finally {
    c.dispose()
  }
})

test("per-cast AbortController cancels prowling entrance and fall timers on step-back or dispose", async () => {
  const { stage, down, moved } = mockStage()
  const prowlEvents: [string, boolean][] = []
  const c = new StageChoreographer(
    stage,
    {
      onProwlingChange: (k, v) => prowlEvents.push([k, v]),
      onHandedOver: () => {},
      onActiveShotChange: () => {},
      onError: () => {},
    },
    { timers: { establishMs: 20, revealMs: 25, fallMs: 25, fxSettleMs: 10 } }
  )

  const prowlCue = { cast: "owlbear", from: "trees" as const, when: "", speed: 0.5, sneak: false, here: false, at: 1, s: 0 }
  // Reach paragraph 1 -> owlbear starts prowling entrance (entering state).
  c.sync(baseSnapshot({ paragraph: 1, cues: [prowlCue] }))
  assert.equal(c.actorState("owlbear").kind, "entering")
  assert.deepEqual(prowlEvents, [["owlbear:1", true]])

  // Step back to paragraph 0 before reveal delay completes -> aborts entrance cleanly and clears prowling.
  c.sync(baseSnapshot({ paragraph: 0, cues: [prowlCue] }))
  assert.equal(c.actorState("owlbear").kind, "idle")
  assert.deepEqual(prowlEvents, [
    ["owlbear:1", true],
    ["owlbear:1", false],
  ])
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(moved.length, 0)

  // Start a fall timer on paragraph 1, then dispose before it fires -> timer is cancelled and cast stays up.
  const exits = new Map([["owlbear", { run: false, speed: 2.4, at: 1, s: 0 }]])
  c.sync(baseSnapshot({ paragraph: 1, exits }))
  assert.equal(c.actorState("owlbear").kind, "falling")
  c.dispose()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(down.has("owlbear"), false)
})

test("dispose unsubscribes onShotChange and stops late callbacks", () => {
  const { stage, listeners } = mockStage()
  const seen: (string | null)[] = []
  const c = new StageChoreographer(stage, {
    onProwlingChange: () => {},
    onHandedOver: () => {},
    onActiveShotChange: (s) => seen.push(s),
    onError: () => {},
  })
  assert.equal(listeners.size, 1)
  c.dispose()
  assert.equal(listeners.size, 0)
  stage.shot("opening")
  assert.deepEqual(seen, ["opening"])
})
