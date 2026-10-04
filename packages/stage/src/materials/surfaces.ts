import * as THREE from "three"
import { canvasTexture } from "../kit/geometry"
import type { Rand } from "../kit/rng"
import { NOISE, type SharedUniforms, stageMaterial } from "./atmosphere"

export interface MaterialContext {
  shared: SharedUniforms
  rand: Rand
}

export interface MasonryOptions {
  a?: string
  b?: string
  c?: string
  mortar?: string
  block?: [number, number]
  joint?: number
  relief?: number
  grime?: number
  variance?: number
  seed?: number
  scale?: number
  roughness?: number
  ground?: boolean
  // Ground only: the gate approach's wear (cart ruts down the middle, dust toward the edges). Off for town squares.
  roads?: boolean
  doubleSided?: boolean
}

// Procedural ashlar: coursed blocks of irregular length, chipped arrises, mortar joints,
// rain streaks, soot near the ground, and sun-bleached tops. Relief is real shading,
// perturbing the normal from the analytic height of each block.
export function masonry(ctx: MaterialContext, name: string, o: MasonryOptions = {}) {
  const u = {
    mA: { value: new THREE.Color(o.a || "#8a5a46") },
    mB: { value: new THREE.Color(o.b || "#a88462") },
    mC: { value: new THREE.Color(o.c || "#6f6a68") },
    mMortar: { value: new THREE.Color(o.mortar || "#4a3a31") },
    mBlock: { value: new THREE.Vector2(...(o.block || [1.9, 0.95])) },
    mJoint: { value: o.joint ?? 0.05 },
    mRelief: { value: o.relief ?? 0.06 },
    mGrime: { value: o.grime ?? 1 },
    mVar: { value: o.variance ?? 0.32 },
    mSeed: { value: o.seed ?? ctx.rand(0, 50) },
    mScale: { value: o.scale ?? 1 },
  }
  const m = new THREE.MeshStandardMaterial({ name, color: "#ffffff", roughness: o.roughness ?? 0.92, metalness: 0, side: o.doubleSided ? THREE.DoubleSide : THREE.FrontSide })
  m.userData.uniforms = u
  const ground = !!o.ground
  const roads = ground && o.roads !== false
  if (ground) m.defines = roads ? { MGROUND: "", MROADS: "" } : { MGROUND: "" }
  return stageMaterial(m, ctx.shared, `masonry${ground ? (roads ? "g" : "gs") : ""}`, (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMUV; varying vec3 vMWorld; varying vec3 vMNormalW;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvMUV = uv; vMWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vMNormalW = normalize(mat3(modelMatrix) * objectNormal);")
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vMUV; varying vec3 vMWorld; varying vec3 vMNormalW;
uniform vec3 mA, mB, mC, mMortar; uniform vec2 mBlock; uniform float mJoint, mRelief, mGrime, mVar, mSeed, mScale;
${NOISE}
float mCell(vec2 uv, out float id, out float edge){
 vec2 p = uv / mBlock; float row = floor(p.y);
 p.x += mhash(vec2(row, mSeed)) * 5.0 + mod(row, 2.0) * .5;
 float col = floor(p.x), fx = fract(p.x), fy = fract(p.y), lo = 0.0, hi = 1.0;
 if (mhash(vec2(col, row) + mSeed) > .55){ float sp = .3 + .4 * mhash(vec2(col * 1.7, row * 3.1) + mSeed); if (fx < sp) hi = sp; else { lo = sp; col += .5; } }
 id = mhash(vec2(col, row * 1.31) + mSeed * 2.0);
 edge = min(min(fx - lo, hi - fx) * mBlock.x, min(fy, 1.0 - fy) * mBlock.y);
 return id;
}
float mHeight(vec2 uv, out float id, out float edge){
 mCell(uv, id, edge);
 edge -= mnoise(uv * 7.0 + id * 31.0) * mJoint * .8 + mnoise(uv * 23.0) * mJoint * .3;
 float bevel = smoothstep(mJoint * .35, mJoint * .35 + .12 * mScale, edge);
 return bevel * (.72 + .28 * (mnoise(uv * 1.7 + id * 17.0) * .65 + mnoise(uv * 5.3) * .35));
}
vec3 mPerturb(vec3 sp, vec3 n, vec2 dh, float fd){
 vec3 dx = dFdx(sp), dy = dFdy(sp), r1 = cross(dy, n), r2 = cross(n, dx);
 float det = dot(dx, r1) * fd;
 return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float mId, mEdge; float mH = mHeight(vMUV, mId, mEdge);
float mFoot = (fwidth(vMUV.x) + fwidth(vMUV.y)) * .5;
float mSharp = 1.0 - smoothstep(mJoint * .5, mJoint * 3.0, mFoot);
vec3 mW = vMWorld;
float mBig = mfbm(mW.xz * .016 + vec2(mW.y * .019, mSeed));
vec3 mBase = mix(mA, mB, smoothstep(.34, .66, mBig));
mBase = mix(mBase, mC, smoothstep(.5, .78, mfbm(vec2(mW.x + mW.z, mW.y) * .055 + 3.1)) * .75);
mBase *= 1.0 + (mId - .5) * mVar;
mBase = mix(mBase, mBase * vec3(1.18, .9, .78), step(.82, fract(mId * 9.7)) * .6);
float mStreak = smoothstep(.45, .85, mfbm(vec2((mW.x + mW.z) * .9, mW.y * .035 + mId * .1)));
mBase *= 1.0 - .6 * mStreak * mGrime;
mBase *= .82 + .36 * mfbm(vec2(mW.x * .35 + mW.z * .35, mW.y * .12));
mBase *= mix(.58, 1.0, smoothstep(0.0, 5.5, mW.y));
mBase = mix(mBase, mBase * 1.32 + .015, clamp(vMNormalW.y, 0.0, 1.0) * .4 * mGrime);
float mMortarAmt = (1.0 - smoothstep(mJoint * .15, mJoint * .5, mEdge)) * mSharp;
#ifdef MGROUND
#ifdef MROADS
float mDust = clamp(smoothstep(.36, .72, mfbm(mW.xz * .045)) + smoothstep(18.0, 60.0, mW.z) * .75 + smoothstep(24.0, 60.0, abs(mW.x)) * .6, 0.0, 1.0);
mDust = max(mDust, smoothstep(.25, 0.0, abs(abs(mW.x + sin(mW.z * .05) * 1.5) - 2.1)) * .7 * smoothstep(0.0, 14.0, mW.z));
#else
float mDust = smoothstep(.36, .72, mfbm(mW.xz * .045)) * .8;
#endif
vec3 mDirt = mix(vec3(.43, .3, .21), vec3(.62, .47, .33), mfbm(mW.xz * .31)) * (.82 + .3 * mnoise(mW.xz * 2.7));
mBase = mix(mBase, mDirt, mDust);
mMortarAmt *= 1.0 - mDust;
mH = mix(mH, mnoise(mW.xz * 3.0) * .3, mDust);
#endif
mBase = mix(mBase, mMortar, mMortarAmt * .75);
diffuseColor.rgb *= mBase;`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (.88 + .24 * mId) + mMortarAmt * .08, .25, 1.0);")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{ float i0, e0; vec2 dx = dFdx(vMUV), dy = dFdy(vMUV);
 float hx = mHeight(vMUV + dx, i0, e0), hy = mHeight(vMUV + dy, i0, e0);
 #ifdef MGROUND
 hx = mix(hx, mnoise((vMWorld.xz + dFdx(vMWorld.xz)) * 3.0) * .3, mDust); hy = mix(hy, mnoise((vMWorld.xz + dFdy(vMWorld.xz)) * 3.0) * .3, mDust);
 #endif
 normal = mPerturb(-vViewPosition, normal, vec2(hx - mH, hy - mH) * mRelief * mSharp, faceDirection); }`
      )
  })
}

