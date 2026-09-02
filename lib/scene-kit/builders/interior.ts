// Interiors: room shells with openings, leaded windows and doors, hearths, bars,
// tavern furniture, hanging and wall lights, galleries and stairs, kitchen
// passes, and the people who work a taproom. Built at the origin facing +Z; the
// set positions and rotates them.

import * as THREE from "three"
import { box, cyl, mesh, sph } from "../primitives"
import { canvasTex, makeCanvas, type TextureSet } from "../textures"
import type { BuilderContext } from "./context"
import { type FigureOptions, figure, SKIN_TONES } from "./figure"
import { barrel } from "./props"

/** A hole in a wall, in the wall's own length axis (metres from its centre) and height. */
export interface Opening {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface WallOptions {
  length: number
  height: number
  thickness?: number
  openings?: Opening[]
  /** Height of the stone dado; plaster above it. 0 for all-stone. */
  baseHeight?: number
  stone?: TextureSet
  upper?: TextureSet
}

/**
 * A wall along local X, centred, standing on y=0, thickness centred on z=0.
 * Openings are cut by splitting the wall into boxes; the dado is stone and the
 * rest plaster (or stone when baseHeight >= height).
 */
export function wallSegment(ctx: BuilderContext, { length, height, thickness = 0.5, openings = [], baseHeight = 1.5, stone, upper }: WallOptions): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const stoneTex = stone ?? M.stoneTex
  const upperTex = upper ?? M.plasterTex
  const stoneMat = M.stone(length / 4, baseHeight / 1.5, {}, stoneTex, 0.6)
  const upperMat = M.stone(length / 3, (height - baseHeight) / 1.5, {}, upperTex, 0)
  const piece = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return
    const splitAt = Math.min(Math.max(baseHeight, y0), y1)
    if (splitAt > y0) g.add(box(x1 - x0, splitAt - y0, thickness, stoneMat, (x0 + x1) / 2, (y0 + splitAt) / 2, 0))
    if (y1 > splitAt) g.add(box(x1 - x0, y1 - splitAt, thickness, upperMat, (x0 + x1) / 2, (splitAt + y1) / 2, 0))
  }
  const sorted = [...openings].sort((a, b) => a.x0 - b.x0)
  let cursor = -length / 2
  for (const o of sorted) {
    piece(cursor, o.x0, 0, height)
    piece(o.x0, o.x1, 0, o.y0)
    piece(o.x0, o.x1, o.y1, height)
    cursor = o.x1
  }
  piece(cursor, length / 2, 0, height)
  return g
}

export type WallSide = "north" | "south" | "east" | "west"

export interface RoomOptions {
  width: number
  depth: number
  height: number
  wallThickness?: number
  baseHeight?: number
  /** Openings per wall. North/south use world X; east/west use world Z. */
  openings?: Partial<Record<WallSide, Opening[]>>
  floor?: "plank" | "flagstone"
  /** Oak post spacing along the walls, 0 for none. */
  postSpacing?: number
  /** Tie-beam spacing along the depth, 0 for none. */
  beamSpacing?: number
  ceiling?: boolean
}

/**
 * Floor, four walls with openings, oak posts, tie beams and a boarded ceiling.
 * North is +Z (the approach side), so a door on the north wall faces the origin.
 */
