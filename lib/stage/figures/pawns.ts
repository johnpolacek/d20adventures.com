import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { M4, V } from "../kit/geometry"
import { type SharedUniforms, stageMaterial } from "../materials/atmosphere"

// Procedural crowd pawns: the far and steep-view representation of a crowd member (cards take over near the eye).
// Zones let every figure share one material while wearing its own colours:
// 0 skin · 1 garment · 2 accent · 3 steel · 4 leather and wood · 5 brass.
class Figure {
  parts: THREE.BufferGeometry[] = []
  // Pawns are seen far off or from above (cards take over near the eye), so their tessellation is coarse and details
  // under 3 cm (ears, nose) are dropped: about a quarter of the prototype's triangles.
  constructor(private low: boolean) {}
  private seg(n: number, min: number) {
    return this.low ? Math.max(min, Math.round(n * 0.4)) : n
  }
  add(geo: THREE.BufferGeometry, zone: number, m: THREE.Matrix4) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m)
    geo.dispose()
    g.deleteAttribute("uv")
    g.setAttribute("zone", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(zone), 1))
    this.parts.push(g)
    return this
  }
  sphere(z: number, x: number, y: number, zz: number, sx: number, sy = sx, sz = sx, seg = 10) {
    if (this.low && Math.max(sx, sy, sz) < 0.03) return this
    const s = this.seg(seg, 5)
    return this.add(new THREE.SphereGeometry(1, s, Math.max(3, Math.ceil(s * 0.6))), z, M4(x, y, zz, 0, sx, sy, sz))
  }
  lathe(z: number, pts: [number, number][], x = 0, zz = 0, sx = 1, sz = sx, seg = 14) {
    return this.add(
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        this.seg(seg, 5)
      ),
      z,
      M4(x, 0, zz, 0, sx, 1, sz)
    )
  }
  box(z: number, x: number, y: number, zz: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), z, M4(x, y, zz, ry, 1, 1, 1, rx, rz))
  }
  limb(z: number, a: [number, number, number], b: [number, number, number], r: number, r2 = r) {
    const A = V(...a)
    const B = V(...b)
    const d = B.clone().sub(A)
    return this.add(
      new THREE.CylinderGeometry(r2, r, d.length(), this.seg(7, 4)),
      z,
      new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1))
    )
  }
  cone(z: number, x: number, y: number, zz: number, r: number, h: number, rx = 0) {
    return this.add(new THREE.ConeGeometry(r, h, this.seg(6, 4)), z, M4(x, y, zz, 0, 1, 1, 1, rx))
  }
  torus(z: number, r: number, t: number, m: THREE.Matrix4, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(r, t, 3, this.seg(24, 8), arc), z, m)
  }
  build() {
    const g = mergeGeometries(this.parts, false)!
    for (const p of this.parts) p.dispose()
    g.computeBoundingSphere()
    return g
  }
}
const head = (f: Figure, hood = false, y = 1.6) => {
  f.sphere(0, 0, y, 0.02, 0.095, 0.118, 0.105, 12)
  f.sphere(0, 0, y - 0.01, 0.12, 0.022, 0.035, 0.03, 6)
  for (const s of [-1, 1]) f.sphere(4, s * 0.035, y + 0.02, 0.112, 0.014, 0.01, 0.008, 5)
  if (hood) {
    f.cone(2, 0, y + 0.07, -0.13, 0.09, 0.22, -1.9)
    f.sphere(2, 0, y + 0.03, -0.055, 0.14, 0.155, 0.15, 12)
    f.lathe(
      2,
      [
        [0.2, y - 0.2],
        [0.17, y - 0.1],
        [0.1, y - 0.02],
        [0, y],
      ],
      0,
      -0.02,
      1,
      0.9
    )
  }
}
const cloakBody = (f: Figure) =>
  f.lathe(
    1,
    [
      [0, 0],
      [0.31, 0],
      [0.3, 0.08],
      [0.27, 0.5],
      [0.23, 1.0],
      [0.21, 1.3],
      [0.22, 1.4],
      [0.16, 1.48],
      [0.07, 1.51],
      [0, 1.52],
    ],
    0,
    0,
    1,
    0.78
  )