export interface WoodOptions {
  a?: string
  b?: string
  c?: string
  dark?: string
  plank?: [number, number]
  relief?: number
  wear?: number
  variance?: number
  seed?: number
  grime?: number
  roughness?: number
  // A painted board texture (see the `painted` material): its grain replaces the procedural colour and ring grain.
  map?: THREE.Texture
  // [across, along] the grain in metres that the map covers.
  mapSize?: [number, number]
  tint?: string
  nails?: number
}

// Procedural timber: boards laid along the grain axis the Batch recorded for each piece (see woodGrain in kit/geometry),
// with sawn seams, ring and fibre grain, worn arrises, sun-greyed patches, ground grime and real relief in the normal.
// plank = [board width across the grain, board length along it] in metres; a width of 0 leaves a single round or solid piece.
export function wood(ctx: MaterialContext, name: string, o: WoodOptions = {}) {
  const u = {
    wA: { value: new THREE.Color(o.a || "#6a4b33") },
    wB: { value: new THREE.Color(o.b || "#7e5b3e") },
    wC: { value: new THREE.Color(o.c || "#5a4a3c") },
    wDark: { value: new THREE.Color(o.dark || "#20160f") },
    wPlank: { value: new THREE.Vector2(...(o.plank || [0.2, 2])) },
    wRelief: { value: o.relief ?? 0.05 },
    wWear: { value: o.wear ?? 1 },
    wVar: { value: o.variance ?? 0.35 },
    wSeed: { value: o.seed ?? 7.3 },
    wGrime: { value: o.grime ?? 0.6 },
    wMap: { value: o.map ?? null },
    wMapSize: { value: new THREE.Vector2(...(o.mapSize || [0.6, 1.2])) },
    wTint: { value: new THREE.Color(o.tint || "#ffffff") },
    wNails: { value: o.nails ?? 0 },
  }
  const m = new THREE.MeshStandardMaterial({ name, color: "#ffffff", roughness: o.roughness ?? 0.9, metalness: 0 })
  m.userData.wood = true
  m.userData.uniforms = u
  if (o.map) m.defines = { WMAP: "" }
  return stageMaterial(m, ctx.shared, o.map ? "woodmap" : "wood", (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 grain; varying vec4 vGr; varying vec2 vMUV; varying vec3 vMWorld; varying vec3 vMNormalW;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvGr = grain; vMUV = uv; vMWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vMNormalW = normalize(mat3(modelMatrix) * objectNormal);")
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vGr; varying vec2 vMUV; varying vec3 vMWorld; varying vec3 vMNormalW;
uniform vec3 wA, wB, wC, wDark; uniform vec2 wPlank; uniform float wRelief, wWear, wVar, wSeed, wGrime;
#ifdef WMAP
uniform sampler2D wMap; uniform vec2 wMapSize; uniform vec3 wTint; uniform float wNails;
#endif
${NOISE}
vec2 wCoord(){
 vec3 g = normalize(vGr.xyz), n = normalize(vMNormalW), c = cross(n, g);
 c = dot(c, c) > 1e-4 ? normalize(c) : vec3(0.0, 0.0, 1.0);
 return vec2(dot(vMWorld, g), vGr.w > 0.0 ? vMUV.x * vGr.w : dot(vMWorld, c));
}
float wHeight(vec2 P, out float id, out float seam, float foot, float sharp){
 float pw = wPlank.x, pl = wPlank.y;
 float row = pw > 0.0 ? floor(P.y / pw) : 0.0;
 float a = P.x + mhash(vec2(row * 1.37, wSeed)) * pl * 5.3;
 float col = floor(a / pl);
 id = mhash(vec2(col, row) * 1.13 + wSeed * 2.0);
 float fx = fract(a / pl), fy = pw > 0.0 ? fract(P.y / pw) : .5;
 seam = min(min(fx, 1.0 - fx) * pl, pw > 0.0 ? min(fy, 1.0 - fy) * pw : 9.0);
 float ring = mnoise(vec2(a * .8, P.y * 11.0 + id * 30.0) + mnoise(vec2(a * 2.0, P.y * 5.0)) * 2.2);
 float fine = mnoise(vec2(a * 1.9, P.y * 70.0 + id * 50.0));
 float groove = smoothstep(.002, .016 + foot * 1.5, seam - mnoise(P * 9.0) * .006);
 return groove * (.62 + .22 * ring + .1 * fine * sharp);
}
#ifdef WMAP
// Nail heads near each board's ends: two across a wide board, one across a narrow one. 1 on a head, 0 elsewhere.
float wNail(vec2 P, float foot){
 float pw = wPlank.x, pl = wPlank.y;
 if (pw <= 0.0 || wNails <= 0.0) return 0.0;
 float row = floor(P.y / pw);
 float a = P.x + mhash(vec2(row * 1.37, wSeed)) * pl * 5.3;
 float fx = fract(a / pl) * pl, fy = fract(P.y / pw) * pw;
 float ex = min(fx, pl - fx) - .045;
 float r = .0085 + foot * .5;
 float d = pw > .15 ? min(length(vec2(ex, fy - pw * .27)), length(vec2(ex, fy - pw * .73))) : length(vec2(ex, fy - pw * .5));
 float keep = step(1.0 - wNails, mhash(vec2(floor(a / pl + .5), row) + wSeed * 3.1));
 return (1.0 - smoothstep(r * .6, r, d)) * keep;
}
#endif
vec3 wPerturb(vec3 sp, vec3 n, vec2 dh, float fd){
 vec3 dx = dFdx(sp), dy = dFdy(sp), r1 = cross(dy, n), r2 = cross(n, dx);
 float det = dot(dx, r1) * fd;
 return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 wP = wCoord(); float wFoot = max(length(dFdx(wP)), length(dFdy(wP)));
float wSharp = 1.0 - smoothstep(.012, .06, wFoot);
float wId, wSeam; float wH = wHeight(wP, wId, wSeam, wFoot, wSharp);
#ifdef WMAP
// Each board shows its own patch of the painting; the gradient comes from the continuous coordinate so seams keep
// their mip level.
vec2 wT = vec2(wP.y / wMapSize.x, wP.x / wMapSize.y);
vec4 wTex = textureGrad(wMap, wT + vec2(wId * 7.31, wId * 3.77), dFdx(wT), dFdy(wT));
vec3 wCol = wTex.rgb * wTint * (1.0 + (wId - .5) * wVar);
float wLum = dot(wTex.rgb, vec3(.3, .55, .15));
wH *= .8 + .35 * wLum;
float wNailAmt = wNail(wP, wFoot);
#else
vec3 wCol = mix(wA, wB, smoothstep(.15, .85, wId)) * (1.0 + (wId - .5) * wVar);
wCol = mix(wCol, wC, smoothstep(.55, .9, mfbm(vec2(wP.x * .25, wP.y * 1.2) + wSeed)) * .55);
float wGr = mnoise(vec2(wP.x * 1.6, wP.y * 34.0 + wId * 50.0));
float wRing = .5 + .5 * sin(wP.y * 24.0 + mnoise(vec2(wP.x * 1.3, wP.y * 6.0)) * 8.0 + wId * 40.0);
wCol *= mix(1.0, .8 + .34 * wGr, wSharp * .8 + .2) * mix(1.0, .9 + .2 * wRing, wSharp * .7 + .3);
#endif
float wSeamAmt = 1.0 - smoothstep(.002, .012 + wFoot, wSeam);
float wWearAmt = smoothstep(.06, .012, wSeam) * (1.0 - wSeamAmt);
wCol = mix(wCol, wCol * 1.32 + .015, wWearAmt * .5 * wWear);
wCol = mix(wCol, wDark, wSeamAmt * .8);
wCol *= mix(.62, 1.0, smoothstep(0.0, 1.4, vMWorld.y));
wCol *= 1.0 - wGrime * .28 * smoothstep(.4, .8, mfbm(vMWorld.xz * 1.7 + vMWorld.y * .9));
wCol = mix(wCol, wCol * 1.22 + .01, clamp(normalize(vMNormalW).y, 0.0, 1.0) * .3);
#ifdef WMAP
wCol = mix(wCol, mix(vec3(.05, .045, .04), vec3(.22, .09, .04), mnoise(wP * 60.0)), wNailAmt * .9);
#endif
diffuseColor.rgb *= wCol;`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (.9 + .2 * wId) - wWearAmt * .12 + wSeamAmt * .06, .3, 1.0);")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
#ifdef WMAP
{ float wHn = wH + wNailAmt * .5;
 normal = wPerturb(-vViewPosition, normal, vec2(dFdx(wHn), dFdy(wHn)) * wRelief * (wSharp * .7 + .3), faceDirection); }
#else
{ float i0, s0; float hx = wHeight(wP + dFdx(wP), i0, s0, wFoot, wSharp), hy = wHeight(wP + dFdy(wP), i0, s0, wFoot, wSharp);
 normal = wPerturb(-vViewPosition, normal, vec2(hx - wH, hy - wH) * wRelief * (wSharp * .7 + .3), faceDirection); }
#endif`
      )
  })
}

