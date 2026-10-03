import * as THREE from "three"
import { TAU } from "./kit/geometry"
import type { Rand } from "./kit/rng"
import { type SharedUniforms, stageMaterial } from "./materials/atmosphere"

export type LifeUpdate = (t: number) => void
export interface Disposable {
  dispose: () => void
}

// Rooks wheel around the towers on long, lazy circuits.
export function birds(
  root: THREE.Object3D,
  shared: SharedUniforms,
  rand: Rand,
  o: { count: number; center: [number, number]; spread: [number, number]; radius: [number, number]; height: [number, number] }
): LifeUpdate & Disposable {
  const n = o.count
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.12, -0.1, 0, 0, -0.2, 0, 0, 0.25, 0.9, 0.12, -0.1, 0, 0, -0.2], 3))
  g.setAttribute("wing", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 1))
  g.computeVertexNormals()
  const m = stageMaterial(new THREE.MeshBasicMaterial({ color: "#2a2220", side: THREE.DoubleSide }), shared, "birds", (s) => {
    s.uniforms.uTime = shared.time
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float wing; uniform float uTime;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat ph = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .21;\ntransformed.y += wing * sin(uTime * 9.0 + ph) * .55;")
  })
  const mesh = new THREE.InstancedMesh(g, m, n)
  mesh.frustumCulled = false
  mesh.name = "birds"
  root.add(mesh)
  const [cx, cz] = o.center
  const flock = Array.from({ length: n }, () => ({
    cx: cx + rand(-o.spread[0], o.spread[0]),
    cz: cz + rand(-o.spread[1], o.spread[1]),
    r: rand(o.radius[0], o.radius[1]),
    y: rand(o.height[0], o.height[1]),
    w: rand(0.05, 0.12) * (rand() < 0.5 ? -1 : 1),
    ph: rand(0, TAU),
    s: rand(0.6, 1.1),
  }))
  const d = new THREE.Object3D()
  const update = ((t: number) => {
    flock.forEach((b, i) => {
      const a = b.ph + t * b.w
      d.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 2.3) * 3, b.cz + Math.sin(a) * b.r * 0.6)
      d.rotation.set(0, -a + (b.w > 0 ? 0 : Math.PI), Math.sin(a * 3) * 0.2)
      d.scale.setScalar(b.s)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }) as LifeUpdate & Disposable
  update.dispose = () => {
    g.dispose()
    m.dispose()
    mesh.dispose()
  }
  return update
}

// Dust hanging in the sunlit air.
export function dust(root: THREE.Object3D, shared: SharedUniforms, rand: Rand, o: { count: number; box: [number, number, number, number, number, number] }): LifeUpdate & Disposable {
  const [x0, y0, z0, x1, y1, z1] = o.box
  const p = new Float32Array(o.count * 3)
  for (let i = 0; i < o.count; i++) p.set([rand(x0, x1), rand(y0, y1), rand(z0, z1)], i * 3)
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(p, 3))
  const c = document.createElement("canvas")
  c.width = c.height = 32
  const x = c.getContext("2d")!
  const r = x.createRadialGradient(16, 16, 0, 16, 16, 16)
  r.addColorStop(0, "#fff3dc")
  r.addColorStop(1, "#fff3dc00")
  x.fillStyle = r
  x.fillRect(0, 0, 32, 32)
  const tex = new THREE.CanvasTexture(c)
  // Motes right beside the lens would bloom into discs; keep every mote a speck.
  const m = stageMaterial(
    new THREE.PointsMaterial({ size: 0.09, map: tex, transparent: true, opacity: 0.5, depthWrite: false, color: "#ffe2b0", blending: THREE.AdditiveBlending }),
    shared,
    "dust",
    (s) => {
      s.vertexShader = s.vertexShader.replace("#include <fog_vertex>", "#include <fog_vertex>\ngl_PointSize = min(gl_PointSize, 5.0);")
    }
  )
  const pts = new THREE.Points(g, m)
  pts.name = "dust"
  root.add(pts)
  const update = ((t: number) => {
    pts.position.y = Math.sin(t * 0.2) * 0.3
    pts.rotation.y = Math.sin(t * 0.03) * 0.02
  }) as LifeUpdate & Disposable
  update.dispose = () => {
    g.dispose()
    m.dispose()
    tex.dispose()
  }
  return update
}

// Countryside beyond the town: harvested fields and low hills under the haze.
export function land(root: THREE.Object3D, shared: SharedUniforms, rand: Rand, o: { inner: number; outer: number; palette: string[]; hills: number }): Disposable {
  const g = new THREE.RingGeometry(o.inner, o.outer, 160, 24)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  const col: number[] = []
  const c = new THREE.Color()
  const pal = o.palette.map((h) => new THREE.Color(h))
  const rise = o.inner + (o.outer - o.inner) * 0.16
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const zz = p.getZ(i)
    const r = Math.hypot(x, zz)
    const hill = (Math.sin(x * 0.006) * Math.cos(zz * 0.005) * 18 + Math.sin(x * 0.013 + zz * 0.009) * 7 + Math.max(0, r - o.outer * 0.54) * 0.06) * o.hills
    p.setY(i, Math.max(0, hill) * THREE.MathUtils.smoothstep(r, o.inner, rise) - 0.15)
    const k = Math.abs(Math.floor(x / 60) * 7 + Math.floor(zz / 45) * 13) % pal.length
    c.copy(pal[k]).multiplyScalar(0.85 + 0.3 * rand())
    col.push(c.r, c.g, c.b)
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  const m = stageMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), shared, "land")
  const mesh = new THREE.Mesh(g, m)
  mesh.receiveShadow = true
  mesh.name = "land"
  mesh.matrixAutoUpdate = false
  root.add(mesh)
  return {
    dispose: () => {
      g.dispose()
      m.dispose()
    },
  }
}
