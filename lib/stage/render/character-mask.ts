import * as THREE from "three"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"

// Where the named characters are visible on screen, as a soft mask the paint filter can read.
// Proxies of the standee cards are drawn into a small target with the standees' own alpha test; every fragment behind
// the scene depth (the main pass's depth texture) is discarded, so a figure behind a crowd member or a post is not
// masked where it is hidden.
const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
const FS = `uniform sampler2D map, mapB, tDepth; uniform vec2 size; uniform float near, far, useMap, keep, mixB; varying vec2 vUv;
float lin(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
void main(){
 if (useMap > .5) {   // a card with a back view: front, back, or a blend of the two alphas while it turns
  float a = mixB > .999 ? texture2D(mapB, vUv).a : mixB < .001 ? texture2D(map, vUv).a : mix(texture2D(map, vUv).a, texture2D(mapB, vUv).a, mixB);
  if (a < .5) discard;
 }
 float d = lin(gl_FragCoord.z), s = lin(texture2D(tDepth, gl_FragCoord.xy / size).r);
 if (d > s * 1.012 + .04) discard;
 gl_FragColor = vec4(vec3(keep), 1.0);
}`
// 5-tap binomial: about a pixel and a half of softness per axis.
const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
 float v = texture2D(tSrc, vUv).r * .375 + (texture2D(tSrc, vUv + dir).r + texture2D(tSrc, vUv - dir).r) * .25 + (texture2D(tSrc, vUv + dir * 2.0).r + texture2D(tSrc, vUv - dir * 2.0).r) * .0625;
 gl_FragColor = vec4(v, v, v, 1.0);
}`

const visibleInTree = (o: THREE.Object3D | null) => {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

export interface MaskCommon {
  tDepth: THREE.IUniform<THREE.Texture | null>
  size: THREE.IUniform<THREE.Vector2>
  near: THREE.IUniform<number>
  far: THREE.IUniform<number>
}

// A source with `map` is a card, alpha-tested by that texture; with `mapB` (its back view) and `mix` (0 front .. 1 back)
// the alpha is the back's while the back shows, so the mask follows the art on screen. `custom` supplies its own proxy
// (the instanced crowd cards). `keep` is the mask value written (1 = the full character keep, less for weaker keeps).
// Sources are drawn in order and later ones overwrite earlier ones, so list the weaker keeps first.
export interface MaskSource {
  src: THREE.Mesh
  map?: () => THREE.Texture | null
  mapB?: () => THREE.Texture | null
  mix?: () => number
  keep?: number
  custom?: (common: MaskCommon) => THREE.Mesh
}
interface Item {
  src: THREE.Mesh
  map?: () => THREE.Texture | null
  mapB?: () => THREE.Texture | null
  mix?: () => number
  proxy: THREE.Mesh
  instanced: boolean
}

export class CharacterMask {
  scene = new THREE.Scene()
  rt: THREE.WebGLRenderTarget
  rtB: THREE.WebGLRenderTarget
  common: MaskCommon
  items: Item[] = []
  depth: THREE.Texture | null = null
  drawn = 0
  blur: FullScreenQuad
  private clearColor = new THREE.Color()

  constructor() {
    this.scene.matrixWorldAutoUpdate = false
    const opt = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }
    this.rt = new THREE.WebGLRenderTarget(1, 1, opt)
    this.rtB = this.rt.clone()
    this.common = { tDepth: { value: null }, size: { value: new THREE.Vector2(1, 1) }, near: { value: 0.3 }, far: { value: 2400 } }
    this.blur = new FullScreenQuad(
      new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BLUR, uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false })
    )
  }
  get texture() {
    return this.rt.texture
  }
  setSize(w: number, h: number) {
    this.rt.setSize(w, h)
    this.rtB.setSize(w, h)
    this.common.size.value.set(w, h)
  }
  setSources(sources: MaskSource[]) {
    for (const it of this.items) {
      this.scene.remove(it.proxy)
      ;(it.proxy.material as THREE.Material).dispose()
    }
    this.items = sources.map(({ src, map, mapB, mix, keep = 1, custom }, order) => {
      let proxy: THREE.Mesh
      if (custom) proxy = custom(this.common)
      else {
        const material = new THREE.ShaderMaterial({
          vertexShader: VS,
          fragmentShader: FS,
          side: (src.material as THREE.Material).side ?? THREE.FrontSide,
          uniforms: { ...this.common, map: { value: null }, mapB: { value: null }, mixB: { value: 0 }, useMap: { value: map ? 1 : 0 }, keep: { value: keep } },
        })
        proxy = new THREE.Mesh(src.geometry, material)
        proxy.matrixAutoUpdate = false
        proxy.matrixWorldAutoUpdate = false
        proxy.frustumCulled = false
      }
      proxy.visible = false
      proxy.renderOrder = order
      this.scene.add(proxy)
      return { src, map, mapB, mix, proxy, instanced: !!custom }
    })
  }
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    if (!this.depth) return false
    this.common.tDepth.value = this.depth
    this.common.near.value = camera.near
    this.common.far.value = camera.far
    this.drawn = 0
    for (const it of this.items) {
      const tex = it.map ? it.map() : true
      const on = !!tex && visibleInTree(it.src) && (!it.instanced || (it.src as THREE.InstancedMesh).count > 0)
      it.proxy.visible = on
      if (!on) continue
      it.proxy.matrixWorld.copy(it.src.matrixWorld)
      if (it.instanced) (it.proxy as THREE.InstancedMesh).count = (it.src as THREE.InstancedMesh).count
      else if (it.map && tex instanceof THREE.Texture) {
        const u = (it.proxy.material as THREE.ShaderMaterial).uniforms
        const b = it.mapB ? it.mapB() : null
        u.map.value = tex
        u.mapB.value = b || tex
        u.mixB.value = b && it.mix ? it.mix() : 0
      }
      this.drawn++
    }
    const prevColor = renderer.getClearColor(this.clearColor)
    const prevAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.rt)
    renderer.render(this.scene, camera)
    renderer.setClearColor(prevColor, prevAlpha)
    const b = (this.blur.material as THREE.ShaderMaterial).uniforms
    const { width, height } = this.rt
    b.tSrc.value = this.rt.texture
    b.dir.value.set(1 / width, 0)
    renderer.setRenderTarget(this.rtB)
    this.blur.render(renderer)
    b.tSrc.value = this.rtB.texture
    b.dir.value.set(0, 1 / height)
    renderer.setRenderTarget(this.rt)
    this.blur.render(renderer)
    return true
  }
  dispose() {
    this.setSources([])
    this.rt.dispose()
    this.rtB.dispose()
    this.blur.material.dispose()
    this.blur.dispose()
  }
}