// Coarse woven sacking for sacks and baskets: a thread grid with slubs, used as colour and as bump.
function burlapMap(rand: Rand) {
  const t = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#d8cdb0"
    c.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        const k = rand()
        c.fillStyle = k < 0.3 ? "#a89670" : k < 0.7 ? "#e6dcc0" : "#c4b48c"
        c.fillRect(x, y, 3, 3)
      }
    for (let y = 0; y < h; y += 4) {
      c.fillStyle = "#5a48302a"
      c.fillRect(0, y + 3, w, 1)
    }
    for (let x = 0; x < w; x += 4) {
      c.fillStyle = "#5a48302a"
      c.fillRect(x + 3, 0, 1, h)
    }
    for (let i = 0; i < 260; i++) {
      c.fillStyle = rand.pick(["#6d5a3a30", "#f4ead022"])
      c.fillRect(rand(0, w), rand(0, h), rand(6, 26), 2)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(5, 4)
  return t
}

// Weave and dirt for every cloth surface.
function fabricMap(rand: Rand) {
  const t = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#ddd6c8"
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 16000; i++) {
      c.fillStyle = rand.pick(["#6d604a18", "#ffffff1c", "#3c2e1a14"])
      c.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 7))
    }
    for (let i = 0; i < 40; i++) {
      const g = c.createRadialGradient(rand(0, w), rand(0, h), 1, rand(0, w), rand(0, h), rand(20, 70))
      g.addColorStop(0, "#5a412a24")
      g.addColorStop(1, "#5a412a00")
      c.fillStyle = g
      c.fillRect(0, 0, w, h)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// Frayed hems and moth holes, used as an alpha mask on banners and awning valances.
export function tatters(rand: Rand, holes = 6, depth = 0.16) {
  return canvasTexture(
    256,
    512,
    (c, w, h) => {
      c.fillStyle = "#fff"
      c.fillRect(0, 0, w, h)
      c.fillStyle = "#000"
      c.beginPath()
      c.moveTo(0, h)
      for (let x = 0; x <= w; x += 4) {
        const tear = rand() ** 3 * depth * h + rand(0, 10) + Math.sin(x * 0.05) * 6
        c.lineTo(x, h - tear)
      }
      c.lineTo(w, h)
      c.fill()
      for (let i = 0; i < holes; i++) {
        const cx = rand(20, w - 20)
        const cy = rand(h * 0.45, h * 0.95)
        const r = rand(3, 12)
        c.beginPath()
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2
          const rr = r * rand(0.4, 1.3)
          c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.6)
        }
        c.fill()
      }
    },
    false
  )
}