function traveler(low: boolean, pack: boolean) {
  const f = new Figure(low)
  cloakBody(f)
  head(f, true)
  f.sphere(1, -0.2, 1.15, 0.05, 0.08, 0.2, 0.09)
  f.sphere(1, 0.2, 1.15, 0.05, 0.08, 0.2, 0.09)
  f.lathe(
    2,
    [
      [0.235, 1.22],
      [0.25, 1.3],
      [0.2, 1.44],
      [0.12, 1.5],
    ],
    0,
    0,
    1,
    0.82
  )
  if (pack) {
    f.box(4, 0, 1.12, -0.26, 0.36, 0.5, 0.22)
    f.limb(2, [-0.2, 1.42, -0.24], [0.2, 1.42, -0.24], 0.08)
  }
  return f.build()
}
function pilgrim(low: boolean) {
  const f = new Figure(low)
  cloakBody(f)
  head(f, true)
  f.limb(2, [-0.2, 0.95, 0.12], [0.2, 0.95, 0.12], 0.03)
  f.limb(4, [0.27, 0, 0.16], [0.3, 1.95, 0.2], 0.025, 0.02)
  f.sphere(0, 0.27, 1.12, 0.17, 0.045)
  f.limb(1, [0.2, 1.38, 0.02], [0.26, 1.12, 0.14], 0.06, 0.05)
  return f.build()
}
function soldier(low: boolean, heavy: boolean) {
  const f = new Figure(low)
  for (const s of [-1, 1]) {
    f.limb(2, [s * 0.1, 0.08, 0], [s * 0.11, 0.88, 0], 0.07, 0.075)
    f.limb(4, [s * 0.1, 0, 0.02], [s * 0.1, 0.3, 0.02], 0.082, 0.075)
    f.box(4, s * 0.1, 0.03, 0.06, 0.12, 0.06, 0.22)
  }
  f.lathe(2, [
    [0.2, 0.78],
    [0.26, 0.82],
    [0.22, 1.02],
    [0.19, 1.05],
  ])
  f.lathe(
    3,
    [
      [0.19, 0.98],
      [0.21, 1.08],
      [0.235, 1.28],
      [0.22, 1.42],
      [0.14, 1.49],
      [0.06, 1.52],
      [0, 1.52],
    ],
    0,
    0,
    1,
    0.82
  )
  f.box(1, 0, 1.0, 0.135, 0.32, 0.62, 0.03)
  for (const s of [-1, 1]) {
    f.sphere(3, s * 0.24, 1.42, 0, 0.13, 0.1, 0.13)
    f.limb(3, [s * 0.27, 1.38, 0], [s * 0.3, 1.08, 0.06], 0.06, 0.055)
    f.limb(3, [s * 0.3, 1.08, 0.06], [s * 0.27, 0.88, 0.18], 0.05, 0.045)
    f.sphere(0, s * 0.27, 0.86, 0.2, 0.045)
  }
  f.sphere(0, 0, 1.6, 0.02, 0.09, 0.11, 0.1, 10)
  if (heavy) {
    f.sphere(3, 0, 1.65, -0.005, 0.12, 0.115, 0.125, 12)
    f.box(3, 0, 1.58, 0.115, 0.025, 0.12, 0.02)
    f.lathe(
      1,
      [
        [0.3, 0.25],
        [0.28, 0.6],
        [0.25, 1.1],
        [0.24, 1.4],
        [0.2, 1.46],
      ],
      0,
      -0.08,
      1,
      0.6,
      12
    )
    f.cone(3, 0, 1.83, 0, 0.04, 0.2)
    f.sphere(1, 0, 1.8, -0.06, 0.04, 0.1, 0.16)
    f.limb(4, [0.3, 0, 0.2], [0.3, 2.5, 0.2], 0.025)
    f.box(3, 0.3, 2.45, 0.25, 0.02, 0.3, 0.22)
  } else {
    f.lathe(3, [
      [0, 1.79],
      [0.08, 1.775],
      [0.125, 1.72],
      [0.13, 1.66],
      [0.21, 1.635],
      [0.215, 1.62],
      [0.13, 1.625],
      [0, 1.63],
    ])
    f.torus(5, 0.212, 0.008, M4(0, 1.628, 0, 0, 1, 1, 1, Math.PI / 2))
    f.limb(4, [0.28, 0, 0.2], [0.28, 2.7, 0.2], 0.022)
    f.cone(3, 0.28, 2.82, 0.2, 0.04, 0.28)
    f.add(new THREE.CylinderGeometry(0.34, 0.34, 0.04, low ? 8 : 16), 1, M4(-0.34, 1.05, 0.12, 0, 1, 1, 1, Math.PI / 2 - 0.2, -0.15))
    f.torus(5, 0.34, 0.02, M4(-0.336, 1.05, 0.14, 0, 1, 1, 1, -0.2, -0.15))
    f.sphere(5, -0.35, 1.05, 0.15, 0.08, 0.08, 0.05)
  }
  return f.build()
}
function merchant(low: boolean) {
  const f = new Figure(low)
  f.lathe(
    1,
    [
      [0, 0],
      [0.29, 0],
      [0.28, 0.1],
      [0.26, 0.7],
      [0.25, 1.0],
      [0.24, 1.3],
      [0.21, 1.42],
      [0.1, 1.5],
      [0, 1.52],
    ],
    0,
    0,
    1,
    0.85
  )
  f.lathe(2, [
    [0.27, 0.95],
    [0.27, 1.05],
    [0.26, 1.05],
  ])
  f.box(2, 0, 1.0, 0.02, 0.56, 0.1, 0.45)
  head(f)
  f.lathe(4, [
    [0.2, 1.71],
    [0.19, 1.73],
    [0.11, 1.75],
    [0.1, 1.84],
    [0, 1.86],
  ])
  for (const s of [-1, 1]) {
    f.limb(1, [s * 0.22, 1.4, 0], [s * 0.27, 1.02, 0.05], 0.07, 0.06)
    f.sphere(0, s * 0.27, 0.98, 0.06, 0.045)
  }
  f.box(4, 0, 1.18, -0.29, 0.42, 0.62, 0.28)
  f.limb(2, [-0.22, 1.5, -0.3], [0.22, 1.5, -0.3], 0.09)
  return f.build()
}
function woman(low: boolean) {
  const f = new Figure(low)
  f.lathe(
    1,
    [
      [0, 0],
      [0.32, 0],
      [0.3, 0.15],
      [0.24, 0.7],
      [0.19, 1.0],
      [0.2, 1.25],
      [0.19, 1.38],
      [0.1, 1.46],
      [0, 1.47],
    ],
    0,
    0,
    1,
    0.82
  )
  f.lathe(
    2,
    [
      [0.25, 0.55],
      [0.24, 0.8],
      [0.2, 1.02],
      [0.19, 1.02],
    ],
    0,
    0.02,
    1,
    0.9
  )
  f.lathe(
    2,
    [
      [0.24, 1.22],
      [0.25, 1.3],
      [0.18, 1.42],
      [0.1, 1.45],
    ],
    0,
    0,
    1,
    0.9
  )
  f.sphere(0, 0, 1.56, 0.02, 0.088, 0.11, 0.1, 12)
  f.sphere(2, 0, 1.6, -0.03, 0.11, 0.12, 0.12, 12)
  for (const s of [-1, 1]) {
    f.limb(1, [s * 0.2, 1.34, 0], [s * 0.24, 1.05, 0.08], 0.055, 0.045)
    f.sphere(0, s * 0.24, 1.02, 0.1, 0.04)
  }
  f.lathe(
    4,
    [
      [0.12, 0],
      [0.2, 0.22],
      [0.19, 0.24],
    ],
    0.3,
    0.08
  )
  f.torus(4, 0.16, 0.015, M4(0.3, 1.25, 0.08, 0), Math.PI)
  return f.build()
}
function porter(low: boolean) {
  const f = new Figure(low)
  for (const s of [-1, 1]) {
    f.limb(2, [s * 0.1, 0.08, 0], [s * 0.11, 0.82, 0], 0.07, 0.075)
    f.limb(4, [s * 0.1, 0, 0.02], [s * 0.1, 0.26, 0.02], 0.08, 0.075)
  }
  f.lathe(
    1,
    [
      [0.24, 0.7],
      [0.22, 0.9],
      [0.22, 1.2],
      [0.2, 1.4],
      [0.12, 1.48],
      [0, 1.5],
    ],
    0,
    0,
    1,
    0.82
  )
  head(f, false, 1.6)
  f.sphere(4, 0, 1.66, -0.01, 0.1, 0.06, 0.1)
  f.limb(1, [-0.22, 1.38, 0], [-0.27, 1.0, 0.06], 0.065, 0.055)
  f.sphere(0, -0.27, 0.97, 0.06, 0.045)
  f.limb(1, [0.22, 1.4, 0], [0.26, 1.7, 0.05], 0.065, 0.055)
  f.sphere(2, 0.12, 1.72, -0.02, 0.3, 0.2, 0.2, 10)
  return f.build()
}
function child(low: boolean) {
  const f = new Figure(low)
  f.lathe(
    1,
    [
      [0, 0],
      [0.2, 0],
      [0.19, 0.1],
      [0.16, 0.55],
      [0.15, 0.8],
      [0.12, 0.9],
      [0, 0.92],
    ],
    0,
    0,
    1,
    0.82
  )
  f.sphere(0, 0, 1.0, 0.01, 0.085, 0.1, 0.09, 10)
  f.sphere(4, 0, 1.05, -0.02, 0.09, 0.07, 0.09)
  return f.build()
}

