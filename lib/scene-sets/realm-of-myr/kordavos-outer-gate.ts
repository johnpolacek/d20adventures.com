// Set: the outer gate of Kordavos — the road, queue and checkpoint in front of the
// city gatehouse during the Harvest Festival. Rebuilt from the standalone exemplar
// at scripts/scene-pipeline/exemplars/the-gates-of-kordavos against scene-kit.
//
// Encounters: the-gates-of-kordavos (march-of-davos).

import * as THREE from "three"
import {
  type BuilderContext,
  barrel,
  birchTree,
  box,
  brazier,
  campfire,
  crate,
  createBirds,
  createDust,
  createEnvironment,
  createGodRays,
  createGrassField,
  createGround,
  createPavedArea,
  createWildflowers,
  critter,
  curtainWall,
  cyl,
  ENVIRONMENT_PRESETS,
  gateBlock,
  gateDoors,
  handcart,
  hangBanner,
  hayBale,
  henCrate,
  horse,
  inspectionTable,
  leaningSpear,
  noticeBoard,
  pavilion,
  randomTraveler,
  resolveArch,
  restingTravelers,
  rollingMeadow,
  ropeLine,
  type SceneSet,
  type SetContext,
  type SetDefinition,
  StandeeLibrary,
  StandeeSystem,
  sack,
  stagTotem,
  torchPole,
  tower,
  wagon,
} from "@/lib/scene-kit"

const ARCH = resolveArch({ w: 6.4, spring: 5.2, r: 5.6 })

/** Wagon keep-clear boxes for the queue: x, z, half-width, half-length. */
const WAGON_ZONES: [number, number, number, number][] = [
  [-2.4, 10, 1.9, 4.2],
  [2.7, 18, 2.0, 4.4],
  [-2.8, 26, 1.9, 4.0],
  [3.0, 33.5, 2.0, 4.6],
]
const blockedByWagon = (x: number, z: number) => WAGON_ZONES.some(([wx, wz, hw, hl]) => Math.abs(x - wx) < hw && Math.abs(z - wz) < hl)