// Clusters of small painted leaves on a clear ground, tiling. Alpha-tested, so a crown reads as ragged foliage with
// gaps of sky rather than a smooth ball. Pale, so each foliage material's colour tints it.
function leafMap(rand: Rand) {
  const t = canvasTexture(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    for (let i = 0; i < 1500; i++) {
      const x = rand(0, w)
      const y = rand(0, h)
      const l = Math.round(rand(150, 255))
      c.fillStyle = `rgb(${Math.round(l * rand(0.85, 1))}, ${l}, ${Math.round(l * rand(0.75, 0.95))})`
      c.save()
      c.translate(x, y)
      c.rotate(rand(0, Math.PI * 2))
      c.beginPath()
      c.ellipse(0, 0, rand(5, 11), rand(2.5, 5), 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 2)
  return t
}

// A shaft of light: brightest through the middle of its height, fading out at top and bottom, with faint streaks.
function shaftMap(rand: Rand) {
  const t = canvasTexture(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, "rgba(255,255,255,0)")
    g.addColorStop(0.25, "rgba(255,255,255,0.55)")
    g.addColorStop(0.7, "rgba(255,255,255,0.4)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    c.globalCompositeOperation = "destination-out"
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(0,0,0,${rand(0.1, 0.5)})`
      c.fillRect(rand(0, w), 0, rand(2, 14), h)
    }
  })
  t.wrapS = THREE.RepeatWrapping
  return t
}

// Soft cloud for mist banks: overlapping blurred puffs along a band, faded to nothing at every edge so a card never
// shows its outline where it meets the ground or the sky.
function mistMap(rand: Rand) {
  return canvasTexture(512, 256, (c, w, h) => {
    for (let i = 0; i < 70; i++) {
      const x = rand(0.04, 0.96) * w
      const y = h * (0.5 + rand(-0.18, 0.18))
      const r = rand(0.12, 0.3) * h
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(255,255,255,${rand(0.12, 0.3)})`)
      g.addColorStop(1, "rgba(255,255,255,0)")
      c.fillStyle = g
      c.fillRect(x - r, y - r, 2 * r, 2 * r)
    }
    c.globalCompositeOperation = "destination-in"
    const fx = c.createLinearGradient(0, 0, w, 0)
    fx.addColorStop(0, "rgba(0,0,0,0)")
    fx.addColorStop(0.2, "rgba(0,0,0,1)")
    fx.addColorStop(0.8, "rgba(0,0,0,1)")
    fx.addColorStop(1, "rgba(0,0,0,0)")
    c.fillStyle = fx
    c.fillRect(0, 0, w, h)
    const fy = c.createLinearGradient(0, 0, 0, h)
    fy.addColorStop(0, "rgba(0,0,0,0)")
    fy.addColorStop(0.35, "rgba(0,0,0,1)")
    fy.addColorStop(0.65, "rgba(0,0,0,1)")
    fy.addColorStop(1, "rgba(0,0,0,0)")
    c.fillStyle = fy
    c.fillRect(0, 0, w, h)
  })
}

