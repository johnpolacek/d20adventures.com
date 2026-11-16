// Isometric spike: a room of a built set as a lit cut-away seen from high and far, in place of its paintings.
//
//   /dev/stage-lab?staging=welcome-to-kordavos/the-dragonbone-inn&tier=ultra&paint=0&iso=45,35,40,24
//
// &iso=azimuth,elevation,distance,fov: where the camera stands about the room's middle, in degrees and metres. Azimuth 0
// looks from +z, 90 from +x. The two walls on the camera's side, the ceiling and everything outside the room are cut
// away, the room's own lamps are lit as if the camera stood inside, and the sky gives way to a dark surround.
// &room=1 picks another of the set's rooms. &top=2.4 cuts the walls lower. &isoat=x,z[,y] looks at that spot, not the middle.
// &isolight=gain,ambient,key: the room's exposure times `gain`, a soft light from all round, and a key light from above
// the camera's left that comes in where the roof was and throws shadows.
//
// Out of doors there is no room, so the ground to keep is given: &isobox=x0,z0,x1,z1[,top]. Everything outside it is
// cut away, nothing above it is unless `top` says so, and the set's own sun lights it.
//   /dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&paint=0&iso=-35,35,60,20&isobox=-14,-4,16,24&isohide=awning
// &isohide=type,type leaves those parts of the set out: an awning over the people, as a ceiling would be.
// &isosky=9fc0ff gives the fill a sky colour. &isolamps=x,y,z,intensity,distance[,colour];... adds lamps, warm unless
// a colour is given. &isofill=0.3 dims the light a night set carries on its camera. &isohaze=0.15 is the share of the
// set's haze a whole place keeps.
// &rings=id,id or &rings=party marks where the cast stand, the named ones in gold (lab.ts castRings).

import type { Stage } from "@d20/stage"
import * as THREE from "three"

export interface IsoOptions {
  azimuth: number
  elevation: number
  distance: number
  fov: number
  room?: number
  // Open ground to keep, x0, z0, x1, z1 and optionally a height to cut at, in place of a room.
  box?: number[]
  // The whole set under its own sky, with nothing cut away and no board: `box` then only says where its middle is.
  whole?: boolean
  top?: number
  at?: number[]
  gain?: number
  ambient?: number
  key?: number
  // The surround's colour at its middle and at its edge.
  surround?: string[]
  // The fill light's sky colour, and lamps as x, y, z, intensity, distance and, if not a flame's, a colour.
  sky?: string
  lamps?: (number | string)[][]
  // The set's own light that rides on the camera, times this: a night set carries one, and it flattens a wide view.
  fill?: number
  // The share of the set's own haze a whole place keeps, 0.3 unless given: a night wood wants less, a far valley more.
  haze?: number
  // The camera is the game's: its walls and its limits are left as they are.
  keepCamera?: boolean
}

// Lamps as an address writes them: x,y,z,intensity,distance[,colour] joined by ";".
export const isoLamps = (text: string | undefined) => text?.split(";").map((l) => l.split(",").map((v, i) => (i < 5 ? Number(v) : `#${v.replace("#", "")}`)))

// The set's limits on a camera the player drives, lifted: this one stands outside the walls.
export function isoSet<T extends { camera?: Record<string, unknown>; painted?: unknown }>(set: T): T {
  delete set.painted
  set.camera = { ...set.camera, min: [-500, -20, -500], max: [500, 500, 500], maxDistance: 500, far: Math.max(600, Number(set.camera?.far) || 0) }
  return set
}

