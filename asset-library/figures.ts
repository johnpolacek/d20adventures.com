// Figures and marks added to a running Stage: a rigged figure in place of a cast member's card, a ring under each cast
// member, and a patch of shade under each crowd member. The asset library's scenes and the stage lab both use them.

import type { Stage } from "@d20/stage"
import { heldBow, weaponIn } from "@d20/stage/figures/weapons"
import * as THREE from "three"
import { figureClips, isRigged } from "./clips"
import { holdProps } from "./props"

// The room a figure reflects: one for each renderer, made the first time a figure asks.
const figureRooms = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()
async function figureRoom(stage: Stage) {
  const had = figureRooms.get(stage.renderer)
  if (had) return had
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js")
  const pmrem = new THREE.PMREMGenerator(stage.renderer)
  const made = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  figureRooms.set(stage.renderer, made)
  return made
}

// A figure rigged by rig.py carries the shared skeleton and no clips: it plays the written ones (clips.ts), `clip` or Idle.
// `env` is how brightly it reflects its room: 0 leaves it to the stage's own sky.
export async function addFigure(stage: Stage, url: string, castId: string, o: { yaw?: number; keep?: boolean; clip?: string; env?: number } = {}) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
  const s = stage.standees.items.get(castId)
  if (!s) throw new Error(`No cast member ${castId}`)
  const gltf = await new GLTFLoader().loadAsync(url)
  const root = gltf.scene
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const scale = s.cast.height / Math.max(box.max.y - box.min.y, 1e-3)
  root.scale.setScalar(scale)
  const lift = -box.min.y * scale
  // Where the cast member stands and faces, followed every frame. A glTF figure faces +z, as the engine's yaw 0 does.
  const place = () => {
    root.position.set(s.cast.x, lift + (s.cast.y ?? 0), s.cast.z)
    root.rotation.y = THREE.MathUtils.degToRad(o.yaw ?? 0) + s.cast.ry
  }
  place()
  // What it holds is stood beside it before it is lit, so the prop is lit as the figure is.
  const carried = isRigged(root) ? holdProps(root, box.min.y) : null
  // A bow through a hand made round a rod, carried as the game carries it (packages/stage/src/figures/weapons.ts).
  const kept = isRigged(root) ? heldBow(root) : null
  if (kept) weaponIn(root, "bow", kept.hand, kept)
  let triangles = 0
  // A generated figure is real metal and leather, which shows by what it reflects. The stage's own sky is kept dim for
  // its painted cards, so a figure in it goes dark. Each figure reflects a plain lit room of its own instead, dimmer
  // indoors, and its metal is kept a little short of a mirror so that some of the stage's light still colours it.
  const rooms = (stage as unknown as { set: { rooms?: { box: number[] }[] } }).set.rooms ?? []
  const indoors = rooms.some(({ box: b }) => s.cast.x > b[0] && s.cast.x < b[3] && s.cast.z > b[2] && s.cast.z < b[5])
  const shine = o.env ?? (indoors ? 0.3 : 0.55)
  const room = shine > 0 ? await figureRoom(stage) : null
  root.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return
    m.castShadow = m.receiveShadow = true
    m.frustumCulled = false
    triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!room || !(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.envMap = room
      mat.envMapIntensity = shine
      mat.metalness = Math.min(mat.metalness, 0.8)
      mat.roughness = Math.max(mat.roughness, 0.4)
      // A generated skin shines like wax and its relief is cut too deep: both catch a low light as streaks on a face.
      mat.normalScale.setScalar(0.7)
    }
  })
  root.name = "lab:figure"
  stage.scene.add(root)
  // The standee's own update shows it again every frame, so its group is pinned hidden.
  if (!o.keep) Object.defineProperty(s.grp, "visible", { get: () => false, set: () => {} })
  const mixer = new THREE.AnimationMixer(root)
  const clips = gltf.animations.length || !isRigged(root) ? gltf.animations : figureClips(root, box.max.y - box.min.y)
  const first = clips.find((c) => c.name === o.clip) ?? clips[0]
  let playing = first ? mixer.clipAction(first).play() : null
  // Another clip by name, eased into over a fifth of a second.
  const play = (name: string) => {
    const next = clips.find((c) => c.name === name)
    if (!next) return false
    held = false
    const action = mixer.clipAction(next).reset().play()
    if (playing && playing !== action) playing.crossFadeTo(action, 0.2, false)
    playing = action
    return true
  }
  let last = performance.now()
  let alive = true
  // A clip held at one moment, for a capture: the figure stops playing until `play` is called.
  let held = false
  const pose = (name: string, seconds: number) => {
    if (!play(name) || !playing) return false
    held = true
    playing.time = seconds
    mixer.update(0)
    carried?.update()
    return true
  }
  const tick = (now: number) => {
    if (!alive) return
    if (!held) mixer.update(Math.min(0.1, (now - last) / 1000))
    carried?.update()
    place()
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return { root, mixer, triangles, play, pose, clips: clips.map((a) => `${a.name} ${a.duration.toFixed(1)}s`), stop: () => (alive = false) }
}