// Textures shared by the materials of one set, made on first use.
export class TextureBank {
  private mistTex?: THREE.Texture
  mist() {
    if (!this.mistTex) this.mistTex = this.keep(mistMap(this.rand))
    return this.mistTex
  }
  private burlapTex?: THREE.Texture
  private fabricTex?: THREE.Texture
  private leafTex?: THREE.Texture
  readonly owned: THREE.Texture[] = []
  constructor(private rand: Rand) {}
  burlap() {
    if (!this.burlapTex) this.burlapTex = this.keep(burlapMap(this.rand))
    return this.burlapTex
  }
  fabric() {
    if (!this.fabricTex) this.fabricTex = this.keep(fabricMap(this.rand))
    return this.fabricTex
  }
  leaves() {
    if (!this.leafTex) this.leafTex = this.keep(leafMap(this.rand))
    return this.leafTex
  }
  private shaftTex?: THREE.Texture
  shaft() {
    if (!this.shaftTex) this.shaftTex = this.keep(shaftMap(this.rand))
    return this.shaftTex
  }
  keep<T extends THREE.Texture>(t: T) {
    this.owned.push(t)
    return t
  }
  dispose() {
    for (const t of this.owned) t.dispose()
    this.owned.length = 0
  }
}

export interface ClothOptions {
  map?: THREE.Texture
  alphaMap?: THREE.Texture | null
  amp?: number
  freq?: number
}