export function roomShell(
  ctx: BuilderContext,
  { width, depth, height, wallThickness = 0.5, baseHeight = 1.5, openings = {}, floor = "plank", postSpacing = 4, beamSpacing = 4, ceiling = true }: RoomOptions
): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const floorMat = floor === "plank" ? M.wood(width / 1.2, depth / 1.2, M.woodTex) : M.stone(width / 1.6, depth / 1.6, {}, M.cobbleTex, 0)
  if (floor === "plank") {
    for (const key of ["map", "normalMap", "roughnessMap"] as const) {
      const texture = floorMat[key]
      if (texture) texture.rotation = Math.PI / 2
    }
  }
  const floorMesh = mesh(new THREE.PlaneGeometry(width + wallThickness * 2, depth + wallThickness * 2), floorMat, 0, 0, 0, false, true)
  floorMesh.rotation.x = -Math.PI / 2
  g.add(floorMesh)

  const walls: { side: WallSide; length: number; position: [number, number, number]; rotation: number; flip: boolean }[] = [
    { side: "north", length: width, position: [0, 0, depth / 2 + wallThickness / 2], rotation: 0, flip: false },
    { side: "south", length: width, position: [0, 0, -depth / 2 - wallThickness / 2], rotation: 0, flip: false },
    { side: "east", length: depth, position: [width / 2 + wallThickness / 2, 0, 0], rotation: -Math.PI / 2, flip: false },
    { side: "west", length: depth, position: [-width / 2 - wallThickness / 2, 0, 0], rotation: Math.PI / 2, flip: true },
  ]
  for (const w of walls) {
    const raw = openings[w.side] ?? []
    // rotation +PI/2 maps local +X onto world -Z, so the west wall's openings mirror.
    const local = raw.map((o) => (w.flip ? { ...o, x0: -o.x1, x1: -o.x0 } : o))
    const wall = wallSegment(ctx, { length: w.length + wallThickness * 2, height, thickness: wallThickness, openings: local, baseHeight })
    wall.position.set(...w.position)
    wall.rotation.y = w.rotation
    g.add(wall)
  }

  const oak = M.wood(1, height / 2, M.woodDarkTex)
  if (postSpacing > 0) {
    const along = (len: number) => {
      const n = Math.max(1, Math.round(len / postSpacing))
      const out: number[] = []
      for (let i = 0; i <= n; i++) out.push(-len / 2 + (i * len) / n)
      return out
    }
    for (const x of along(width)) {
      g.add(box(0.35, height, 0.35, oak, x, height / 2, depth / 2 - 0.18))
      g.add(box(0.35, height, 0.35, oak, x, height / 2, -depth / 2 + 0.18))
    }
    for (const z of along(depth)) {
      g.add(box(0.35, height, 0.35, oak, width / 2 - 0.18, height / 2, z))
      g.add(box(0.35, height, 0.35, oak, -width / 2 + 0.18, height / 2, z))
    }
  }
  if (beamSpacing > 0) {
    const n = Math.max(1, Math.round(depth / beamSpacing))
    for (let i = 0; i <= n; i++) {
      const z = -depth / 2 + (i * depth) / n
      g.add(box(width + 0.4, 0.45, 0.35, oak, 0, height - 0.25, z))
      // knee braces at each end
      for (const s of [-1, 1]) {
        const brace = box(0.18, 1.6, 0.18, oak, s * (width / 2 - 0.7), height - 1.1, z)
        brace.rotation.z = s * 0.7
        g.add(brace)
      }
    }
    // purlins along the depth
    for (let i = 1; i < 4; i++) g.add(box(0.25, 0.3, depth + 0.4, oak, -width / 2 + (i * width) / 4, height - 0.55, 0))
  }
  if (ceiling) {
    const boards = M.wood(width / 0.3, depth / 4, M.woodDarkTex, { side: THREE.DoubleSide })
    const c = mesh(new THREE.PlaneGeometry(width + wallThickness * 2, depth + wallThickness * 2), boards, 0, height, 0, false, true)
    c.rotation.x = Math.PI / 2
    g.add(c)
  }
  return g
}

/** Diamond-lattice lead lines on a translucent pane, as a texture. */
function latticeTexture(): THREE.Texture {
  const S = 256
  const canvas = makeCanvas(S, S)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "rgba(180,200,235,0.55)"
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = "rgba(30,30,34,0.95)"
  ctx.lineWidth = 3
  const step = 32
  for (let i = -S; i < S * 2; i += step) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + S, S)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i + S, 0)
    ctx.lineTo(i, S)
    ctx.stroke()
  }
  return canvasTex(canvas)
}

export interface WindowOptions {
  w: number
  h: number
  /** Colour and strength of light coming in; null for a dark window. */
  light?: { color: THREE.ColorRepresentation; intensity: number } | null
  /** The wall thickness the frame sits in. */
  depth?: number
}

/**
 * A leaded window in a dark oak frame with a mullion, a glow plane outside and a
 * spot light throwing the outside light into the room. Faces +Z (into the room).
 */
export function leadedWindow(ctx: BuilderContext, { w, h, light = { color: 0x6f8fd6, intensity: 40 }, depth = 0.5 }: WindowOptions): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const frame = M.wood(1, 1, M.woodDarkTex)
  g.add(box(w + 0.3, 0.12, depth + 0.1, frame, 0, h / 2 + 0.06, 0))
  g.add(box(w + 0.3, 0.12, depth + 0.1, frame, 0, -h / 2 - 0.06, 0))
  g.add(box(0.12, h, depth + 0.1, frame, -w / 2 - 0.06, 0, 0))
  g.add(box(0.12, h, depth + 0.1, frame, w / 2 + 0.06, 0, 0))
  g.add(box(0.08, h, 0.12, frame, 0, 0, 0))
  g.add(box(w, 0.08, 0.12, frame, 0, 0, 0))
  const lattice = latticeTexture()
  lattice.repeat.set(w * 1.5, h * 1.5)
  const glassColor = new THREE.Color(light?.color ?? 0x101418)
  const glass = new THREE.MeshStandardMaterial({
    map: lattice,
    transparent: true,
    opacity: 0.9,
    roughness: 0.4,
    metalness: 0.1,
    emissive: glassColor,
    emissiveIntensity: light ? 0.9 : 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  g.add(mesh(new THREE.PlaneGeometry(w, h), glass, 0, 0, 0, false, false))
  if (light) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.2, h * 2.2), new THREE.MeshBasicMaterial({ color: light.color, side: THREE.DoubleSide, fog: false }))
    glow.position.z = -depth - 0.4
    g.add(glow)
    const spot = new THREE.SpotLight(light.color, light.intensity, 22, 0.55, 0.6, 1.6)
    spot.position.set(0, 0.6, -depth - 1.2)
    spot.target.position.set(0, -h, 7)
    g.add(spot, spot.target)
  }
  return g
}