async function build(ctx: SetContext): Promise<SceneSet> {
  const { scene, renderer, time, rng, materials: M, fire, toggles, progress } = ctx
  const b: BuilderContext = { materials: M, rng, time, fire }
  const root = new THREE.Group()
  const animated: SceneSet["animated"] = [fire]
  const groundHeight = rollingMeadow()
  const place = (object: THREE.Object3D, x: number, z: number, ry = 0, parent: THREE.Object3D = root) => {
    object.position.set(x, groundHeight(x, z), z)
    object.rotation.y = ry
    parent.add(object)
    return object
  }

  const preset = toggles.timeOfDay === "night" ? ENVIRONMENT_PRESETS.night : toggles.timeOfDay === "dusk" ? ENVIRONMENT_PRESETS.goldenHour : ENVIRONMENT_PRESETS.autumnMorning
  const environment = createEnvironment(scene, renderer, time, preset)
  await progress("Painting the crowd…")
  const standees = await StandeeLibrary.load("/standees/realm-of-myr")
  const people = new StandeeSystem()
  animated.push(people)
  /** A standee with its feet on the ground at (x, z), planted at `facing` (yaw radians, 0 = +Z). */
  const person = (id: string, x: number, z: number, facing: number) => place(people.add(standees.get(id), { facing }), x, z, 0)
  const someone = (x: number, z: number, facing: number) => place(people.add(standees.pick(rng, "standing"), { facing }), x, z, 0)

  // ---- terrain -------------------------------------------------------------
  await progress("Laying the road…")
  root.add(createGround(M, { heightFn: groundHeight, road: { apron: { x: 0, z: -1, radius: 6 } } }))
  root.add(createPavedArea(M, { width: 46, depth: 54, z: -23 }))

  await progress("Sowing the meadow…")
  root.add(
    createGrassField(M, time, {
      count: 110000,
      heightFn: groundHeight,
      rng: rng.fork(0x9a55),
      sample: (r) => {
        const near = r.chance(0.7)
        const x = near ? r.range(-34, 34) : r.range(-80, 80)
        const z = near ? r.range(-1, 36) : r.range(-1, 90)
        if (Math.abs(x) < 3.6 + r.value() * 1.2 && z > -2) return null
        if (z < 0 && Math.abs(x) < 24) return null
        if (z < 2.6 && Math.abs(x) < 10) return null
        return [x, z]
      },
    })
  )
  root.add(
    createWildflowers(M, time, {
      count: 2600,
      heightFn: groundHeight,
      rng: rng.fork(0xf10),
      sample: (r) => {
        const x = r.range(-45, 45)
        const z = r.range(0, 45)
        if (Math.abs(x) < 4.5 || (z < 2.6 && Math.abs(x) < 10)) return null
        return [x, z]
      },
    })
  )
  for (const [x, z, s] of [
    [-14, 9, 1.1],
    [-20, 19, 1.3],
    [-27, 7, 0.9],
    [15, 14, 1.2],
    [22, 26, 1.0],
    [18, 5, 0.85],
    [-16, 31, 1.15],
    [30, 9, 1.1],
    [-36, 24, 1.2],
    [36, 30, 0.95],
  ])
    root.add(birchTree(M, rng, groundHeight, x, z, s))

  // ---- gatehouse -----------------------------------------------------------
  await progress("Raising the gatehouse…")
  const gate = gateBlock(b, { arch: ARCH })
  root.add(gate)
  const towers: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const t = curtainTower(b, s)
    t.position.set(s * 6.4, 0, 0)
    root.add(t)
    towers.push(t)
  }
  for (const s of [-1, 1]) {
    const t = towers[s < 0 ? 0 : 1]
    const a = hangBanner(b, M.asterianTex, 1.9, 7.6, { wind: 0.9, phase: s * 1.3 })
    a.position.set(-1.15, 13.2, 3.35)
    t.add(a)
    const v = hangBanner(b, M.valkaranTex, 1.9, 7.0, { wind: 1.15, phase: s * 2.9 + 1, tatter: true })
    v.position.set(1.15, 13.2, 3.35)
    t.add(v)
    const back = hangBanner(b, M.valkaranTex, 2.0, 6.5, { wind: 1.0, phase: s * 0.7 + 4, tatter: true })
    back.position.set(0, 12.4, -3.35)
    back.rotation.y = Math.PI
    t.add(back)
  }
  for (const [x, y, z, w, h, phase, valkaran] of [
    [-4.6, 10.3, 3.5, 1.6, 6.2, 0.4, 0],
    [4.6, 10.3, 3.5, 1.6, 6.2, 2.2, 0],
    [-2.2, 13.1, 3.6, 1.5, 3.4, 3.1, 1],
    [2.2, 13.1, 3.6, 1.5, 3.4, 5.3, 1],
  ]) {
    const banner = hangBanner(b, valkaran ? M.valkaranTex : M.asterianTex, w, h, { wind: valkaran ? 1.1 : 0.8, phase, tatter: !!valkaran })
    banner.position.set(x, y, z)
    gate.add(banner)
  }
  await progress("Extending the walls…")
  root.add(curtainWall(b, { sign: -1, pennant: M.plainRedTex }))
  root.add(curtainWall(b, { sign: 1, pennant: M.plainRedTex }))
  gate.add(gateDoors(b, ARCH))

  // ---- atmosphere ----------------------------------------------------------
  await progress("Letting in the light…")
  root.add(createGodRays(time, { halfWidth: ARCH.w / 2, springHeight: ARCH.apex }))
  root.add(createDust(time, rng.fork(0xd057), { pixelRatio: renderer.getPixelRatio() }))
  const birds = createBirds(rng.fork(0xb1d))
  root.add(birds.group)
  animated.push(birds)

  // ---- wagons, horses, riders -----------------------------------------------
  await progress("Gathering the travelers…")
  for (const [type, horses, x, z, ry, driver] of [
    ["covered", 1, -2.4, 10, Math.PI + 0.05, true],
    ["hay", 2, 2.7, 18, Math.PI - 0.04, true],
    ["barrels", 1, -2.8, 26, Math.PI + 0.08, true],
    ["covered", 2, 3.0, 33.5, Math.PI - 0.06, true],
    ["hay", 0, -8.0, 14.5, Math.PI + 0.9, false],
    ["barrels", 0, 8.6, 24, Math.PI - 1.1, false],
  ] as const)
    place(wagon(b, { type, horses, driver: driver ? people.add(standees.get("seated-driver"), { facing: 0 }) : false }), x, z, ry)
  const looseHorse = (x: number, z: number, ry: number, opts: Parameters<typeof horse>[1]) => place(horse(b, opts), x, z, ry)
  looseHorse(-9.2, 18.5, 2.3, { grazing: true, harness: false })
  looseHorse(-10.5, 17, 2.8, { grazing: true, harness: false, color: 0x8c8880 })
  looseHorse(9.5, 27.5, -1.2, { grazing: true, harness: false })
  looseHorse(6.6, 9.2, -0.5, { saddle: true, harness: false })
  looseHorse(-6.2, 37, 2.9, { saddle: true, harness: false, color: 0x2a2220 })
  looseHorse(7.4, 42, -2.6, { grazing: true, harness: false, color: 0xa8865a })
  for (const [x, z, ry, color] of [
    [5.8, 39, Math.PI - 0.3, 0x5a3a22],
    [-6.8, 29, Math.PI + 0.4, 0x8c8880],
  ]) {
    const mount = looseHorse(x, z, ry, { saddle: true, harness: false, color })
    const rider = randomTraveler(b, { seated: true, noProps: true })
    rider.position.set(0, 0.84, -0.05)
    mount.add(rider)
  }
  someone(6.1, 8.4, Math.PI - 0.7)

  // ---- the queue -----------------------------------------------------------
  for (let i = 0; i < 58; i++) {
    const z = 4.4 + i * 0.78 + rng.range(-0.15, 0.15)
    const x = Math.sin(i * 0.31) * 1.1 + rng.range(-0.35, 0.35)
    const spots: [number, number][] = [[x, z]]
    if (rng.chance(0.45)) spots.push([x + rng.range(0.65, 1.05) * rng.sign(), z + rng.range(-0.3, 0.3)])
    for (const [sx, sz] of spots) {
      if (blockedByWagon(sx, sz)) continue
      someone(sx, sz, Math.PI + rng.range(-0.7, 0.7))
    }
  }
  for (const [cx, cz, n] of [
    [-5.6, 8.5, 4],
    [5.4, 13.5, 3],
    [-6.4, 21, 4],
    [6.4, 29, 3],
    [-5.4, 32, 3],
    [5.6, 45, 4],
    [-4.9, 47, 3],
    [-4.5, 41, 3],
  ])
    for (let i = 0; i < n; i++) someone(cx + rng.range(-1.1, 1.1), cz + rng.range(-1.1, 1.1), rng.value() * 6.28)
  for (let i = 0; i < 16; i++) {
    const z = rng.range(4.2, 12.5)
    const x = rng.sign() * rng.range(1.4, 2.0)
    if (blockedByWagon(x, z)) continue
    someone(x, z, Math.PI + rng.range(-1.2, 1.2))
  }
  for (let i = 0; i < 2; i++) person("standing-child", -6.5 + rng.range(-1, 1), 7.5 + rng.range(-0.8, 0.8), rng.value() * 6.28)

  // roadside cargo
  const drop = (object: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    object.position.set(x, groundHeight(x, z) + y, z)
    object.rotation.y = ry
    root.add(object)
  }
  drop(crate(b, 0.7, 0.5, 0.7), -3.9, 0.25, 7.0, 0.4)
  drop(crate(b, 0.5, 0.45, 0.5), -3.9, 0.72, 7.0, 0.9)
  drop(sack(b), -3.3, 0, 6.2)
  drop(sack(b, 0.85), -4.1, 0, 5.9)
  drop(crate(b, 0.8, 0.56, 0.6), 4.2, 0.28, 7.2, -0.3)
  drop(sack(b, 1.05), 4.9, 0, 6.7)
  drop(sack(b, 0.9), 4.0, 0, 8.0)
  drop(barrel(b), 5.0, 0.4, 8.1)
  drop(crate(b, 0.6, 0.44, 0.5), -5.2, 0.22, 15.5, 0.2)
  drop(sack(b, 0.9), -4.6, 0, 16.2)
  drop(barrel(b), -7.6, 0.4, 12.2)
  drop(crate(b, 0.7, 0.5, 0.7), 8.2, 0.25, 21.5, 0.5)

  // ---- checkpoint ----------------------------------------------------------
  await progress("Posting the guard…")
  place(inspectionTable(b), 2.75, 3.7, -0.35)
  for (let i = 0; i < 2; i++) place(leaningSpear(b), 4.3 + i * 0.35, 3.2 - i * 0.2)
  place(brazier(b), 3.7, 5.3)
  person("npc-garlan-ironfist", 1.5, 3.3, 0.35)
  for (const [x, z, ry, spear] of [
    [-2.9, 3.7, -0.3, 1],
    [3.9, 5.0, -2.4, 0],
    [-4.3, 9.5, 0.4, 1],
    [4.6, 14.5, -2.8, 1],
    [-4.2, 22, 0.2, 1],
    [4.9, 29, -2.9, 1],
    [-4.6, 36, 0.5, 1],
  ])
    person(spear ? "guard-spear" : "guard-sword", x, z, ry)
  for (const [x, z, ry] of [
    [-2.0, 1.8, 0.3],
    [2.4, 1.8, -0.2],
  ]) {
    const sentry = people.add(standees.get("guard-spear"), { facing: ry })
    sentry.position.set(x, 13.2, z)
    root.add(sentry)
  }
  for (const s of [-1, 1]) {
    const posts: [number, number, number][] = []
    for (let i = 0; i < 8; i++) {
      const x = s * 2.15 + rng.range(-0.08, 0.08)
      const z = 4.2 + i * 2.3
      posts.push([x, groundHeight(x, z), z])
    }
    root.add(ropeLine(b, posts))
  }
  for (const [x, z] of [
    [-4.4, 4.6],
    [4.9, 4.4],
    [-2.6, 14],
    [2.9, 22.5],
  ])
    place(torchPole(b), x, z)
  place(noticeBoard(b), 5.3, 4.1, -0.6)

  // ---- roadside dressing ---------------------------------------------------
  await progress("Dressing the road…")
  const tent = pavilion(b, {
    wall: M.cloth("pavilion-wall", { color: [0.16, 0.28, 0.6], weave: 4, noise: 0.1, fade: 0.15 }),
    roof: M.cloth("pavilion-roof", { color: [0.16, 0.28, 0.6], weave: 4, noise: 0.1, fade: 0.15, stripes: { n: 12, a: [0.16, 0.28, 0.6], b: [0.85, 0.68, 0.3] } }),
    pennant: M.asterianTex,
  })
  place(tent, 8.2, 7, -0.5)
  const tentCrate = crate(b, 0.7, 0.5, 0.6)
  tentCrate.position.set(1.2, 0.25, 2.4)
  tentCrate.rotation.y = 0.4
  tent.add(tentCrate)
  const tentBarrel = barrel(b)
  tentBarrel.position.set(-1.4, 0.4, 2.5)
  tent.add(tentBarrel)
  tent.add(box(0.9, 0.05, 0.5, M.wood(1, 1), 0.2, 0.75, 2.6))
  for (let i = 0; i < 3; i++) {
    const spear = leaningSpear(b)
    spear.position.set(-2.2 + i * 0.25, 0, 1.2)
    spear.rotation.z = 0.25
    tent.add(spear)
  }
  place(stagTotem(b), -5.0, 5.2, 0.4)

  const camp = new THREE.Group()
  place(camp, -7.2, 10)
  camp.add(campfire(b))
  camp.add(restingTravelers(b, { makeFigure: (facing) => people.add(standees.pick(rng, "seated"), { facing }) }))
  camp.add(cyl(0.16, 0.12, 0.22, M.ironDark, -0.6, 0.42, 0.7, 10))
  const campSack = sack(b, 0.8)
  campSack.position.set(1.6, 0, 1.2)
  camp.add(campSack)
  const campCrate = crate(b, 0.5, 0.45, 0.5)
  campCrate.position.set(-1.8, 0.22, -1.0)
  campCrate.rotation.y = 0.6
  camp.add(campCrate)

  place(handcart(b), 5.6, 12, -0.6)
  person("vendor-apron", 6.4, 13.4, -2.2)
  for (const [x, z, ry] of [
    [-6.6, 13.5, 0.3],
    [-7.4, 13.2, 0.4],
    [-7.0, 14.4, 0.2],
    [-6.9, 13.8, 0.35],
  ]) {
    const bale = hayBale(b)
    bale.position.set(x, groundHeight(x, z) + (z > 14 ? 0.6 : 0), z)
    bale.rotation.y = ry
    root.add(bale)
  }
  for (const [x, z] of [
    [-5.8, 12.2],
    [-5.3, 12.8],
  ])
    place(henCrate(b), x, z, rng.value() * 3)
  place(critter(b, { size: 0.9, color: 0xf0e8d8, horns: true }), -8.6, 12.6, 1.2)
  place(critter(b, { size: 0.8, color: 0xc8b8a0, horns: true }), -9.3, 13.4, 2.6)
  place(critter(b, { size: 0.85, color: 0x5a3a22, tailUp: true }), 3.2, 6.6, -2.4)
  place(critter(b, { size: 0.7, color: 0x2a2220, tailUp: true }), -6.0, 8.6, 0.4)
  place(critter(b, { size: 0.75, color: 0xd8c8a8, tailUp: true }), 7.4, 16.5, -1)

  return {
    id: kordavosOuterGate.id,
    title: kordavosOuterGate.title,
    root,
    marks: {
      checkpoint: { position: [1.2, groundHeight(1.2, 4.6), 4.6], facing: Math.PI, label: "Before the inspection table, facing the captain" },
      queue: { position: [0.3, groundHeight(0.3, 12), 12], facing: Math.PI, label: "In the queue, a few wagons back from the gate" },
      roadside: { position: [-5.5, groundHeight(-5.5, 9), 9], facing: Math.PI * 0.5, label: "Off the road by the campfire" },
      portal: { position: [0, 0, -1], facing: 0, label: "Under the arch, facing the city" },
      captain: { position: [1.5, 0, 3.3], facing: 0.35, label: "Garlan Ironfist at the checkpoint" },
    },
    cameras: {
      queue: { position: [1.2, 1.9, 18], target: [0, 3.6, 2], label: "From within the queue, the arch ahead", fov: 38 },
      establishing: { position: [17, 6.5, 24], target: [0, 3, 5], label: "High three-quarter: gatehouse, walls, queue", fov: 38 },
      checkpoint: { position: [4.2, 1.7, 8.5], target: [1.2, 1.6, 3.3], label: "Over the table at the captain", fov: 38 },
      wagons: { position: [8.5, 2.8, 14], target: [-2.4, 1.2, 9.5], label: "Across the wagons in the line", fov: 38 },
    },
    groundHeight,
    environment,
    animated,
    dispose() {
      environment.dispose()
      standees.dispose()
      root.removeFromParent()
    },
  }
}

/** A gate tower with the festival streamers on its spire. */
function curtainTower(b: BuilderContext, sign: number): THREE.Group {
  const t = tower(b, { streamers: [b.materials.asterianTex, b.materials.valkaranTex] })
  t.userData.sign = sign
  return t
}

export const kordavosOuterGate: SetDefinition = {
  id: "kordavos-outer-gate",
  title: "The Gates of Kordavos",
  summary:
    "Outside the city gatehouse: road, traveler queue with wagons, guard checkpoint with Garlan. Marks: checkpoint, queue, roadside, portal, captain. Cameras: queue, establishing, checkpoint, wagons. Toggle: timeOfDay.",
  build,
}