// Wind moves cloth in the vertex shader. The baked `sway` attribute is 0 where the
// fabric is fixed (a pole, a batten) and 1 at its free edge.
export function cloth(ctx: MaterialContext, bank: TextureBank, name: string, color: string, o: ClothOptions = {}) {
  const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.94, side: THREE.DoubleSide, map: o.map || bank.fabric(), alphaMap: o.alphaMap || null, alphaTest: o.alphaMap ? 0.5 : 0 })
  m.userData.sway = true
  const amp = (o.amp ?? 0.35).toFixed(3)
  const freq = (o.freq ?? 1).toFixed(3)
  return stageMaterial(m, ctx.shared, `cloth${amp}-${freq}`, (s) => {
    s.uniforms.uTime = ctx.shared.time
    s.uniforms.uWind = ctx.shared.wind
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float sway; uniform float uTime, uWind;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float ph = position.x * .21 + position.z * .17;
float wv = sin(uTime * 1.6 * ${freq} + position.y * .45 + ph) * .6 + sin(uTime * 2.7 * ${freq} + position.x * .9 - position.y * .7) * .3 + sin(uTime * .7 + ph * 2.0) * .4;
vec3 wdir = normalize(objectNormal + vec3(.35, 0.0, .2));
transformed += wdir * wv * sway * uWind * ${amp};
transformed.x += sway * sway * uWind * ${amp} * .6 * (1.0 + sin(uTime * .9 + ph));`
    )
  })
}

export function foliage(ctx: MaterialContext, bank: TextureBank, name: string, color: string, roughness = 0.9) {
  return stageMaterial(new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, map: bank.leaves(), alphaTest: 0.5, side: THREE.DoubleSide }), ctx.shared, "foliage")
}
// Mist banks: soft unlit cloud cards in the fog's colour, blended over the scene and fogged with it.
export function mist(ctx: MaterialContext, bank: TextureBank, name: string, color: string, opacity = 0.5) {
  const m = new THREE.MeshBasicMaterial({ name, color, map: bank.mist(), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
  m.userData.noShadow = true
  return stageMaterial(m, ctx.shared, "mist")
}
// A cut-out painting on a card (hanging moss): alpha-tested, lit from both sides, no shadow.
export function card(ctx: MaterialContext, name: string, map: THREE.Texture, tint = "#ffffff", roughness = 0.95) {
  const m = new THREE.MeshStandardMaterial({ name, color: tint, roughness, metalness: 0, map, alphaTest: 0.35, side: THREE.DoubleSide })
  m.userData.noShadow = true
  m.userData.card = true
  return stageMaterial(m, ctx.shared, "card")
}
export function glow(ctx: MaterialContext, bank: TextureBank, name: string, color: string, opacity = 0.35) {
  const m = new THREE.MeshBasicMaterial({ name, color, map: bank.shaft(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  m.userData.noShadow = true
  return stageMaterial(m, ctx.shared, "glow")
}
export function burlap(ctx: MaterialContext, bank: TextureBank, name: string, color: string, roughness = 0.95) {
  const t = bank.burlap()
  return stageMaterial(new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, map: t, bumpMap: t, bumpScale: 1.6 }), ctx.shared, "burlap")
}
export function metal(ctx: MaterialContext, name: string, color: string, roughness = 0.45, metalness = 0.75) {
  return stageMaterial(new THREE.MeshStandardMaterial({ name, color, roughness, metalness }), ctx.shared, "std")
}
export function plain(ctx: MaterialContext, name: string, color: string, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) {
  return stageMaterial(new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, ...extra }), ctx.shared, "std")
}