/** Double oak doors in a frame, swung open into the room (toward +Z), with dusk beyond. */
export function doubleDoor(
  ctx: BuilderContext,
  { w, h, openAngles = [0.9, 0.7], outside = 0x4a5f8f }: { w: number; h: number; openAngles?: [number, number]; outside?: THREE.ColorRepresentation | null }
): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const frame = M.wood(1, 1, M.woodDarkTex)
  g.add(box(w + 0.4, 0.2, 0.6, frame, 0, h + 0.1, 0))
  g.add(box(0.2, h, 0.6, frame, -w / 2 - 0.1, h / 2, 0))
  g.add(box(0.2, h, 0.6, frame, w / 2 + 0.1, h / 2, 0))
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group()
    leaf.position.set(side * (w / 2), 0, 0.1)
    leaf.rotation.y = -side * (side < 0 ? openAngles[0] : openAngles[1])
    g.add(leaf)
    const planks = M.wood(1, 1, M.woodVTex)
    leaf.add(box(w / 2, h, 0.1, planks, -side * (w / 4), h / 2, 0))
    for (const y of [h * 0.2, h * 0.5, h * 0.8]) {
      leaf.add(box(w / 2 - 0.1, 0.12, 0.03, M.ironDark, -side * (w / 4), y, 0.07))
      for (let i = 0; i < 4; i++) leaf.add(sph(0.03, M.iron, -side * (0.15 + i * ((w / 2 - 0.3) / 3)), y, 0.09, 6))
    }
    leaf.add(mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 16), M.iron, -side * (w / 2 - 0.25), h / 2, 0.1))
  }
  if (outside !== null) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.5, h * 1.8), new THREE.MeshBasicMaterial({ color: outside, side: THREE.DoubleSide, fog: false }))
    glow.position.set(0, h / 2, -1.2)
    g.add(glow)
    const spot = new THREE.SpotLight(outside, 30, 18, 0.5, 0.6, 1.6)
    spot.position.set(0, h * 0.7, -1.5)
    spot.target.position.set(0, 0, 6)
    g.add(spot, spot.target)
  }
  return g
}

export interface HearthOptions {
  width?: number
  height?: number
  depth?: number
  /** Chimney breast runs up to this height. */
  ceilingHeight?: number
  spit?: boolean
  benches?: boolean
}

/**
 * A granite fireplace: jambs, lintel, chimney breast to the ceiling, a firebox
 * with coals, logs, flames and smoke, a shadow-casting fire light, an iron spit
 * with a roast, andirons and low hearth benches. Opening faces +Z.
 */
export function hearth(ctx: BuilderContext, { width = 4.5, height = 3.5, depth = 1.5, ceilingHeight = 7, spit = true, benches = true }: HearthOptions = {}): THREE.Group {
  const { materials: M, rng, fire } = ctx
  const g = new THREE.Group()
  const granite = M.stone(width / 2.5, height / 2.5, {}, M.stoneTex, 0)
  const soot = M.flat(0x15110e, 1)
  const jamb = width * 0.2
  const opening = { w: width - jamb * 2, h: height * 0.62 }
  g.add(box(jamb, height, depth, granite, -width / 2 + jamb / 2, height / 2, 0))
  g.add(box(jamb, height, depth, granite, width / 2 - jamb / 2, height / 2, 0))
  g.add(box(width, height - opening.h, depth, granite, 0, opening.h + (height - opening.h) / 2, 0))
  g.add(box(width * 0.8, ceilingHeight - height, depth * 0.8, granite, 0, height + (ceilingHeight - height) / 2, -depth * 0.1))
  g.add(box(width + 0.4, 0.22, depth + 0.5, M.wood(3, 1, M.woodDarkTex), 0, height + 0.11, 0.15))
  g.add(box(width + 0.6, 0.12, depth + 1.2, granite, 0, 0.06, 0.4))
  g.add(box(opening.w, opening.h, 0.2, soot, 0, opening.h / 2, -depth / 2 + 0.1))
  g.add(box(0.2, opening.h, depth - 0.2, soot, -opening.w / 2 + 0.1, opening.h / 2, 0))
  g.add(box(0.2, opening.h, depth - 0.2, soot, opening.w / 2 - 0.1, opening.h / 2, 0))
  g.add(box(opening.w, 0.2, depth - 0.2, soot, 0, opening.h - 0.1, 0))
  const coals = mesh(new THREE.SphereGeometry(opening.w * 0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.emissive(0x2a1a12, 0xff5a18, 3, 1), 0, 0.12, 0)
  coals.scale.set(1.4, 0.35, 0.8)
  g.add(coals)
  for (let i = 0; i < 6; i++) {
    const log = cyl(0.09, 0.11, opening.w * 0.4, M.flat(0x2a1a12), rng.range(-0.4, 0.4), 0.22 + i * 0.05, rng.range(-0.25, 0.25), 7)
    log.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 3), Math.PI / 2 + rng.range(-0.4, 0.4))
    g.add(log)
  }
  for (const s of [-1, 1]) {
    g.add(cyl(0.05, 0.05, 0.7, M.ironDark, s * opening.w * 0.32, 0.35, 0.35, 6))
    g.add(sph(0.08, M.brass, s * opening.w * 0.32, 0.72, 0.35, 8))
    g.add(box(0.06, 0.06, 0.9, M.ironDark, s * opening.w * 0.32, 0.12, -0.05))
  }
  fire.addFire(g, { count: 16, y: -0.55, scale: 1.7 })
  fire.addSmoke(g, { count: 6, y: 0.4 })
  const light = fire.addLight(g, { color: 0xff8a3a, intensity: 60, distance: 22, y: 1.0 })
  light.position.z = 0.4
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.bias = -0.002
  if (spit) {
    const y = opening.h * 0.6
    g.add(cyl(0.025, 0.025, opening.w + 0.4, M.ironDark, 0, y, 0.15, 6).rotateZ(Math.PI / 2))
    for (const s of [-1, 1]) g.add(cyl(0.03, 0.03, y, M.ironDark, s * (opening.w / 2 + 0.1), y / 2, 0.15, 6))
    const roast = mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), M.flat(0x6a3a1c, 0.6), 0, y, 0.15)
    roast.rotation.z = Math.PI / 2
    g.add(roast)
    g.add(cyl(0.3, 0.26, 0.08, M.brass, 0, 0.18, 0.15, 14))
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), M.ironDark, opening.w / 2 + 0.1, y, 0.15))
  }
  if (benches) {
    const timber = M.wood(2, 1, M.woodDarkTex)
    for (const s of [-1, 1]) {
      const b = box(0.5, 0.12, 1.8, timber, s * (width / 2 + 0.8), 0.42, 1.4)
      g.add(b)
      g.add(box(0.4, 0.36, 0.12, timber, s * (width / 2 + 0.8), 0.18, 0.7))
      g.add(box(0.4, 0.36, 0.12, timber, s * (width / 2 + 0.8), 0.18, 2.1))
    }
  }
  return g
}

