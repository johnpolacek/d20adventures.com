// Isometric spike: a room of a built set as a lit cut-away seen from high and far, in place of its paintings.
//
//   /dev/stage-lab?staging=welcome-to-kordavos/the-dragonbone-inn&tier=ultra&paint=0&iso=45,35,40,24
//
// &iso=azimuth,elevation,distance,fov: where the camera stands about the room's middle, in degrees and metres. Azimuth 0
// looks from +z, 90 from +x. The two walls on the camera's side, the ceiling and everything outside the room are cut
// away, the room's own lamps are lit as if the camera stood inside, and the sky gives way to a dark surround.
// &room=1 picks another of the set's rooms. &top=2.4 cuts the walls lower. &isoat=x,z looks at that spot, not the middle.
// &isolight=gain,ambient,key: the room's exposure times `gain`, a soft light from all round, and a key light from above
// the camera's left that comes in where the roof was and throws shadows.
//
// Out of doors there is no room, so the ground to keep is given: &isobox=x0,z0,x1,z1[,top]. Everything outside it is
// cut away, nothing above it is unless `top` says so, and the set's own sun lights it.
//   /dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&paint=0&iso=-35,35,60,20&isobox=-14,-4,16,24&isohide=awning
// &isohide=type,type leaves those parts of the set out: an awning over the people, as a ceiling would be.

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
  top?: number
  at?: number[]
  gain?: number
  ambient?: number
  key?: number
}

// The set's limits on a camera the player drives, lifted: this one stands outside the walls.
export function isoSet<T extends { camera?: Record<string, unknown>; painted?: unknown }>(set: T): T {
  delete set.painted
  set.camera = { ...set.camera, min: [-500, -20, -500], max: [500, 500, 500], maxDistance: 500, far: 600 }
  return set
}

export function iso(stage: Stage, o: IsoOptions) {
  const s = stage as unknown as {
    set: { rooms: { box: number[]; exposure?: number }[]; atmosphere: { exposure: number } }
    sky: THREE.Mesh
    lightRoom: (dt: number) => void
    collide: () => void
  }
  const open = o.box && o.box.length >= 4 ? o.box : null
  const room = open ? null : s.set.rooms[o.room ?? 0]
  if (!open && !room) throw new Error("The set has no room to cut open: give the ground to keep, &isobox=x0,z0,x1,z1")
  const [x0, y0, z0, x1, y1, z1] = open ? [open[0], 0, open[1], open[2], open[4] ?? Number.NaN, open[3]] : (room as { box: number[] }).box
  const az = THREE.MathUtils.degToRad(o.azimuth)
  const el = THREE.MathUtils.degToRad(o.elevation)
  const target = new THREE.Vector3(o.at?.[0] ?? (x0 + x1) / 2, 0.6, o.at?.[1] ?? (z0 + z1) / 2)
  const position = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(o.distance).add(target)

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
  const planes = [keep([-sx, 0, 0], sx * nearX - TRIM), keep([sx, 0, 0], -sx * farX + WALL), keep([0, 0, -sz], sz * nearZ - TRIM), keep([0, 0, sz], -sz * farZ + WALL), keep([0, 1, 0], 0.3 - y0)]
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

  s.sky.visible = false
  stage.scene.background = new THREE.Color("#0a0807")
  const fog = stage.scene.fog as THREE.FogExp2 | null
  if (fog) fog.density = 0

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
  if (o.ambient) stage.scene.add(new THREE.HemisphereLight("#ffe6c8", "#4a3626", o.ambient))
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
  s.collide = () => {}
  if (stage.controls) {
    stage.controls.maxPolarAngle = Math.PI * 0.45
    stage.controls.minDistance = 6
  }
  return { position: position.toArray(), target: target.toArray(), fov: o.fov, label: "Isometric" }
}
