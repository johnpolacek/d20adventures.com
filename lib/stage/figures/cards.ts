import * as THREE from "three"
import { type SharedUniforms, stageMaterial } from "../materials/atmosphere"
import type { MaskCommon } from "../render/character-mask"
import type { PawnKind } from "./pawns"

// Illustrated crowd cards. One InstancedMesh draws every card: a unit quad whose vertex shader yaws it toward the camera
// (never more than 60 degrees from where the person faces, or from the opposite way once the camera is behind them), adds the
// walk bob, and sizes it from the person's scale and the variant's real height. The figures live in one texture array
// (one layer per variant and view, mipmapped, sRGB): layer i is variant i seen from the front, layer i + N the same variant
// from behind. The fragment shader shades them from the gradient of the alpha channel, so the sun models the silhouette.
// The same vertex transform is shared by the shadow-caster material and by the character-mask proxy, so all three agree
// on where a card is.
//
// Front or back: with off = the angle between where the person faces and the direction to the camera, the front shows below
// 80 degrees and the back above 100. In between the colours are dissolved with a screen-space dither (colour pass), the alpha
// is blended (also for shadow and mask), and the card's yaw swings from the front lean to the back lean (70 to 110 degrees)
// so it turns face-on to the camera at 90 rather than popping. The mirror flag flips both layers alike.

export interface CardView {
  layer: number
  uMax: number
  vMax: number
  aspect: number
  frac: number
}
export interface CardVariant extends CardView {
  id: string
  body: number
  back: CardView
}
export interface CrowdLibraryMeta {
  layer: [number, number]
  cols: number
  rows: number
  variants: CardVariant[]
  kinds: Partial<Record<PawnKind, Record<string, number>>>
}
// A setting's crowd library: the atlas metadata plus the two atlases (front and back), each split into an opaque colour
// image and an opaque alpha image so nothing is ever premultiplied.
export interface CrowdLibrary {
  meta: CrowdLibraryMeta
  front: { rgb: string; alpha: string }
  back: { rgb: string; alpha: string }
}

export interface CardPerson {
  x: number
  y: number
  z: number
  ry: number
  s: number
  walk: number
  cv: number
  cflip: number
  cphase: number
  ctint: [number, number, number]
  cs: number
}

// Vertex code, shared. cA = (facing, layer, mirror, phase); cB = (tint rgb, walk); uVar[layer] = (height m, quad aspect, uMax, vMax), fronts then backs.
function glsl(N: number) {
  const COMMON = /* glsl */ `
attribute vec4 cA; attribute vec4 cB;
uniform vec3 uCam; uniform vec4 uVar[${2 * N}]; uniform float uTime;
varying vec3 vCUv; varying vec3 vCUb; varying float vCB; varying vec3 vCTint;
float cWrap(float a){ return atan(sin(a), cos(a)); }
// x = the card's yaw, y = how much of the back shows (0 front, 1 back).
vec2 cYaw(float ry, vec3 pos){
 float off = cWrap(atan(uCam.x - pos.x, uCam.z - pos.z) - ry), a = abs(off), sg = off < 0.0 ? -1.0 : 1.0;
 float front = clamp(off * .75, -1.0472, 1.0472);
 float back = sg * 3.14159265 + clamp(cWrap(off - sg * 3.14159265) * .75, -1.0472, 1.0472);
 return vec2(ry + mix(front, back, smoothstep(1.2217, 1.9199, a)), smoothstep(1.3963, 1.7453, a));
}`
  const SETUP = /* glsl */ `
vec3 cPos = instanceMatrix[3].xyz;
int cL = int(cA.y + .5);
vec4 cVF = uVar[cL], cVB = uVar[cL + ${N}];
vec2 cYB = cYaw(cA.x, cPos);
vec4 cV = mix(cVF, cVB, cYB.y);
float cYawA = cYB.x, cSin = sin(cYawA), cCos = cos(cYawA);`
  const POS = /* glsl */ `
{
 float ph = cA.w * 6.2832, walk = cB.w, stride = sin(uTime * 5.2 * (.85 + .3 * fract(cA.w * 7.13)) + ph);
 vec3 lp = vec3(position.x * cV.x * cV.y, position.y * cV.x, 0.0);
 lp.y += walk * abs(stride) * .035;
 lp.x += (walk * stride * .012 + (1.0 - walk) * sin(uTime * (.8 + cA.w * .5) + ph) * .012) * position.y * cV.x;
 transformed = vec3(lp.x * cCos, lp.y, -lp.x * cSin);
 float u = position.x + .5, uF = u * cVF.z, uB = u * cVB.z;
 vCUv = vec3(cA.z > 0.0 ? uF : cVF.z - uF, 1.0 - position.y * cVF.w, cA.y);
 vCUb = vec3(cA.z > 0.0 ? uB : cVB.z - uB, 1.0 - position.y * cVB.w, cA.y + ${N}.0);
 vCB = cYB.y; vCTint = cB.xyz;
}`
  // The card's alpha for the shadow caster and the character mask: front, back, or a blend while they trade places.
  const ALPHA = /* glsl */ `
float cAlpha(){
 if (vCB < .001) return texture(uAtlas, vCUv).a;
 if (vCB > .999) return texture(uAtlas, vCUb).a;
 return mix(texture(uAtlas, vCUv).a, texture(uAtlas, vCUb).a, vCB);
}`
  return { COMMON, SETUP, POS, ALPHA }
}