export const PAWN_KINDS = ["traveler", "packer", "pilgrim", "soldier", "knight", "merchant", "woman", "porter", "child"] as const
export type PawnKind = (typeof PAWN_KINDS)[number]
export const MILITARY: ReadonlySet<PawnKind> = new Set(["soldier", "knight"])

export function buildPawnGeometries(low = true): Record<PawnKind, THREE.BufferGeometry> {
  return {
    traveler: traveler(low, false),
    packer: traveler(low, true),
    pilgrim: pilgrim(low),
    soldier: soldier(low, false),
    knight: soldier(low, true),
    merchant: merchant(low),
    woman: woman(low),
    porter: porter(low),
    child: child(low),
  }
}

// Valkaran homespun: harvest orange, moss green, oak brown, ochre, undyed cream,
// with a few Asterian merchants in navy and crimson.
export const CLOTH = ["#8a4a24", "#9a5a2a", "#4a5a34", "#3e4e30", "#5a4130", "#4a3526", "#8a6a3a", "#b8a888", "#9c8e70", "#6a5a44", "#7a3a24", "#2a3450", "#6a2426", "#5a5042"]
export const ACCENT = ["#c2b08c", "#b8a07a", "#8a7458", "#a4553a", "#5c6a3a", "#3a3230", "#c07a36", "#6a6e62"]
export const TABARD = ["#1d2b4a", "#22325a", "#1a2642", "#26386a"]
export const MILITARY_ACCENT = ["#3a3430", "#4a3a2e", "#2e2a28"]