/** A tavern bar along local X with the back shelving and cask rack behind it (-Z). */
export function barCounter(ctx: BuilderContext, { length = 8, height = 1.1 }: { length?: number; height?: number } = {}): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const top = M.wood(length / 2, 1, M.woodDarkTex, { roughness: 0.55 })
  const front = M.wood(length / 1.2, 1, M.woodVTex)
  g.add(box(length, 0.1, 0.9, top, 0, height, 0))
  g.add(box(length, height - 0.1, 0.7, front, 0, (height - 0.1) / 2, 0.05))
  g.add(cyl(0.025, 0.025, length - 0.2, M.brass, 0, 0.22, 0.55, 8).rotateZ(Math.PI / 2))
  for (let i = 0; i <= 3; i++) g.add(box(0.06, 0.16, 0.14, M.brass, -length / 2 + 0.3 + (i * (length - 0.6)) / 3, 0.15, 0.5))
  g.add(box(length, 0.03, 0.05, M.brass, 0, height + 0.06, 0.44))
  // back bar
  const back = new THREE.Group()
  back.position.z = -1.6
  g.add(back)
  const shelfMat = M.wood(length / 2, 1, M.woodDarkTex)
  back.add(box(length, 0.08, 0.5, shelfMat, 0, 1.4, 0))
  back.add(box(length, 0.08, 0.5, shelfMat, 0, 2.0, 0))
  back.add(box(length, 0.08, 0.5, shelfMat, 0, 2.6, 0))
  back.add(box(length, 0.9, 0.6, front, 0, 0.45, 0))
  const stoneware = M.flat(0x8a7a66, 0.6)
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9ca0, roughness: 0.45, metalness: 0.8 })
  for (let i = 0; i < length * 2; i++) {
    const x = -length / 2 + 0.3 + i * 0.5 + rng.range(-0.08, 0.08)
    if (rng.chance(0.5)) {
      back.add(cyl(0.08, 0.1, 0.32, stoneware, x, 1.6, 0, 10))
      back.add(cyl(0.04, 0.06, 0.1, stoneware, x, 1.81, 0, 8))
    } else back.add(cyl(0.06, 0.07, 0.18, pewter, x, 2.13, 0, 10))
    if (rng.chance(0.6)) back.add(cyl(0.06, 0.07, 0.18, pewter, x + 0.2, 2.73, 0, 10))
  }
  // cask rack
  const rack = M.wood(1, 1, M.woodDarkTex)
  const casks = Math.floor(length / 2)
  for (let i = 0; i < casks; i++) {
    const x = -length / 2 + 1 + i * 2
    const b = barrel(ctx, 1.4)
    b.rotation.x = Math.PI / 2
    b.position.set(x, 0.62, -0.95)
    g.add(b)
    g.add(box(1.0, 0.15, 0.6, rack, x, 0.12, -0.95))
    g.add(cyl(0.03, 0.03, 0.18, M.brass, x, 0.3, -0.35, 8).rotateX(Math.PI / 2))
    g.add(box(0.12, 0.04, 0.04, M.brass, x, 0.36, -0.27))
  }
  return g
}