// A ring on the ground under each cast member, as a game marks who can be chosen: gold under `chosen`, pale under the
// rest. From high and far a person is a few dozen pixels, and a crowd of them hides the ones that matter.
export function castRings(stage: Stage, chosen: string[]) {
  const group = new THREE.Group()
  group.name = "lab:rings"
  const ring = new THREE.RingGeometry(0.475, 0.5, 48)
  ring.rotateX(-Math.PI / 2)
  const rings = stage.cast.map((c) => {
    const gold = chosen.includes(c.id)
    const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: gold ? "#ffd27a" : "#f1e6d2", transparent: true, opacity: gold ? 0.95 : 0.55, depthWrite: false, toneMapped: false }))
    mesh.scale.setScalar(Math.max(0.7, c.height / 1.75))
    mesh.renderOrder = 2
    group.add(mesh)
    return { c, mesh }
  })
  stage.scene.add(group)
  let alive = true
  const tick = () => {
    if (!alive) return
    for (const { c, mesh } of rings) {
      mesh.position.set(c.x, (c.y ?? 0) + 0.04, c.z)
      mesh.visible = stage.isOnStage(c.id)
    }
    requestAnimationFrame(tick)
  }
  tick()
  return {
    stop: () => {
      alive = false
      group.removeFromParent()
      ring.dispose()
    },
  }
}

// A soft patch of shade on the ground under every crowd member. A card throws a sliver of a shadow, as thin as it is,
// so from above the crowd looks pasted on. The cast's own cards have had such a patch all along (standees.ts).
export function crowdShade(stage: Stage, strength = 0.4) {
  const people = stage.crowd.people as { x: number; y?: number; z: number; s?: number; cf?: number }[]
  const cv = document.createElement("canvas")
  cv.width = cv.height = 64
  const g = cv.getContext("2d") as CanvasRenderingContext2D
  const fall = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  fall.addColorStop(0, "#fff")
  fall.addColorStop(0.55, "#777")
  fall.addColorStop(1, "#000")
  g.fillStyle = fall
  g.fillRect(0, 0, 64, 64)
  const map = new THREE.CanvasTexture(cv)
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color: "#000", alphaMap: map, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, people.length))
  mesh.name = "lab:crowd-shade"
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  stage.scene.add(mesh)
  const at = new THREE.Object3D()
  let alive = true
  const tick = () => {
    if (!alive) return
    people.forEach((p, i) => {
      // Someone faded out of the camera's way takes their shade with them.
      const size = 0.95 * (p.s ?? 1) * (1 - (p.cf ?? 0))
      at.position.set(p.x, (p.y ?? 0) + 0.025, p.z)
      at.scale.set(size, 1, size * 0.8)
      at.updateMatrix()
      mesh.setMatrixAt(i, at.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    requestAnimationFrame(tick)
  }
  tick()
  return {
    stop: () => {
      alive = false
      mesh.removeFromParent()
      geo.dispose()
      mat.dispose()
      map.dispose()
    },
  }
}