// Grade toward the set palette, as the hero standees get, a touch stronger on the crowd.
const GRADE = `
 { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(.299, .587, .114));
   c = mix(vec3(l), c, .9); c *= vec3(1.025, 1.0, .95);
   c += vec3(.04, .016, -.01) * (1.0 - smoothstep(0.0, .55, l)); float hi = smoothstep(.62, .95, l); c = mix(c, vec3(l), hi * .3) * (1.0 - hi * .1);
   diffuseColor.rgb = c; }`
// Body and rim normals from the alpha channel: a fine gradient rounds the outline, a coarse one swells the whole figure.
const NORMAL = `
 { vec3 uvw = cUvw; vec2 f = vec2(1.0 / 32.0, 1.0 / 64.0), k = vec2(1.0 / 8.0, 1.0 / 16.0);
   float sx = vCMirror > 0.0 ? 1.0 : -1.0;
   vec2 gf = vec2(sx * (textureLod(uAtlas, uvw + vec3(f.x, 0.0, 0.0), 2.0).a - textureLod(uAtlas, uvw - vec3(f.x, 0.0, 0.0), 2.0).a), -(textureLod(uAtlas, uvw + vec3(0.0, f.y, 0.0), 2.0).a - textureLod(uAtlas, uvw - vec3(0.0, f.y, 0.0), 2.0).a));
   vec2 gc = vec2(sx * (textureLod(uAtlas, uvw + vec3(k.x, 0.0, 0.0), 4.0).a - textureLod(uAtlas, uvw - vec3(k.x, 0.0, 0.0), 4.0).a), -(textureLod(uAtlas, uvw + vec3(0.0, k.y, 0.0), 4.0).a - textureLod(uAtlas, uvw - vec3(0.0, k.y, 0.0), 4.0).a));
   vec2 g = gf * 1.1 + gc * 1.6;
   normal = normalize(vCR * -g.x + vCU * -g.y + normal);
   normal = normalize(normal + normalize(vViewPosition) * .3 * faceDirection); }`
// Front, back, or the two trading places: colour is dithered (a per-pixel pick of one layer), alpha is blended, so the silhouette
// morphs smoothly (a per-pixel alpha would give alpha-to-coverage and the alpha test a stipple to chew on). The relief normals
// use one layer per card, not per pixel.
const LAYERS = `
 { vec4 t; cUvw = vCUv;
   if (vCB < .001) t = texture(uAtlas, vCUv);
   else if (vCB > .999) { cUvw = vCUb; t = texture(uAtlas, vCUb); }
   else { vec4 tf = texture(uAtlas, vCUv), tb = texture(uAtlas, vCUb); t = vCB > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) ? tb : tf; t.a = mix(tf.a, tb.a, vCB); if (vCB > .5) cUvw = vCUb; }
   diffuseColor.rgb *= t.rgb * vCTint; diffuseColor.a *= t.a; }`

type CardUniforms = { uCam: THREE.IUniform<THREE.Vector3>; uTime: THREE.IUniform<number>; uAtlas: THREE.IUniform<THREE.DataArrayTexture | null>; uVar: THREE.IUniform<THREE.Vector4[]> }

