import * as THREE from "three"
import { type SharedUniforms, stageMaterial } from "../materials/atmosphere"
import type { MaskSource } from "../render/character-mask"

// Named characters (PCs and staged NPCs) as world-style standees: a painted card with front and back art, lit through a
// normal map derived from its silhouette, casting and receiving shadows, leaning toward the camera within 60 degrees of
// where the character faces. The character mask keeps most of their detail out of the paint filter.

export interface CastArt {
  front: string
  back?: string
  portrait?: string
}
export interface CastMember {
  id: string
  name: string
  role: string
  height: number
  art: CastArt
  x: number
  z: number
  ry: number
  walking: boolean
  walk: number
  stride: number
}

const LEAN = THREE.MathUtils.degToRad(60)
const GAIN = 0.6
const RATE = 4.5
const D = THREE.MathUtils.degToRad
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const smoothstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Exact squared distance transform (Felzenszwalb & Huttenlocher), used for the alpha "bulge".
function edt(inside: Uint8Array, w: number, h: number) {
  const INF = 1e20
  const n = Math.max(w, h)
  const f = new Float32Array(n)
  const d = new Float32Array(n)
  const v = new Int32Array(n)
  const z = new Float32Array(n + 1)
  const g = new Float32Array(w * h)
  const pass = (len: number) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < len; q++) {
      let s: number
      for (;;) {
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        if (s <= z[k]) k--
        else break
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
  }
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? INF : 0
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x]
    pass(h)
    for (let y = 0; y < h; y++) g[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x]
    pass(w)
    for (let x = 0; x < w; x++) g[y * w + x] = d[x]
  }
  return g.map(Math.sqrt)
}
type AlphaMask = { w: number; h: number; inside: Uint8Array }
// A coarse opacity mask of the art (256 px tall), for picking only the painted figure, not its transparent card.
function alphaMask(img: HTMLImageElement): AlphaMask {
  const h = 256
  const w = Math.max(8, Math.round((h * img.width) / img.height))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.drawImage(img, 0, 0, w, h)
  const px = cx.getImageData(0, 0, w, h).data
  const inside = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) inside[i] = px[i * 4 + 3] > 127 ? 1 : 0
  return { w, h, inside }
}

// Normal map from the silhouette alone: distance-to-edge, shaped into a rounded pillow, differentiated.
function bulgeNormals(img: HTMLImageElement) {
  const H = 256
  const W = Math.max(8, Math.round((H * img.width) / img.height))
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.drawImage(img, 0, 0, W, H)
  const px = cx.getImageData(0, 0, W, H).data
  const inside = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) inside[i] = px[i * 4 + 3] > 127 ? 1 : 0
  const dist = edt(inside, W, H)
  let dmax = 1
  for (const v of dist) if (v > dmax) dmax = v
  const R = dmax * 0.8
  const ht = new Float32Array(W * H)
  for (let i = 0; i < ht.length; i++) {
    const t = Math.min(1, dist[i] / R)
    ht[i] = Math.sqrt(1 - (1 - t) * (1 - t))
  }
  const sm = new Float32Array(ht.length) // 3x3 blur keeps the pillow from stair-stepping
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += ht[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))]
      sm[y * W + x] = s / 9
    }
  const out = cx.createImageData(W, H)
  const k = R * 0.9
  const at = (xx: number, yy: number) => sm[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5
      let nx = -gx * k
      let ny = gy * k
      let nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      const o = (y * W + x) * 4
      out.data[o] = (nx * 0.5 + 0.5) * 255
      out.data[o + 1] = (ny * 0.5 + 0.5) * 255
      out.data[o + 2] = (nz * 0.5 + 0.5) * 255
      out.data[o + 3] = 255
    }
  cx.putImageData(out, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

type BackUniforms = { uMapB: THREE.IUniform<THREE.Texture | null>; uBack: THREE.IUniform<number> }

// Grade toward the set palette: warmed with umber in the shadows (unless the set grades neutral), painted saturation down about 13%, and the brightest painted
// metal eased toward the world's values (highlights lose a little chroma and peak brightness); mid-tones, and with them the
// faces, are left alone. Below 80 degrees off its facing the card shows its front, above 100 its back; in between the colours
// are dissolved with a screen-space dither and the alpha is blended.
function standeeMaterial(shared: SharedUniforms, back: BackUniforms) {
  const m = new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.95, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, normalScale: new THREE.Vector2(1, 1) })
  return stageMaterial(m, shared, "standee", (s) => {
    Object.assign(s.uniforms, back)
    s.uniforms.uWarmth = shared.warmth
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uMapB; uniform float uBack, uWarmth;")
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
 vec4 sampledDiffuseColor = uBack > .999 ? texture2D(uMapB, vMapUv) : texture2D(map, vMapUv);
 if (uBack > .001 && uBack < .999) {
  vec4 b = texture2D(uMapB, vMapUv); float a = mix(sampledDiffuseColor.a, b.a, uBack);
  if (uBack > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))))) sampledDiffuseColor = b;
  sampledDiffuseColor.a = a;
 }
 diffuseColor *= sampledDiffuseColor;
