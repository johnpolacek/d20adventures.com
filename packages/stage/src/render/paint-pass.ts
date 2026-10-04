import * as THREE from "three"
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js"
import type { CharacterMask } from "./character-mask"

const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
const quad = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
  new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false }))

// Local image structure: how strongly, and in which direction, colour changes.
const TENSOR = `uniform sampler2D tColor; uniform vec2 texel; varying vec2 vUv;
vec3 at(float x, float y){ return texture2D(tColor, vUv + texel * vec2(x, y)).rgb; }
void main(){
 vec3 u = (-at(-1., -1.) - 2. * at(-1., 0.) - at(-1., 1.) + at(1., -1.) + 2. * at(1., 0.) + at(1., 1.)) * .25;
 vec3 v = (-at(-1., -1.) - 2. * at(0., -1.) - at(1., -1.) + at(-1., 1.) + 2. * at(0., 1.) + at(1., 1.)) * .25;
 gl_FragColor = vec4(dot(u, u), dot(v, v), dot(u, v), 1.0);
}`
const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
 vec4 s = texture2D(tSrc, vUv) * .2270;
 s += (texture2D(tSrc, vUv + dir * 1.3846) + texture2D(tSrc, vUv - dir * 1.3846)) * .3162;
 s += (texture2D(tSrc, vUv + dir * 3.2308) + texture2D(tSrc, vUv - dir * 3.2308)) * .0703;
 gl_FragColor = s;
}`
// Box-ish reduction to the paint resolution: four bilinear taps, so thin geometry does not alias when the filter reads it.
const DOWN = `uniform sampler2D tSrc; uniform vec2 o; varying vec2 vUv;
void main(){
 gl_FragColor = vec4((texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb) * .25, 1.0);
}`
// Anisotropic Kuwahara filter with polynomial sector weights (Kyprianidis et al.):
// flat regions collapse into strokes that follow the edges they sit beside.
const KUWAHARA = `uniform sampler2D tColor, tTensor, tDepth; uniform vec2 texel; uniform float uRadius, near, far, depthMode, rMin, d0, d1; varying vec2 vUv;
float lin(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
void main(){
 // Depth-aware strokes: near the lens the brush shrinks to rMin of its size (about 40%) by d0 metres and reaches full size at d1.
 float radius = uRadius;
 if (depthMode > .5) radius = max(1.5, uRadius * mix(rMin, 1.0, smoothstep(d0, d1, lin(texture2D(tDepth, vUv).x))));
 vec3 g = texture2D(tTensor, vUv).xyz;
 float E = g.x, G = g.y, F = g.z, disc = sqrt((E - G) * (E - G) + 4.0 * F * F);
 float l1 = .5 * (E + G + disc), l2 = .5 * (E + G - disc);
 vec2 t = vec2(l1 - E, -F); t = length(t) > 1e-6 ? normalize(t) : vec2(0.0, 1.0);
 float phi = -atan(t.y, t.x), A = l1 + l2 > 1e-6 ? (l1 - l2) / (l1 + l2) : 0.0;
 float alpha = 1.0, a = radius * clamp((alpha + A) / alpha, .1, 1.7), b = radius * clamp(alpha / (alpha + A), .1, 2.0);
 float cp = cos(phi), sp = sin(phi);
 mat2 SR = mat2(.5 / a, 0.0, 0.0, .5 / b) * mat2(cp, -sp, sp, cp);
 int mx = int(sqrt(a * a * cp * cp + b * b * sp * sp)), my = int(sqrt(a * a * sp * sp + b * b * cp * cp));
 float zeta = 1.0 / radius, zc = .58, sz = sin(zc), eta = (zeta + cos(zc)) / (sz * sz);
 vec4 m[8]; vec3 s[8];
 for (int k = 0; k < 8; k++){ m[k] = vec4(0.0); s[k] = vec3(0.0); }
 for (int j = -my; j <= my; j++) for (int i = -mx; i <= mx; i++){
  vec2 v = SR * vec2(float(i), float(j));
  if (dot(v, v) > .25) continue;
  vec3 c = clamp(texture2D(tColor, vUv + vec2(float(i), float(j)) * texel).rgb, 0.0, 1.0);
  float w[8]; float sum = 0.0; float z; float vxx = zeta - eta * v.x * v.x; float vyy = zeta - eta * v.y * v.y;
  z = max(0.0, v.y + vxx); w[0] = z * z; z = max(0.0, -v.x + vyy); w[2] = z * z;
  z = max(0.0, -v.y + vxx); w[4] = z * z; z = max(0.0, v.x + vyy); w[6] = z * z;
  v = .70710678 * vec2(v.x - v.y, v.x + v.y); vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
  z = max(0.0, v.y + vxx); w[1] = z * z; z = max(0.0, -v.x + vyy); w[3] = z * z;
  z = max(0.0, -v.y + vxx); w[5] = z * z; z = max(0.0, v.x + vyy); w[7] = z * z;
  for (int k = 0; k < 8; k++) sum += w[k];
  float gw = exp(-3.125 * dot(v, v)) / max(sum, 1e-5);
  for (int k = 0; k < 8; k++){ float wk = w[k] * gw; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
 }
 vec4 o = vec4(0.0);
 for (int k = 0; k < 8; k++){
  if (m[k].w <= 1e-6) continue;
  vec3 mu = m[k].rgb / m[k].w; vec3 va = abs(s[k] / m[k].w - mu * mu);
  float wk = 1.0 / (1.0 + pow(8.0 * 1000.0 * (va.r + va.g + va.b), 4.0));
  o += vec4(mu * wk, wk);
 }
 gl_FragColor = vec4(o.w > 0.0 ? o.rgb / o.w : texture2D(tColor, vUv).rgb, 1.0);
}`
// Canvas, brush grain aligned with the strokes, and a warm painterly grade.
const FINAL = `uniform sampler2D tPaint, tOrig, tTensor, tNoise, tMask, tAO, tDepth; uniform vec2 res, pTexel; uniform float strength, grain, grade, warmth, vignette, detail, gs, aoStrength, aoDebug, near, far; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lin(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
void main(){
 vec3 orig = texture2D(tOrig, vUv).rgb, paint = texture2D(tPaint, vUv).rgb;
 vec3 soft = (texture2D(tPaint, vUv + vec2(pTexel.x, 0.0)).rgb + texture2D(tPaint, vUv - vec2(pTexel.x, 0.0)).rgb + texture2D(tPaint, vUv + vec2(0.0, pTexel.y)).rgb + texture2D(tPaint, vUv - vec2(0.0, pTexel.y)).rgb) * .25;
 paint = clamp(paint + (paint - soft) * .6, 0.0, 1.0);
 // Named characters keep most of the crisp full-resolution render: only a fraction (detail) of the paint stays inside the mask.
 float m = texture2D(tMask, vUv).r, st = strength * mix(1.0, detail, m);
 vec3 c = mix(orig, paint, st);
 // Contact shading from the GTAO map: faded with distance (its depth precision thins out) and eased off on the crisp characters.
 if (aoStrength > .001) { float ao = texture2D(tAO, vUv).r; ao = mix(ao, 1.0, smoothstep(40.0, 130.0, lin(texture2D(tDepth, vUv).x))); c *= mix(1.0, ao, aoStrength * (1.0 - .6 * m)); if (aoDebug > .5) c = vec3(ao); }
 vec3 g = texture2D(tTensor, vUv).xyz;
 float E = g.x, G = g.y, F = g.z, disc = sqrt((E - G) * (E - G) + 4.0 * F * F), l1 = .5 * (E + G + disc), l2 = .5 * (E + G - disc);
 vec2 t = vec2(l1 - E, -F); float A = l1 + l2 > 1e-6 ? (l1 - l2) / (l1 + l2) : 0.0;
 vec2 fc = vUv * res, bc = fc / gs;   // brush strokes are sized against the frame, the weave and grain against device pixels
 float na = texture2D(tNoise, bc / 900.0).g * 6.283;
 vec2 dirFlat = vec2(cos(na), sin(na));
 vec2 d = normalize(mix(dirFlat, length(t) > 1e-6 ? normalize(t) : dirFlat, smoothstep(.05, .35, A)));
 float acc = 0.0;
 for (int i = -6; i <= 6; i++) acc += texture2D(tNoise, (bc + d * float(i) * 1.6) / 256.0).r;
 acc = acc / 13.0 - .5;
 float lum = dot(c, vec3(.299, .587, .114));
 c *= 1.0 + acc * .22 * st * (.35 + lum);
 float weave = (sin(fc.x * 1.9) * sin(fc.y * 1.9)) * .5 + .5;
 c *= 1.0 - weave * .025 * st;
 // Grade: a gentle S-curve, warm umber shadows, parchment highlights (the warmth is off for moonlit scenes).
 vec3 gc = c;
 gc = mix(gc, gc * gc * (3.0 - 2.0 * gc), .35);
 float l = dot(gc, vec3(.299, .587, .114));
 gc += vec3(.07, .02, -.01) * (1.0 - smoothstep(0.0, .5, l)) * warmth;
 gc *= mix(vec3(1.0), vec3(1.04, 1.0, .93), smoothstep(.45, 1.0, l) * warmth);
 gc = mix(vec3(l), gc, 1.12);
 c = mix(c, gc, grade);
 vec2 q = vUv - .5; c *= 1.0 - dot(q, q) * vignette;
 c *= mix(1.0, .74, smoothstep(.34, 0.0, vUv.y) * vignette * 1.6);
 c += (h(fc + fract(res.x)) - .5) * grain * mix(1.0, .4, m);
 gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

// Quality tiers set the paint filter's internal height in pixels, independent of the device pixel ratio:
// the stroke radius is defined against that height, so the painterly look is the same on any screen and the cost is bounded.
export class PaintPass extends Pass {
  rtS: THREE.WebGLRenderTarget
  rtA: THREE.WebGLRenderTarget
  rtB: THREE.WebGLRenderTarget
  rtK: THREE.WebGLRenderTarget
  noise: THREE.DataTexture
  black: THREE.DataTexture
  down: FullScreenQuad
  tensor: FullScreenQuad
  blur: FullScreenQuad
  kuwahara: FullScreenQuad
  final: FullScreenQuad
  strength = 1
  brush = 1
  // 1 tints the grade warm (umber shadows, parchment highlights); 0 keeps it neutral.
  warmth = 1
  height = 720
  mask: CharacterMask | null = null
  camera: THREE.PerspectiveCamera | null = null
  maskEnabled = true
  depth: THREE.Texture | null = null
  depthPaint = true
  ao: THREE.Texture | null = null
  aoStrength = 0
  full: [number, number] | null = null
  size: [number, number] = [1, 1]
  direct = false

  constructor() {
    super()
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }
    this.rtS = new THREE.WebGLRenderTarget(1, 1, opt)
    this.rtA = this.rtS.clone()
    this.rtB = this.rtS.clone()
    this.rtK = this.rtS.clone()
    this.noise = new THREE.DataTexture(
      new Uint8Array(256 * 256 * 4).map(() => Math.random() * 255),
      256,
      256
    )
    this.noise.wrapS = this.noise.wrapT = THREE.RepeatWrapping
    this.noise.magFilter = this.noise.minFilter = THREE.LinearFilter
    this.noise.needsUpdate = true
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this.black.needsUpdate = true
    this.down = quad(DOWN, { tSrc: { value: null }, o: { value: new THREE.Vector2() } })
    this.tensor = quad(TENSOR, { tColor: { value: null }, texel: { value: new THREE.Vector2() } })
    this.blur = quad(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } })
    this.kuwahara = quad(KUWAHARA, {
      tColor: { value: null },
      tTensor: { value: null },
      tDepth: { value: null },
      texel: { value: new THREE.Vector2() },
      uRadius: { value: 5 },
      near: { value: 0.3 },
      far: { value: 2400 },
      depthMode: { value: 0 },
      rMin: { value: 0.4 },
      d0: { value: 6 },
      d1: { value: 35 },
    })
    this.final = quad(FINAL, {
      tPaint: { value: null },
      tOrig: { value: null },
      tTensor: { value: null },
      tNoise: { value: this.noise },
      tMask: { value: this.black },
      tAO: { value: this.black },
      tDepth: { value: null },
      aoStrength: { value: 0 },
      aoDebug: { value: 0 },
      near: { value: 0.3 },
      far: { value: 2400 },
      res: { value: new THREE.Vector2() },
      pTexel: { value: new THREE.Vector2() },
      strength: { value: 1 },
      grain: { value: 0.018 },
      grade: { value: 1 },
      warmth: { value: 1 },
      vignette: { value: 0.55 },
      detail: { value: 0.2 },
      gs: { value: 1 },
    })
  }
  private uniforms(q: FullScreenQuad) {
    return (q.material as THREE.ShaderMaterial).uniforms
  }
  // The paint filter runs at a fixed internal height (never above the frame itself); the brush grain,
  // the grade and the character detail are applied at full resolution in the final pass.
  setSize(w: number, h: number) {
    this.full = [w, h]
    const sh = Math.max(1, Math.min(h, this.height))
    const sw = Math.max(1, Math.round((w * sh) / h))
    for (const rt of [this.rtS, this.rtA, this.rtB, this.rtK]) rt.setSize(sw, sh)
    this.size = [sw, sh]
    this.direct = w / sw < 1.15 // near 1:1, read the frame as it is
    this.mask?.setSize(sw, sh)
    this.uniforms(this.down).o.value.set(0.25 / sw, 0.25 / sh)
    this.uniforms(this.tensor).texel.value.set(1 / sw, 1 / sh)
    this.uniforms(this.kuwahara).texel.value.set(1 / sw, 1 / sh)
    const U = this.uniforms(this.final)
    U.res.value.set(w, h)
    U.pTexel.value.set(1 / sw, 1 / sh)
    U.gs.value = Math.max(1, h / 900)
  }
  setHeight(px: number) {
    this.height = px
    if (this.full) this.setSize(...this.full)
  }
  attachMask(mask: CharacterMask, camera: THREE.PerspectiveCamera) {
    this.mask = mask
    this.camera = camera
    mask.setSize(...this.size)
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const [w, h] = this.size
    const on = this.strength > 0.01
    let src: THREE.Texture = readBuffer.texture
    if (!this.direct) {
      this.uniforms(this.down).tSrc.value = src
      renderer.setRenderTarget(this.rtS)
      this.down.render(renderer)
      src = this.rtS.texture
    }
    this.uniforms(this.tensor).tColor.value = src
    renderer.setRenderTarget(this.rtA)
    this.tensor.render(renderer)
    const B = this.uniforms(this.blur)
    B.tSrc.value = this.rtA.texture
    B.dir.value.set(1 / w, 0)
    renderer.setRenderTarget(this.rtB)
    this.blur.render(renderer)
    B.tSrc.value = this.rtB.texture
    B.dir.value.set(0, 1 / h)
    renderer.setRenderTarget(this.rtA)
    this.blur.render(renderer)
    if (on) {
      const K = this.uniforms(this.kuwahara)
      K.tColor.value = src
      K.tTensor.value = this.rtA.texture
      K.uRadius.value = Math.max(1.5, (this.brush * h) / 190)
      K.depthMode.value = this.depthPaint && this.depth && this.camera ? 1 : 0
      if (K.depthMode.value && this.camera) {
        K.tDepth.value = this.depth
        K.near.value = this.camera.near
        K.far.value = this.camera.far
      }
      renderer.setRenderTarget(this.rtK)
      this.kuwahara.render(renderer)
    }
    const drawn = on && this.maskEnabled && this.mask && this.camera && this.mask.render(renderer, this.camera)
    const U = this.uniforms(this.final)
    U.tPaint.value = on ? this.rtK.texture : readBuffer.texture
    U.tOrig.value = readBuffer.texture
    U.tTensor.value = this.rtA.texture
    U.strength.value = this.strength
    U.warmth.value = this.warmth
    U.tMask.value = drawn && this.mask ? this.mask.texture : this.black
    const aoOn = this.aoStrength > 0 && this.ao && this.depth && this.camera
    U.aoStrength.value = aoOn ? this.aoStrength : 0
    if (aoOn && this.camera) {
      U.tAO.value = this.ao
      U.tDepth.value = this.depth
      U.near.value = this.camera.near
      U.far.value = this.camera.far
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.final.render(renderer)
  }
  dispose() {
    for (const rt of [this.rtS, this.rtA, this.rtB, this.rtK]) rt.dispose()
    for (const q of [this.down, this.tensor, this.blur, this.kuwahara, this.final]) {
      q.material.dispose()
      q.dispose()
    }
    this.noise.dispose()
    this.black.dispose()
  }
}