export function trestleTable(ctx: BuilderContext, { w = 1.8, d = 1.0, h = 0.78 }: { w?: number; d?: number; h?: number } = {}): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const top = M.wood(w, d, M.woodTex)
  const legs = M.wood(1, 1, M.woodDarkTex)
  g.add(box(w, 0.07, d, top, 0, h - 0.035, 0))
  for (const s of [-1, 1]) {
    const leg = box(0.1, h - 0.07, d * 0.8, legs, s * (w / 2 - 0.25), (h - 0.07) / 2, 0)
    leg.rotation.x = 0
    g.add(leg)
    g.add(box(0.14, 0.08, d * 0.9, legs, s * (w / 2 - 0.25), 0.04, 0))
  }
  g.add(box(w - 0.6, 0.08, 0.08, legs, 0, 0.3, 0))
  return g
}

export function bench(ctx: BuilderContext, { len = 1.6, h = 0.45 }: { len?: number; h?: number } = {}): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const timber = M.wood(2, 1, M.woodTex)
  const legs = M.wood(1, 1, M.woodDarkTex)
  g.add(box(len, 0.06, 0.32, timber, 0, h - 0.03, 0))
  for (const s of [-1, 1]) g.add(box(0.08, h - 0.06, 0.28, legs, s * (len / 2 - 0.15), (h - 0.06) / 2, 0))
  return g
}

/** A settle: a high-backed bench for a snug, back along -Z. */
export function highBackBench(ctx: BuilderContext, { len = 1.6, cushion = 0xc2622a }: { len?: number; cushion?: number } = {}): THREE.Group {
  const { materials: M } = ctx
  const g = bench(ctx, { len })
  const timber = M.wood(2, 1, M.woodDarkTex)
  g.add(box(len, 1.3, 0.08, timber, 0, 0.65 + 0.42, -0.18))
  g.add(box(len, 0.05, 0.3, M.flat(cushion, 0.95), 0, 0.46, 0.02))
  for (const s of [-1, 1]) {
    g.add(box(0.08, 1.1, 0.34, timber, s * (len / 2 - 0.04), 0.55, 0))
    g.add(sph(0.05, M.flat(0xd8c8a8, 0.7), s * (len / 2 - 0.04), 1.12, 0.14, 8))
  }
  return g
}

export function stool(ctx: BuilderContext): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const timber = M.wood(1, 1, M.woodDarkTex)
  g.add(cyl(0.18, 0.18, 0.05, timber, 0, 0.44, 0, 12))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = cyl(0.02, 0.025, 0.44, timber, Math.cos(a) * 0.13, 0.21, Math.sin(a) * 0.13, 6)
    leg.rotation.z = -Math.cos(a) * 0.18
    leg.rotation.x = Math.sin(a) * 0.18
    g.add(leg)
  }
  return g
}

/** Tankards, a jug, a plate and a candle for a tabletop. Origin on the table surface. */
export function tableClutter(ctx: BuilderContext, { w = 1.8, d = 1.0, candle = true }: { w?: number; d?: number; candle?: boolean } = {}): THREE.Group {
  const { materials: M, rng, fire } = ctx
  const g = new THREE.Group()
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9ca0, roughness: 0.45, metalness: 0.8 })
  const n = 2 + rng.int(4)
  for (let i = 0; i < n; i++) {
    const x = rng.range(-w / 2 + 0.15, w / 2 - 0.15)
    const z = rng.range(-d / 2 + 0.12, d / 2 - 0.12)
    if (rng.chance(0.7)) {
      g.add(cyl(0.05, 0.06, 0.16, pewter, x, 0.08, z, 10))
      g.add(mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10), pewter, x + 0.07, 0.08, z))
    } else g.add(cyl(0.13, 0.12, 0.015, M.flat(0xb8a88a, 0.6), x, 0.008, z, 14))
  }
  if (rng.chance(0.5)) {
    const x = rng.range(-w / 3, w / 3)
    g.add(cyl(0.09, 0.11, 0.26, M.flat(0x7a6a58, 0.6), x, 0.13, 0, 10))
    g.add(cyl(0.05, 0.07, 0.08, M.flat(0x7a6a58, 0.6), x, 0.3, 0, 8))
  }
  if (candle) {
    const holder = new THREE.Group()
    holder.position.set(rng.range(-0.2, 0.2), 0, rng.range(-0.15, 0.15))
    g.add(holder)
    holder.add(cyl(0.06, 0.07, 0.02, M.brass, 0, 0.01, 0, 10))
    holder.add(cyl(0.018, 0.018, 0.14, M.flat(0xe8dcc0, 0.6), 0, 0.09, 0, 8))
    fire.addFire(holder, { count: 2, y: -0.75, scale: 0.28 })
    fire.addLight(holder, { color: 0xffb060, intensity: 1.0, distance: 3.5, y: 0.3 })
  }
  return g
}