export function iso(stage: Stage, o: IsoOptions) {
  const s = stage as unknown as {
    set: { rooms: { box: number[]; exposure?: number }[]; atmosphere: { exposure: number } }
    sky: THREE.Mesh
    fill: THREE.PointLight | null
    lightRoom: (dt: number) => void
    collide: () => void
  }
  const open = o.box && o.box.length >= 4 ? o.box : null
  const room = open ? null : s.set.rooms[o.room ?? 0]
  if (!open && !room) throw new Error("The set has no room to cut open: give the ground to keep, &isobox=x0,z0,x1,z1")
  const [x0, y0, z0, x1, y1, z1] = open ? [open[0], 0, open[1], open[2], open[4] ?? Number.NaN, open[3]] : (room as { box: number[] }).box
  const az = THREE.MathUtils.degToRad(o.azimuth)
  const el = THREE.MathUtils.degToRad(o.elevation)
  const target = new THREE.Vector3(o.at?.[0] ?? (x0 + x1) / 2, o.at?.[2] ?? 0.6, o.at?.[1] ?? (z0 + z1) / 2)
  const position = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(o.distance).add(target)

  if (!o.whole) {
    // What is kept: from just inside the near walls to the far walls' outer faces, floor slab to the cut height.
    // Open ground has no walls to cut or to keep: it is kept edge to edge, and as high as it goes.
    const WALL = open ? 0 : 0.36
    const sx = Math.sin(az) >= 0 ? 1 : -1
    const sz = Math.cos(az) >= 0 ? 1 : -1
    const nearX = sx > 0 ? x1 : x0
    const farX = sx > 0 ? x0 : x1
    const nearZ = sz > 0 ? z1 : z0
    const farZ = sz > 0 ? z0 : z1
    // The near walls carry studs and rails that stand proud of them, so the cut is a hand's width inside the room.
    const TRIM = open ? 0 : 0.14
    const keep = (n: [number, number, number], at: number) => new THREE.Plane(new THREE.Vector3(...n), at)
    const planes = [keep([-sx, 0, 0], sx * nearX - TRIM), keep([sx, 0, 0], -sx * farX + WALL), keep([0, 0, -sz], sz * nearZ - TRIM), keep([0, 0, sz], -sz * farZ + WALL)]
    const top = o.top ?? (open ? y1 : y1 - 0.56)
    if (Number.isFinite(top)) planes.push(keep([0, -1, 0], top))
    stage.renderer.clippingPlanes = planes
    // The renderer's own planes are left out of shadow maps, so the built set's materials carry them too: what is cut
    // away throws no shadow, and the key light comes in where the roof was.
    stage.renderer.localClippingEnabled = true
    stage.world.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return
      for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
        m.clippingPlanes = planes
        m.clipShadows = true
        m.needsUpdate = true
      }
    })

    // What is kept stands on a slab with sides of its own, as a model stands on its board: the ground's cut edge alone
    // reads as a sheet of paper. Nothing is cut from below, so the slab shows.
    const edge = [
      Math.min(nearX - sx * TRIM, farX - sx * WALL),
      Math.max(nearX - sx * TRIM, farX - sx * WALL),
      Math.min(nearZ - sz * TRIM, farZ - sz * WALL),
      Math.max(nearZ - sz * TRIM, farZ - sz * WALL),
    ]
    const floor = open ? -0.02 : y0 + 0.28
    const deep = Math.max(0.9, Math.hypot(edge[1] - edge[0], edge[3] - edge[2]) * 0.035)
    const board = new THREE.Mesh(new THREE.BoxGeometry(edge[1] - edge[0] - 0.02, deep, edge[3] - edge[2] - 0.02), new THREE.MeshStandardMaterial({ color: "#2e231b", roughness: 1 }))
    board.position.set((edge[0] + edge[1]) / 2, floor - deep / 2, (edge[2] + edge[3]) / 2)
    board.receiveShadow = true
    board.name = "lab:board"
    stage.scene.add(board)

    // Behind it, a dark surround that is a little lighter at the middle, so the model does not float in a void.
    s.sky.visible = false
    const cv = document.createElement("canvas")
    cv.width = cv.height = 512
    const g = cv.getContext("2d") as CanvasRenderingContext2D
    const glow = g.createRadialGradient(256, 236, 20, 256, 256, 380)
    glow.addColorStop(0, o.surround?.[0] ?? "#33231a")
    glow.addColorStop(1, o.surround?.[1] ?? "#0a0706")
    g.fillStyle = glow
    g.fillRect(0, 0, 512, 512)
    const backdrop = new THREE.CanvasTexture(cv)
    backdrop.colorSpace = THREE.SRGBColorSpace
    stage.scene.background = backdrop
    const fog = stage.scene.fog as THREE.FogExp2 | null
    if (fog) fog.density = 0
  } else {
    // Seen from this far, the set's own haze would wash the square out: most of it is lifted.
    const haze = stage.scene.fog as THREE.FogExp2 | null
    if (haze) haze.density *= o.haze ?? 0.3
  }

  const inside = new THREE.Vector3((x0 + x1) / 2, open ? 2 : (y0 + y1) / 2, (z0 + z1) / 2)
  if (room) {
    // The room's lamps come up when the camera is inside it. This camera never is, so the stage is told it stands in the middle.
    const light = s.lightRoom.bind(stage)
    const held = new THREE.Vector3()
    const exposure = ((room as { exposure?: number }).exposure ?? s.set.atmosphere.exposure) * (o.gain ?? 1)
    s.lightRoom = (dt) => {
      held.copy(stage.camera.position)
      stage.camera.position.copy(inside)
      light(dt)
      stage.camera.position.copy(held)
      stage.renderer.toneMappingExposure = exposure
    }
  } else stage.renderer.toneMappingExposure = s.set.atmosphere.exposure * (o.gain ?? 1)
  // The fill is warm unless a sky colour is given: a cool one sets the shadows against the sun, as daylight does.
  if (o.ambient) stage.scene.add(new THREE.HemisphereLight(o.sky ?? "#ffe6c8", o.sky ? "#5a4a3c" : "#4a3626", o.ambient))
  // Lamps of the look's own: a pool of light about a brazier or a lantern, which the set leaves to its paintings.
  for (const [x, y, z, intensity = 20, distance = 8, colour = "#ffab5e"] of o.lamps ?? []) {
    const lamp = new THREE.PointLight(colour, Number(intensity), Number(distance), 1.6)
    lamp.position.set(Number(x), Number(y), Number(z))
    stage.scene.add(lamp)
  }
  if (o.fill !== undefined && s.fill) s.fill.intensity *= o.fill
  if (o.key) {
    const key = new THREE.DirectionalLight("#dfe6ff", o.key)
    const from = az + THREE.MathUtils.degToRad(70)
    const up = THREE.MathUtils.degToRad(58)
    key.position
      .set(Math.cos(up) * Math.sin(from), Math.sin(up), Math.cos(up) * Math.cos(from))
      .multiplyScalar(40)
      .add(inside)
    key.target.position.copy(inside)
    key.castShadow = true
    key.shadow.mapSize.set(4096, 4096)
    const reach = Math.hypot(x1 - x0, z1 - z0) / 2 + 2
    Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: 80 })
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.03
    key.shadow.radius = 3
    stage.scene.add(key, key.target)
  }
  if (!o.keepCamera) {
    s.collide = () => {}
    if (stage.controls) {
      stage.controls.maxPolarAngle = Math.PI * 0.45
      stage.controls.minDistance = 6
    }
  }
  return { position: position.toArray(), target: target.toArray(), fov: o.fov, label: "Isometric" }
}
