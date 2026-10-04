import * as THREE from "three"
import type { SharedUniforms } from "../materials/atmosphere"

// A planar reflection for still water: the scene rendered once more from a camera mirrored in the water plane, into a
// reduced-size linear target that water materials with a `mirror` sample through `shared.reflectMatrix`. An oblique near
// plane cuts away everything below the water, so hulls and pilings do not reflect from underneath. The math follows
// three's Reflector. Shadow maps are reused from the main render, not drawn again.
export class PlanarMirror {
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private virtual = new THREE.PerspectiveCamera()
  private normal = new THREE.Vector3(0, 1, 0)
  private point: THREE.Vector3
  private scale = 0.5
  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private shared: SharedUniforms,
    private water: THREE.Object3D[],
    level: number,
    // Small or soft things the reflection leaves out (grass, reeds, ferns, moss, mist): costly to draw twice, lost in ripples.
    private skip: THREE.Object3D[] = []
  ) {
    this.point = new THREE.Vector3(0, level, 0)
    this.target.texture.generateMipmaps = false
    shared.reflectMap.value = this.target.texture
  }
  // `scale` is the share of the drawing buffer the reflection renders at; 0 turns it off.
  setScale(scale: number, width: number, height: number) {
    this.scale = scale
    this.shared.mirrorOn.value = scale > 0 ? 1 : 0
    if (scale > 0) this.target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  }
  render(camera: THREE.PerspectiveCamera) {
    if (this.scale <= 0) return
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const view = this.point.clone().sub(camPos)
    // From below the water there is nothing to reflect.
    if (view.dot(this.normal) > 0) {
      this.shared.mirrorOn.value = 0
      return
    }
    this.shared.mirrorOn.value = 1
    view.reflect(this.normal).negate().add(this.point)
    const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld)
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(camPos)
    const target = this.point.clone().sub(look).reflect(this.normal).negate().add(this.point)
    const v = this.virtual
    v.position.copy(view)
    v.up.set(0, 1, 0).applyMatrix4(rotation).reflect(this.normal)
    v.lookAt(target)
    v.far = camera.far
    v.updateMatrixWorld()
    v.projectionMatrix.copy(camera.projectionMatrix)
    this.shared.reflectMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse)
    // Oblique near plane at the water (Lengyel), so nothing under the surface draws.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.point).applyMatrix4(v.matrixWorldInverse)
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const e = v.projectionMatrix.elements
    const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    clip.multiplyScalar(2 / clip.dot(q))
    e[2] = clip.x
    e[6] = clip.y
    e[10] = clip.z + 1 - 0.003
    e[14] = clip.w
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert()
    const r = this.renderer
    const prevTarget = r.getRenderTarget()
    const prevShadow = r.shadowMap.autoUpdate
    r.shadowMap.autoUpdate = false
    const hidden = [...this.water, ...this.skip].filter((o) => o.visible)
    for (const o of hidden) o.visible = false
    r.setRenderTarget(this.target)
    r.clear()
    r.render(this.scene, v)
    for (const o of hidden) o.visible = true
    r.setRenderTarget(prevTarget)
    r.shadowMap.autoUpdate = prevShadow
  }
  dispose() {
    this.target.dispose()
    this.shared.reflectMap.value = null
    this.shared.mirrorOn.value = 0
  }
}