/** An iron wheel chandelier on a chain, candles lit, one warm point light. Origin at the wheel. */
export function wheelChandelier(
  ctx: BuilderContext,
  { radius = 0.8, candles = 8, chain = 2.0, intensity = 14 }: { radius?: number; candles?: number; chain?: number; intensity?: number } = {}
): THREE.Group {
  const { materials: M, fire } = ctx
  const g = new THREE.Group()
  g.add(mesh(new THREE.TorusGeometry(radius, 0.035, 8, 32), M.ironDark, 0, 0, 0).rotateX(Math.PI / 2))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const spoke = cyl(0.015, 0.015, radius * 2, M.ironDark, 0, 0, 0, 5)
    spoke.rotation.z = Math.PI / 2
    spoke.rotation.y = a
    g.add(spoke)
    const c = cyl(0.008, 0.008, chain, M.ironDark, Math.cos(a) * radius, chain / 2, Math.sin(a) * radius, 4)
    c.rotation.x = -Math.sin(a) * Math.atan(radius / chain)
    c.rotation.z = Math.cos(a) * Math.atan(radius / chain)
    g.add(c)
  }
  g.add(cyl(0.012, 0.012, 0.6, M.ironDark, 0, chain + 0.3, 0, 5))
  const wax = M.flat(0xe8dcc0, 0.6)
  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * Math.PI * 2
    const holder = new THREE.Group()
    holder.position.set(Math.cos(a) * radius, 0.02, Math.sin(a) * radius)
    g.add(holder)
    holder.add(cyl(0.035, 0.04, 0.03, M.ironDark, 0, 0.015, 0, 8))
    holder.add(cyl(0.02, 0.02, 0.16, wax, 0, 0.1, 0, 8))
    fire.addFire(holder, { count: 2, y: -0.72, scale: 0.3 })
  }
  fire.addLight(g, { color: 0xffb870, intensity, distance: 12, y: 0.3 })
  return g
}

/** A wall sconce: iron bracket, a candle, a small light. Mounts at the origin, wall behind (-Z). */
export function wallSconce(ctx: BuilderContext): THREE.Group {
  const { materials: M, fire } = ctx
  const g = new THREE.Group()
  g.add(box(0.12, 0.3, 0.04, M.ironDark, 0, 0, 0))
  g.add(cyl(0.012, 0.012, 0.22, M.ironDark, 0, 0.02, 0.12, 5).rotateX(Math.PI / 2))
  g.add(cyl(0.05, 0.06, 0.03, M.ironDark, 0, 0.04, 0.22, 8))
  g.add(cyl(0.02, 0.02, 0.16, M.flat(0xe8dcc0, 0.6), 0, 0.13, 0.22, 8))
  const holder = new THREE.Group()
  holder.position.set(0, 0, 0.22)
  g.add(holder)
  fire.addFire(holder, { count: 2, y: -0.7, scale: 0.3 })
  // Kept low and pushed off the wall: a point light against plaster blows out under bloom.
  const light = fire.addLight(g, { color: 0xffb060, intensity: 1.6, distance: 6, y: 0.4 })
  light.position.z = 0.5
  return g
}

export interface GalleryOptions {
  length: number
  depth: number
  height: number
  /** Which local side the open edge faces: the balustrade goes there (+Z). */
  postSpacing?: number
  balusterSpacing?: number
}

/** A mezzanine slab along local X with joists, support posts, and a carved balustrade on the +Z edge. */
export function gallery(ctx: BuilderContext, { length, depth, height, postSpacing = 3.5, balusterSpacing = 0.22 }: GalleryOptions): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const oak = M.wood(1, 1, M.woodDarkTex)
  const boards = M.wood(length / 0.3, depth / 3, M.woodTex)
  g.add(box(length, 0.12, depth, boards, 0, height, 0))
  g.add(box(length, 0.35, 0.25, oak, 0, height - 0.24, depth / 2 - 0.12))
  for (let i = 0; i <= Math.round(length / 0.9); i++) g.add(box(0.14, 0.3, depth, oak, -length / 2 + (i * length) / Math.round(length / 0.9), height - 0.21, 0))
  const n = Math.max(1, Math.round(length / postSpacing))
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (i * length) / n
    g.add(box(0.32, height, 0.32, oak, x, height / 2, depth / 2 - 0.2))
    g.add(box(0.14, 1.05, 0.14, oak, x, height + 0.6, depth / 2 - 0.1))
    g.add(sph(0.09, oak, x, height + 1.18, depth / 2 - 0.1, 8))
  }
  g.add(box(length, 0.1, 0.16, M.relief(M.knotTex, length / 2, 1, 1.2), 0, height + 1.1, depth / 2 - 0.1))
  g.add(box(length, 0.06, 0.1, oak, 0, height + 0.22, depth / 2 - 0.1))
  const bal = Math.floor(length / balusterSpacing)
  for (let i = 0; i < bal; i++) g.add(box(0.05, 0.86, 0.05, oak, -length / 2 + (i + 0.5) * balusterSpacing, height + 0.62, depth / 2 - 0.1))
  return g
}

