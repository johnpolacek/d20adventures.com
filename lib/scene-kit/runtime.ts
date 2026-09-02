// scene-kit runtime: renderer, post chain, controls and the frame loop for a
// standalone viewer of one set. The app's own renderer can bypass this and call
// the set's build() against its own scene; this is what the dev preview and the
// pipeline's render stage use.

import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { FireSystem } from "./atmosphere"
import { Rng } from "./core"
import { MaterialLibrary } from "./materials"
import type { SceneSet, SetContext, SetDefinition, SetToggles } from "./set"
import type { TimeUniform } from "./shaders"
import { configureTextures } from "./textures"

export interface RuntimeOptions {
  container: HTMLElement
  set: SetDefinition
  toggles?: SetToggles
  seed?: number
  /** Called for each loading stage. */
  onProgress?: (message: string) => void
  /** Cap on devicePixelRatio. */
  maxPixelRatio?: number
  bloom?: { strength: number; radius: number; threshold: number } | false
  /** Free-fly keys (WASD, Q/E, shift). */
  flyControls?: boolean
}

export interface SceneRuntime {
  set: SceneSet
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  /** Jump to one of the set's named cameras. */
  setCamera(name: string): void
  /** Render statistics from the last frame. */
  stats(): { calls: number; triangles: number; fps: number }
  dispose(): void
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Create a set's context against a renderer and scene. Shared by the runtime and by hosts with their own loop. */
export function createSetContext(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  { seed = 20240901, toggles = {}, onProgress }: { seed?: number; toggles?: SetToggles; onProgress?: (message: string) => void }
): SetContext {
  configureTextures({ anisotropy: renderer.capabilities.getMaxAnisotropy() })
  const time: TimeUniform = { value: 0 }
  const rng = new Rng(seed)
  const materials = new MaterialLibrary()
  const fire = new FireSystem(materials, rng.fork(0xf1e))
  return {
    scene,
    renderer,
    time,
    rng,
    materials,
    toggles,
    fire,
    progress: async (message) => {
      onProgress?.(message)
      await nextFrame()
    },
  }
}

export async function createRuntime({
  container,
  set: definition,
  toggles = {},
  seed,
  onProgress,
  maxPixelRatio = 2,
  bloom = { strength: 0.32, radius: 0.7, threshold: 0.9 },
  flyControls = true,
}: RuntimeOptions): Promise<SceneRuntime> {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = "block"
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 900)
  const ctx = createSetContext(scene, renderer, { seed, toggles, onProgress })
  const set = await definition.build(ctx)
  scene.add(set.root)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2 - 0.01
  controls.minDistance = 0.3
  controls.maxDistance = 200
  controls.zoomSpeed = 0.8

  const setCamera = (name: string) => {
    const shot = set.cameras[name] ?? Object.values(set.cameras)[0]
    if (!shot) return
    camera.fov = shot.fov ?? 38
    camera.updateProjectionMatrix()
    camera.position.set(...shot.position)
    controls.target.set(...shot.target)
    controls.update()
  }
  setCamera(Object.keys(set.cameras)[0])

  const keys: Record<string, boolean> = {}
  const onKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true
  }
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false
  }
  if (flyControls) {
    addEventListener("keydown", onKeyDown)
    addEventListener("keyup", onKeyUp)
  }
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const delta = new THREE.Vector3()
  const fly = (dt: number) => {
    const speed = (keys.ShiftLeft || keys.ShiftRight ? 14 : 5) * dt
    camera.getWorldDirection(forward)
    right.crossVectors(forward, camera.up).normalize()
    delta.set(0, 0, 0)
    if (keys.KeyW) delta.add(forward)
    if (keys.KeyS) delta.sub(forward)
    if (keys.KeyD) delta.add(right)
    if (keys.KeyA) delta.sub(right)
    if (keys.KeyE) delta.y += 1
    if (keys.KeyQ) delta.y -= 1
    if (delta.lengthSq() > 0) {
      delta.normalize().multiplyScalar(speed)
      camera.position.add(delta)
      controls.target.add(delta)
    }
    const floor = set.groundHeight(camera.position.x, camera.position.z) + 0.4
    if (camera.position.y < floor) {
      controls.target.y += floor - camera.position.y
      camera.position.y = floor
    }
  }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(container.clientWidth, container.clientHeight, { type: THREE.HalfFloatType, samples: 4 }))
  composer.addPass(new RenderPass(scene, camera))
  if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), bloom.strength, bloom.radius, bloom.threshold))
  composer.addPass(new OutputPass())

  const resize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  // The composer renders several passes per frame; with autoReset the info
  // block would only ever describe the last (fullscreen quad) pass.
  renderer.info.autoReset = false
  const clock = new THREE.Clock()
  let fps = 0
  let frames = 0
  let fpsAt = 0
  let running = true
  const frame = () => {
    if (!running) return
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, clock.getDelta())
    const t = clock.elapsedTime
    ctx.time.value = t
    renderer.info.reset()
    if (flyControls) fly(dt)
    controls.update()
    for (const a of set.animated) a.update(t, dt)
    composer.render()
    frames++
    if (t - fpsAt >= 1) {
      fps = frames / (t - fpsAt)
      frames = 0
      fpsAt = t
    }
  }
  frame()

  return {
    set,
    renderer,
    scene,
    camera,
    controls,
    setCamera,
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps }),
    dispose() {
      running = false
      observer.disconnect()
      removeEventListener("keydown", onKeyDown)
      removeEventListener("keyup", onKeyUp)
      controls.dispose()
      set.dispose()
      ctx.materials.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