function makeUniforms(meta: CrowdLibraryMeta, camera: THREE.Camera, shared: SharedUniforms): CardUniforms {
  const [LW, LH] = meta.layer
  const views = [...meta.variants.map((v) => ({ body: v.body, view: v as CardView })), ...meta.variants.map((v) => ({ body: v.body, view: v.back }))]
  return {
    uCam: { value: camera.position },
    uTime: shared.time,
    uAtlas: { value: null },
    uVar: {
      value: views.map(({ body, view }) => {
        const fh = view.vMax * LH - 2
        return new THREE.Vector4(((body / view.frac) * (view.vMax * LH)) / fh, (view.uMax * LW) / (view.vMax * LH), view.uMax, view.vMax)
      }),
    },
  }
}

function cardMaterial(uniforms: CardUniforms, N: number, shared: SharedUniforms) {
  const { COMMON, SETUP, POS } = glsl(N)
  const m = new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.95, metalness: 0, alphaTest: 0.5 })
  return stageMaterial(m, shared, `crowd-card-${N}`, (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = s.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}\nvarying vec3 vCR; varying vec3 vCU; varying float vCMirror;`)
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>\n${SETUP}\nobjectNormal = vec3(cSin, 0.0, cCos); vCR = mat3(viewMatrix) * vec3(cCos, 0.0, -cSin); vCU = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0); vCMirror = cA.z;`
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${POS}`)
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2DArray uAtlas; varying vec3 vCUv; varying vec3 vCUb; varying float vCB; varying vec3 vCTint; varying vec3 vCR; varying vec3 vCU; varying float vCMirror; vec3 cUvw;"
      )
      .replace("#include <map_fragment>", `#include <map_fragment>\n${LAYERS}\n${GRADE}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${NORMAL}`)
  })
}
function cardDepthMaterial(uniforms: CardUniforms, N: number) {
  const { COMMON, SETUP, POS, ALPHA } = glsl(N)
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide })
  d.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>\n${COMMON}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${SETUP}\n${POS}`)
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2DArray uAtlas; varying vec3 vCUv; varying vec3 vCUb; varying float vCB; varying vec3 vCTint;\n${ALPHA}`)
      .replace("#include <alphatest_fragment>", "diffuseColor.a = cAlpha();\n#include <alphatest_fragment>")
  }
  d.customProgramCacheKey = () => `stage:crowd-card-depth-${N}`
  return d
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = "anonymous"
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error(`Could not load ${src}`))
    i.src = src
  })

// Each atlas is two opaque images (colour, alpha); together they become one RGBA texture array: layer by layer through a
// canvas, so nothing is ever premultiplied. Fronts then backs, one atlas at a time, so only one decoded pair is alive at once.
async function buildAtlasTexture(lib: CrowdLibrary, maxAnisotropy: number) {
  const { meta } = lib
  const [LW, LH] = meta.layer
  const n = meta.variants.length
  const data = new Uint8Array(LW * LH * 4 * n * 2)
  const cv = document.createElement("canvas")
  cv.width = LW
  cv.height = LH
  const cx = cv.getContext("2d", { willReadFrequently: true })!
  for (const [set, urls] of [
    [0, lib.front],
    [1, lib.back],
  ] as const) {
    const [rgb, alpha] = await Promise.all([loadImage(urls.rgb), loadImage(urls.alpha)])
    for (let k = 0; k < n; k++) {
      const sx = (k % meta.cols) * LW
      const sy = Math.floor(k / meta.cols) * LH
      const o = (set * n + k) * LW * LH * 4
      cx.clearRect(0, 0, LW, LH)
      cx.drawImage(rgb, sx, sy, LW, LH, 0, 0, LW, LH)
      const c = cx.getImageData(0, 0, LW, LH).data
      cx.clearRect(0, 0, LW, LH)
      cx.drawImage(alpha, sx, sy, LW, LH, 0, 0, LW, LH)
      const a = cx.getImageData(0, 0, LW, LH).data
      for (let i = 0; i < LW * LH; i++) {
        data[o + i * 4] = c[i * 4]
        data[o + i * 4 + 1] = c[i * 4 + 1]
        data[o + i * 4 + 2] = c[i * 4 + 2]
        data[o + i * 4 + 3] = a[i * 4]
      }
    }
  }
  const tex = new THREE.DataArrayTexture(data, LW, LH, n * 2)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = Math.min(4, maxAnisotropy)
  // 64 MB of pixels: once the GPU has them, the JS copy goes.
  tex.onUpdate = () => {
    ;(tex.image as { data: Uint8Array | null }).data = null
  }
  tex.needsUpdate = true
  return tex
}