/** A straight timber stair rising along +X from the origin, with stringers and a handrail. */
export function staircase(ctx: BuilderContext, { rise, width = 1.4, run = 0.28 }: { rise: number; width?: number; run?: number }): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const oak = M.wood(1, 1, M.woodDarkTex)
  const tread = M.wood(2, 1, M.woodTex)
  const steps = Math.round(rise / 0.19)
  const riser = rise / steps
  for (let i = 0; i < steps; i++) {
    g.add(box(run + 0.04, 0.05, width, tread, (i + 0.5) * run, (i + 1) * riser, 0))
    g.add(box(0.03, riser, width, oak, i * run + 0.015, (i + 0.5) * riser, 0))
  }
  const len = Math.hypot(steps * run, rise)
  for (const s of [-1, 1]) {
    const stringer = box(len, 0.3, 0.06, oak, (steps * run) / 2, rise / 2 - 0.1, s * (width / 2 - 0.03))
    stringer.rotation.z = Math.atan2(rise, steps * run)
    g.add(stringer)
  }
  const rail = box(len, 0.06, 0.08, oak, (steps * run) / 2, rise / 2 + 0.95, width / 2 + 0.05)
  rail.rotation.z = Math.atan2(rise, steps * run)
  g.add(rail)
  for (let i = 0; i <= steps; i += 2) g.add(box(0.05, 0.9, 0.05, oak, i * run, i * riser + 0.5, width / 2 + 0.05))
  return g
}

/** A kitchen pass: a counter in an opening with a glowing brick oven and copper pots beyond. Faces +Z. */
export function kitchenPass(ctx: BuilderContext, { w = 3, h = 2.2, sill = 1.0 }: { w?: number; h?: number; sill?: number } = {}): THREE.Group {
  const { materials: M, rng, fire } = ctx
  const g = new THREE.Group()
  g.add(box(w + 0.3, 0.1, 0.9, M.wood(w, 1, M.woodDarkTex), 0, sill, 0))
  const room = new THREE.Group()
  room.position.z = -2.4
  g.add(room)
  room.add(box(w + 2, h + 2, 0.3, M.flat(0x3a2e26, 1), 0, (h + 2) / 2 - 0.5, -2))
  room.add(box(1.4, 1.5, 1.2, M.stone(1, 1, {}, M.stoneLightTex, 0), -0.6, 0.75, -1.2))
  room.add(box(0.8, 0.5, 0.1, M.emissive(0x3a1a08, 0xff6a20, 4, 1), -0.6, 0.75, -0.58))
  fire.addLight(room, { color: 0xff8a40, intensity: 10, distance: 8, y: 1.0 })
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.9 })
  for (let i = 0; i < 5; i++) {
    const x = -w / 2 + 0.4 + i * (w / 5)
    room.add(cyl(0.16 + rng.range(-0.04, 0.04), 0.14, 0.16, copper, x, h - 0.4, 0.2, 12))
    room.add(cyl(0.006, 0.006, 0.4, M.ironDark, x, h - 0.1, 0.2, 4))
  }
  for (let i = 0; i < 4; i++) room.add(cyl(0.12, 0.1, 0.25, M.flat(0x8a7a66, 0.6), -w / 2 + 0.5 + i * 0.6, sill + 0.12, 0.3, 10))
  return g
}

/** Bunches of dried wheat, and gourds, for harvest dressing. */
export function harvestDressing(ctx: BuilderContext): THREE.Group {
  const { materials: M, rng } = ctx
  const g = new THREE.Group()
  const straw = M.flat(0xc9a24a, 1)
  for (let i = 0; i < 9; i++) {
    const stalk = cyl(0.008, 0.012, 0.9, straw, rng.range(-0.08, 0.08), 0.45, rng.range(-0.08, 0.08), 4)
    stalk.rotation.set(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15))
    g.add(stalk)
    g.add(mesh(new THREE.CapsuleGeometry(0.02, 0.1, 3, 6), straw, stalk.position.x * 1.6, 0.95, stalk.position.z * 1.6))
  }
  g.add(mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12), M.flat(0x4a3220), 0, 0.35, 0))
  for (let i = 0; i < 3; i++) {
    const gourd = sph(rng.range(0.12, 0.2), M.flat(i ? 0xd8701e : 0xe0a030, 0.7), rng.range(0.2, 0.45) * (i % 2 ? 1 : -1), 0.1, rng.range(0.1, 0.4), 12)
    gourd.scale.y = 0.75
    g.add(gourd)
  }
  return g
}

/** A host stand: a tall oak lectern with a slanted ledger top, a candle and a hand bell. Faces +Z. */
export function hostStand(ctx: BuilderContext): THREE.Group {
  const { materials: M, fire } = ctx
  const g = new THREE.Group()
  const oak = M.wood(1, 1, M.woodDarkTex)
  const panel = M.wood(1, 2, M.woodVTex)
  g.add(box(0.9, 0.08, 0.6, oak, 0, 0.04, 0))
  g.add(box(0.7, 1.0, 0.45, panel, 0, 0.58, -0.02))
  g.add(box(0.9, 0.06, 0.6, oak, 0, 1.1, 0))
  const top = box(0.95, 0.05, 0.62, oak, 0, 1.2, 0.02)
  top.rotation.x = 0.28
  g.add(top)
  g.add(box(0.95, 0.05, 0.06, oak, 0, 1.11, 0.32))
  const ledger = box(0.42, 0.05, 0.3, M.flat(0x5a3a22, 0.7), -0.12, 1.24, 0.02)
  ledger.rotation.x = 0.28
  g.add(ledger)
  const page = box(0.38, 0.012, 0.26, M.flat(0xe6d8b8, 0.8), -0.12, 1.27, 0.02)
  page.rotation.x = 0.28
  g.add(page)
  g.add(sph(0.05, M.brass, 0.32, 1.17, 0.1, 10))
  g.add(cyl(0.008, 0.008, 0.08, M.brass, 0.32, 1.24, 0.1, 6))
  const candle = new THREE.Group()
  candle.position.set(0.3, 1.1, -0.18)
  g.add(candle)
  candle.add(cyl(0.06, 0.07, 0.02, M.brass, 0, 0.01, 0, 10))
  candle.add(cyl(0.018, 0.018, 0.16, M.flat(0xe8dcc0, 0.6), 0, 0.1, 0, 8))
  fire.addFire(candle, { count: 2, y: -0.73, scale: 0.28 })
  fire.addLight(candle, { color: 0xffb060, intensity: 1.2, distance: 4, y: 0.35 })
  return g
}