#endif
 { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(.299, .587, .114));
   float hi = smoothstep(.55, .95, l); c = mix(vec3(l), c, .87 - hi * .1); c *= 1.0 - hi * .14; c *= mix(vec3(1.0), vec3(1.025, 1.0, .95), uWarmth);
   c += vec3(.04, .016, -.01) * (1.0 - smoothstep(0.0, .55, l)) * uWarmth; c = mix(c, c * c * (3.0 - 2.0 * c), .18);
   diffuseColor.rgb = c; }`
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = normalize(normal + normalize(vViewPosition) * .3 * faceDirection);")
  })
}

interface Standee {
  cast: CastMember
  grp: THREE.Group
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  depth: THREE.MeshDepthMaterial
  bu: BackUniforms
  yaw: number | null
  loaded: boolean
  back: number
  map?: THREE.Texture
  normal?: THREE.Texture
  mapB?: THREE.Texture
  normalB?: THREE.Texture
  aspect: number
  aspectB: number
  mask?: AlphaMask
  maskB?: AlphaMask
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    if (/^https?:/.test(src)) i.crossOrigin = "anonymous"
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error(`Could not load ${src}`))
    i.src = src
  })

export class Standees {
  group = new THREE.Group()
  items = new Map<string, Standee>()
  // Cast members not yet on stage (an entrance the narration has not reached).
  offstage = new Set<string>()

  constructor(
    cast: CastMember[],
    private shared: SharedUniforms,
    private maxAnisotropy: number
  ) {
    this.group.name = "standees"
    for (const c of cast) this.make(c)
  }
  // Full mip chain, trilinear, and the GPU's best anisotropy: the card is often minified and viewed at a slant.
  private texFor(img: HTMLImageElement) {
    const map = new THREE.Texture(img)
    map.colorSpace = THREE.SRGBColorSpace
    map.generateMipmaps = true
    map.minFilter = THREE.LinearMipmapLinearFilter
    map.magFilter = THREE.LinearFilter
    map.anisotropy = this.maxAnisotropy
    map.needsUpdate = true
    return map
  }
  private make(cast: CastMember) {
    const grp = new THREE.Group()
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.translate(0, 0.5, 0)
    const bu: BackUniforms = { uMapB: { value: null }, uBack: { value: 0 } }
    const mat = standeeMaterial(this.shared, bu)
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = mesh.receiveShadow = true
    mesh.customDepthMaterial = depth
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.name = `standee:${cast.id}`
    mesh.userData.castId = cast.id
    grp.add(mesh)
    this.group.add(grp)
    const s: Standee = { cast, grp, mesh, mat, depth, bu, yaw: null, loaded: false, back: 0, aspect: 0.4, aspectB: 0.4 }
    this.items.set(cast.id, s)
  }
  // Resolves when every front has loaded (backs may still be arriving); a failed image leaves that character hidden.
  async load() {
    await Promise.all(
      [...this.items.values()].map(async (s) => {
        const [front, back] = await Promise.all([loadImage(s.cast.art.front), s.cast.art.back ? loadImage(s.cast.art.back).catch(() => null) : Promise.resolve(null)])
        s.map = this.texFor(front)
        s.normal = bulgeNormals(front)
        s.mask = alphaMask(front)
        s.mat.map = s.map
        s.mat.normalMap = s.normal
        s.depth.map = s.map
        s.mat.needsUpdate = s.depth.needsUpdate = true
        s.aspect = front.width / front.height
        s.mesh.scale.set(s.cast.height * s.aspect, s.cast.height, 1)
        if (back) {
          s.mapB = this.texFor(back)
          s.normalB = bulgeNormals(back)
          s.maskB = alphaMask(back)
          s.aspectB = back.width / back.height
          s.bu.uMapB.value = s.mapB
        }
        s.mesh.visible = true
        s.loaded = true
      })
    )
  }
  setAlphaToCoverage(on: boolean) {
    for (const s of this.items.values()) {
      s.mat.alphaToCoverage = on
      s.mat.needsUpdate = true
    }
  }
  // The named characters the paint filter should leave crisp, alpha-tested by whichever view shows.
  maskSources(): MaskSource[] {
    return [...this.items.values()].map((s) => ({ src: s.mesh, map: () => (s.loaded ? (s.map ?? null) : null), mapB: () => s.mapB ?? null, mix: () => s.back }))
  }
  // Yaw toward the camera, but only part of the way and never more than 60 degrees from where the figure is facing; damped
  // so the card swings rather than snaps. With a back view the card shows its front below 80 degrees off its facing and its
  // back above 100 (leaning toward the camera from the opposite side), and in between swings from the front lean to the
  // back lean (70 to 110) while the art dissolves, so it is face-on to the camera at 90 instead of popping. Without a back
  // view the card turns about to show its front once the camera is behind the figure.
  update(dt: number, camera: THREE.Camera) {
    const k = 1 - Math.exp(-dt * RATE)
    for (const s of this.items.values()) {
      const c = s.cast
      c.walk += ((c.walking ? 1 : 0) - c.walk) * Math.min(1, dt * 6)
      if (c.walking) c.stride += dt * 5.6
      const toCam = Math.atan2(camera.position.x - c.x, camera.position.z - c.z)
      const off = wrap(toCam - c.ry)
      const a = Math.abs(off)
      let target: number
      if (s.mapB) {
        const sg = off < 0 ? -1 : 1
        const front = THREE.MathUtils.clamp(off * GAIN, -LEAN, LEAN)
        const back = sg * Math.PI + THREE.MathUtils.clamp(wrap(off - sg * Math.PI) * GAIN, -LEAN, LEAN)
        target = c.ry + THREE.MathUtils.lerp(front, back, smoothstep(D(70), D(110), a))
        s.back = smoothstep(D(80), D(100), a)
      } else {
        const flip = a > 2.1
        const rest = c.ry + (flip ? Math.PI : 0)
        target = rest + THREE.MathUtils.clamp(wrap(toCam - rest) * GAIN, -LEAN, LEAN)
        s.back = 0
      }
      s.yaw = s.yaw === null ? target : s.yaw + wrap(target - s.yaw) * k
      s.grp.position.set(c.x, 0, c.z)
      s.grp.rotation.y = s.yaw
      s.grp.visible = !this.offstage.has(c.id)
      s.mesh.position.y = Math.abs(Math.cos(c.stride)) * 0.035 * c.walk
      s.mesh.rotation.z = Math.sin(c.stride) * 0.035 * c.walk
      // The card is as wide as the art it shows; the shadow caster and the relief follow whichever view dominates.
      s.bu.uBack.value = s.back
      if (s.loaded) s.mesh.scale.x = c.height * (s.mapB ? THREE.MathUtils.lerp(s.aspect, s.aspectB, s.back) : s.aspect)
      const showB = !!s.mapB && s.back > 0.5
      const nm = (showB ? s.normalB : s.normal) ?? null
      if (s.mat.normalMap !== nm) s.mat.normalMap = nm
      s.depth.map = (showB ? s.mapB : s.map) ?? null
    }
  }
  // Whether a hit at this uv on a cast member's card lands on the painted figure (for picking).
  opaqueAt(id: string, uv: { x: number; y: number }) {
    const s = this.items.get(id)
    const m = s && (s.back > 0.5 && s.maskB ? s.maskB : s.mask)
    if (!m) return true
    const x = Math.min(m.w - 1, Math.max(0, Math.floor(uv.x * m.w)))
    const y = Math.min(m.h - 1, Math.max(0, Math.floor((1 - uv.y) * m.h)))
    return m.inside[y * m.w + x] === 1
  }
  // World-space point just above the head, where a speech bubble anchors.
  head(id: string, out = new THREE.Vector3()) {
    const s = this.items.get(id)
    if (!s) return null
    return out.set(s.cast.x, s.cast.height * 1.04, s.cast.z)
  }
  reset() {
    for (const s of this.items.values()) s.yaw = null
  }
  dispose() {
    for (const s of this.items.values()) {
      s.mesh.geometry.dispose()
      s.mat.dispose()
      s.depth.dispose()
      for (const t of [s.map, s.normal, s.mapB, s.normalB]) t?.dispose()
    }
    this.items.clear()
  }
}