export function pawnMaterial(shared: SharedUniforms) {
  const m = new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.85 })
  return stageMaterial(m, shared, "crowd-pawn", (s) => {
    s.uniforms.uTime = shared.time
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float zone; attribute vec3 iA; attribute vec3 iB; attribute vec4 iP;
uniform float uTime; varying float vZone; varying vec3 vA; varying vec3 vB; varying float vSkin;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vZone = zone; vA = iA; vB = iB; vSkin = iP.z;
float ph = iP.x * 6.2832, walk = iP.y, sc = iP.w;
float stride = sin(uTime * 5.2 * sc + ph);
transformed.x += sin(uTime * (.8 + iP.x * .5) + ph) * .012 * position.y * (1.0 - walk);
transformed.y += walk * abs(stride) * .035 * smoothstep(.6, 1.5, position.y);
transformed.z += walk * stride * .05 * (1.0 - smoothstep(0.0, .9, position.y)) * sign(position.x + .001);
transformed.z += walk * .03 * smoothstep(.8, 1.6, position.y);`
      )
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vZone; varying vec3 vA; varying vec3 vB; varying float vSkin;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 skin = mix(vec3(.46, .27, .18), vec3(.2, .1, .06), vSkin);
vec3 zc = vZone < .5 ? skin : vZone < 1.5 ? vA : vZone < 2.5 ? vB : vZone < 3.5 ? vec3(.3, .3, .3) : vZone < 4.5 ? vec3(.09, .06, .045) : vec3(.62, .45, .17);
diffuseColor.rgb *= zc;`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nif (vZone > 2.5 && vZone < 3.5) roughnessFactor = .36; if (vZone > 4.5) roughnessFactor = .32;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nif ((vZone > 2.5 && vZone < 3.5) || vZone > 4.5) metalnessFactor = .8;")
  })
}