/** An innkeeper: apron, rolled sleeves, beard, optionally a tray of tankards. */
export function innkeeper(
  ctx: BuilderContext,
  { skin = 0xc98d70, shirt = 0xe6dcc4, apron = 0x3a3634, beard = 0x4a3a30, tray = true }: { skin?: number; shirt?: number; apron?: number; beard?: number; tray?: boolean } = {}
): THREE.Group {
  const { materials: M } = ctx
  const g = figure(ctx, { h: 1.06, skin, tunic: shirt, legs: 0x4a3a2a, hair: beard, noHair: false })
  g.add(box(0.46, 0.9, 0.04, M.flat(apron, 0.9), 0, 1.0, 0.27))
  g.add(box(0.52, 0.06, 0.54, M.flat(0x2a1c12, 0.9), 0, 1.16, 0))
  const beardMesh = sph(0.12, M.flat(beard), 0, 1.84, 0.06, 12)
  beardMesh.scale.set(0.95, 1.1, 0.75)
  g.add(beardMesh)
  const belly = sph(0.17, M.flat(shirt), 0, 1.36, 0.04, 14)
  belly.scale.set(1.3, 0.9, 1.1)
  g.add(belly)
  if (!tray) return g
  const salver = new THREE.Group()
  salver.position.set(0.38, 1.22, 0.45)
  g.add(salver)
  salver.add(cyl(0.22, 0.22, 0.02, M.brass, 0, 0, 0, 16))
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9ca0, roughness: 0.45, metalness: 0.8 })
  const foam = M.flat(0xf2ead8, 0.8)
  for (const [x, z] of [
    [-0.09, -0.08],
    [0.09, -0.08],
    [-0.09, 0.08],
    [0.09, 0.08],
  ]) {
    salver.add(cyl(0.05, 0.055, 0.16, pewter, x, 0.09, z, 10))
    salver.add(sph(0.05, foam, x, 0.19, z, 8))
  }
  return g
}

/** A seated bard with a lute. Sit them on a stool or bench. */
export function bard(ctx: BuilderContext, extra: FigureOptions = {}): THREE.Group {
  const { materials: M } = ctx
  const g = figure(ctx, { seated: true, tunic: 0x5e3a5c, legs: 0x3f5877, hat: true, ...extra })
  const lute = new THREE.Group()
  lute.position.set(0.05, 1.2, 0.36)
  lute.rotation.set(0.5, 0, -0.9)
  g.add(lute)
  const body = mesh(new THREE.SphereGeometry(0.2, 14, 10), M.wood(1, 1, M.woodTex), 0, 0, 0)
  body.scale.set(0.8, 1, 0.35)
  lute.add(body)
  lute.add(box(0.06, 0.55, 0.03, M.wood(1, 1, M.woodDarkTex), 0, 0.42, 0))
  lute.add(cyl(0.05, 0.05, 0.03, M.flat(0x1a1210), 0, 0.02, 0.07, 10))
  for (let i = 0; i < 4; i++) lute.add(box(0.003, 0.6, 0.003, M.flat(0xd8d0c0, 0.4), -0.02 + i * 0.013, 0.2, 0.075))
  return g
}

/** A patron sat on a bench: tunic and legs randomised, no carried props. */
export function seatedPatron(ctx: BuilderContext, extra: FigureOptions = {}): THREE.Group {
  const { rng } = ctx
  return figure(ctx, { seated: true, h: rng.range(0.92, 1.05), skin: rng.pick(SKIN_TONES), hood: rng.chance(0.12), hat: rng.chance(0.15), ...extra })
}

/** Pewter tankard for a hand or a bar top. */
export function tankard(ctx: BuilderContext): THREE.Group {
  const { materials: M } = ctx
  const g = new THREE.Group()
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9ca0, roughness: 0.45, metalness: 0.8 })
  g.add(cyl(0.05, 0.06, 0.16, pewter, 0, 0.08, 0, 10))
  g.add(mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10), pewter, 0.07, 0.08, 0))
  g.add(sph(0.05, M.flat(0xf2ead8, 0.8), 0, 0.17, 0, 8))
  return g
}
