import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js"
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { CharacterMask } from "./character-mask"
import { PaintPass } from "./paint-pass"

export type AAMode = "off" | "msaa" | "fxaa"

const QUAD_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }"

// Contact shading: GTAO at a fraction of the frame, reading the scene's own depth (normals come from the depth, so there
// is no second geometry pass). GTAOPass's stock Poisson denoise re-derives a normal from full-resolution depth for every
// tap, which costs more than the AO itself, so it is replaced by a cheap separable blur of the small AO target.
// The pass only produces the AO map; the paint pass multiplies it in.
const AO_BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){ float v = texture2D(tSrc, vUv).r * .375 + (texture2D(tSrc, vUv + dir).r + texture2D(tSrc, vUv - dir).r) * .25 + (texture2D(tSrc, vUv + dir * 2.0).r + texture2D(tSrc, vUv - dir * 2.0).r) * .0625; gl_FragColor = vec4(v, v, v, 1.0); }`
class ScaledGTAO extends GTAOPass {
  blurRT: THREE.WebGLRenderTarget
  blurMat: THREE.ShaderMaterial
  scale = 0.25
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    super(scene, camera, 1, 1)
    this.blurRT = this.gtaoRenderTarget.clone()
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: AO_BLUR,
      depthTest: false,
      depthWrite: false,
    })
  }
  setSize(w: number, h: number) {
    const k = this.scale ?? 0.25 // the base constructor may size the pass before this class's fields exist
    const sw = Math.max(1, Math.round(w * k))
    const sh = Math.max(1, Math.round(h * k))
    super.setSize(sw, sh)
    this.blurRT?.setSize(sw, sh)
  }
  render(renderer: THREE.WebGLRenderer) {
    const self = this as unknown as { _renderPass: (r: THREE.WebGLRenderer, m: THREE.Material, t: THREE.WebGLRenderTarget | null, c?: number, a?: number) => void; width: number; height: number }
    const u = this.gtaoMaterial.uniforms
    const c = this.camera as THREE.PerspectiveCamera
    u.cameraNear.value = c.near
    u.cameraFar.value = c.far
    u.cameraProjectionMatrix.value.copy(c.projectionMatrix)
    u.cameraProjectionMatrixInverse.value.copy(c.projectionMatrixInverse)
    u.cameraWorldMatrix.value.copy(c.matrixWorld)
    self._renderPass(renderer, this.gtaoMaterial, this.gtaoRenderTarget, 0xffffff, 1.0)
    const b = this.blurMat.uniforms
    b.tSrc.value = this.gtaoRenderTarget.texture
    b.dir.value.set(1 / self.width, 0)
    self._renderPass(renderer, this.blurMat, this.blurRT)
    b.tSrc.value = this.blurRT.texture
    b.dir.value.set(0, 1 / self.height)
    self._renderPass(renderer, this.blurMat, this.gtaoRenderTarget)
  }
  dispose() {
    super.dispose()
    this.blurRT.dispose()
    this.blurMat.dispose()
  }
}

// The post chain. The scene pass keeps its depth in a texture so the character mask, the depth-aware brush and the AO
// can use it. With MSAA the scene is drawn into a 4x multisampled target (colour and depth are resolved at the end of
// the pass) and copied into the composer's plain target: later passes (bloom blends into its input) never touch
// multisampled storage.
export class Pipeline {
  composer: EffectComposer
  msaaTarget: THREE.WebGLRenderTarget
  copyQuad: FullScreenQuad
  scenePass: RenderPass
  bloom: UnrealBloomPass
  fxaa: FXAAPass
  gtao: ScaledGTAO
  paint: PaintPass
  mask: CharacterMask
  aa: AAMode = "off"
  aoStrength = 0.55
  private sceneRender: RenderPass["render"]

  constructor(
    public renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera
  ) {
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) }))
    this.msaaTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) })
    this.copyQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null } },
        vertexShader: QUAD_VS,
        fragmentShader: "uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }",
        depthTest: false,
        depthWrite: false,
      })
    )
    this.mask = new CharacterMask()
    this.paint = new PaintPass()
    this.gtao = new ScaledGTAO(scene, camera)
    this.scenePass = new RenderPass(scene, camera)
    this.sceneRender = this.scenePass.render.bind(this.scenePass)
    this.scenePass.render = (r, wb, rb, ...rest) => {
      let depth: THREE.Texture | null
      if (this.aa === "msaa") {
        if (this.msaaTarget.width !== rb.width || this.msaaTarget.height !== rb.height) this.msaaTarget.setSize(rb.width, rb.height)
        this.sceneRender(r, wb, this.msaaTarget, ...rest)
        ;(this.copyQuad.material as THREE.ShaderMaterial).uniforms.tSrc.value = this.msaaTarget.texture
        r.setRenderTarget(rb)
        this.copyQuad.render(r)
        depth = this.msaaTarget.depthTexture
      } else {
        this.sceneRender(r, wb, rb, ...rest)
        depth = rb.depthTexture
      }
      this.mask.depth = depth
      this.paint.depth = depth
      this.gtao.gtaoMaterial.uniforms.tDepth.value = depth
    }
    this.composer.addPass(this.scenePass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.5, 1.1)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.fxaa = new FXAAPass()
    this.fxaa.enabled = false
    this.composer.addPass(this.fxaa)
    this.gtao.setGBuffer(new THREE.DepthTexture(1, 1))
    this.gtao.needsSwap = false
    this.gtao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.4, thickness: 0.9, scale: 1, samples: 10, distanceFallOff: 1 })
    this.composer.addPass(this.gtao)
    this.composer.addPass(this.paint)
    this.paint.ao = this.gtao.gtaoRenderTarget.texture
    this.paint.attachMask(this.mask, camera)
    this.setAO(false)
  }
  setAA(mode: AAMode) {
    this.aa = mode
    this.fxaa.enabled = mode === "fxaa"
    if (mode !== "msaa") this.msaaTarget.setSize(1, 1)
  }
  setAO(on: boolean) {
    this.gtao.enabled = on
    this.paint.aoStrength = on ? this.aoStrength : 0
  }
  setSize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
  }
  render() {
    this.composer.render()
  }
  dispose() {
    this.composer.dispose()
    this.msaaTarget.dispose()
    this.copyQuad.material.dispose()
    this.copyQuad.dispose()
    this.bloom.dispose()
    this.fxaa.dispose()
    this.gtao.dispose()
    this.paint.dispose()
    this.mask.dispose()
  }
}