export class CardLayer {
  uniforms: CardUniforms
  cA: THREE.InstancedBufferAttribute
  cB: THREE.InstancedBufferAttribute
  mesh: THREE.InstancedMesh
  slots: (CardPerson | undefined)[]
  n = 0
  ready = false
  loading = false
  dirty = true
  readonly N: number

  constructor(
    public library: CrowdLibrary,
    capacity: number,
    camera: THREE.Camera,
    shared: SharedUniforms
  ) {
    this.N = library.meta.variants.length
    this.uniforms = makeUniforms(library.meta, camera, shared)
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.translate(0, 0.5, 0)
    this.cA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.cB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute("cA", this.cA)
    geo.setAttribute("cB", this.cB)
    this.mesh = new THREE.InstancedMesh(geo, cardMaterial(this.uniforms, this.N, shared), Math.max(1, capacity))
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = this.mesh.receiveShadow = true
    this.mesh.name = "crowd-cards"
    this.mesh.customDepthMaterial = cardDepthMaterial(this.uniforms, this.N)
    this.slots = new Array(capacity)
  }
  async load(maxAnisotropy: number) {
    this.loading = true
    this.uniforms.uAtlas.value = await buildAtlasTexture(this.library, maxAnisotropy)
    this.ready = true
  }
  add(p: CardPerson) {
    p.cs = this.n
    this.slots[this.n++] = p
    this.write(p)
    this.mesh.count = this.n
    this.dirty = true
  }
  remove(p: CardPerson) {
    const last = --this.n
    const q = this.slots[last]!
    if (q !== p) {
      this.slots[p.cs] = q
      q.cs = p.cs
      this.write(q)
    }
    this.slots[last] = undefined
    p.cs = -1
    this.mesh.count = this.n
    this.dirty = true
  }
  write(p: CardPerson) {
    const i = p.cs
    const m = this.mesh.instanceMatrix.array as Float32Array
    const o = i * 16
    const s = p.s
    m.set([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, p.x, p.y, p.z, 1], o)
    const a = this.cA.array as Float32Array
    const b = this.cB.array as Float32Array
    a[i * 4] = p.ry
    a[i * 4 + 1] = p.cv
    a[i * 4 + 2] = p.cflip
    a[i * 4 + 3] = p.cphase
    b[i * 4] = p.ctint[0]
    b[i * 4 + 1] = p.ctint[1]
    b[i * 4 + 2] = p.ctint[2]
    b[i * 4 + 3] = p.walk
    this.dirty = true
  }
  flush() {
    if (!this.dirty) return
    this.mesh.instanceMatrix.needsUpdate = this.cA.needsUpdate = this.cB.needsUpdate = true
    this.dirty = false
  }
  // The character mask's proxy: the same transform, alpha-tested by the atlas, writing `keep` (how much crisp detail to preserve).
  maskProxy(common: MaskCommon, keep: number) {
    const { COMMON, SETUP, POS, ALPHA } = glsl(this.N)
    const material = new THREE.ShaderMaterial({
      uniforms: { ...common, ...this.uniforms, keep: { value: keep } },
      vertexShader: `${COMMON}\nvoid main(){ vec3 transformed; ${SETUP}\n${POS}\n gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0); }`,
      fragmentShader: `uniform sampler2DArray uAtlas; uniform sampler2D tDepth; uniform vec2 size; uniform float near, far, keep; varying vec3 vCUv; varying vec3 vCUb; varying float vCB; varying vec3 vCTint;
${ALPHA}
float lin(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
void main(){
 if (cAlpha() < .5) discard;
 float d = lin(gl_FragCoord.z), s = lin(texture2D(tDepth, gl_FragCoord.xy / size).r);
 if (d > s * 1.012 + .04) discard;
 gl_FragColor = vec4(vec3(keep), 1.0);
}`,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const proxy = new THREE.InstancedMesh(this.mesh.geometry, material, this.mesh.instanceMatrix.count)
    proxy.instanceMatrix = this.mesh.instanceMatrix
    proxy.count = 0
    proxy.frustumCulled = false
    proxy.matrixAutoUpdate = false
    proxy.matrixWorldAutoUpdate = false
    return proxy
  }
  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.customDepthMaterial?.dispose()
    this.uniforms.uAtlas.value?.dispose()
    this.mesh.dispose()
  }
}
