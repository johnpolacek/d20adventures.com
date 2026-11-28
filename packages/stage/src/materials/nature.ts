import * as THREE from "three"
import { NOISE, stageMaterial } from "./atmosphere"
import type { MaterialContext } from "./surfaces"

// Natural surfaces painted from world position, so they need no uv and never tile: weathered rock with moss and lichen,
// a meadow floor, grass blades and running water.

// Bends the normal by a height field's screen-space gradient (the same trick as the masonry relief).
const PERTURB = /* glsl */ `
vec3 nPerturb(vec3 sp, vec3 n, vec2 dh, float fd){
 vec3 dx = dFdx(sp), dy = dFdy(sp), r1 = cross(dy, n), r2 = cross(n, dx);
 float det = dot(dx, r1) * fd;
 return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`

const WORLD_VERTEX = (s: THREE.WebGLProgramParametersWithUniforms) => {
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vNWorld; varying vec3 vNNormalW;")
    .replace("#include <fog_vertex>", "#include <fog_vertex>\nvNWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vNNormalW = normalize(mat3(modelMatrix) * objectNormal);")
}

export interface RockOptions {
  a?: string
  b?: string
  moss?: string
  mossLight?: string
  lichen?: string
  mossAmount?: number
  lichenAmount?: number
  relief?: number
  scale?: number
  seed?: number
}

// Weathered field stone: broad mottling, fine grain, hairline cracks and vertical weather streaks, with moss that
// gathers on upward faces, in hollows and toward the foot, and pale lichen rosettes on bare stone. Projected three
// ways from world position, so a menhir, a boulder and a flagstone share the same rock.
export function rock(ctx: MaterialContext, name: string, o: RockOptions = {}) {
  const u = {
    rA: { value: new THREE.Color(o.a || "#5d625c") },
    rB: { value: new THREE.Color(o.b || "#7a7d74") },
    rMossDark: { value: new THREE.Color(o.moss || "#2f4a26") },
    rMossLit: { value: new THREE.Color(o.mossLight || "#5a7a34") },
    rLichen: { value: new THREE.Color(o.lichen || "#a9b39a") },
    rMossAmt: { value: o.mossAmount ?? 0.5 },
    rLichenAmt: { value: o.lichenAmount ?? 0.5 },
    rRelief: { value: o.relief ?? 0.5 },
    rScale: { value: o.scale ?? 1 },
    rSeed: { value: o.seed ?? ctx.rand(0, 50) },
  }
  const m = new THREE.MeshStandardMaterial({ name, color: "#ffffff", roughness: 0.9, metalness: 0 })
  m.userData.uniforms = u
  return stageMaterial(m, ctx.shared, "rock", (s) => {
    Object.assign(s.uniforms, u)
    WORLD_VERTEX(s)
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vNWorld; varying vec3 vNNormalW;
uniform vec3 rA, rB, rMossDark, rMossLit, rLichen; uniform float rMossAmt, rLichenAmt, rRelief, rScale, rSeed;
${NOISE}
${PERTURB}
vec3 rW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
float rTriF(vec3 p, vec3 w, float s){ return mfbm(p.yz * s + rSeed) * w.x + mfbm(p.xz * s + rSeed * 1.7) * w.y + mfbm(p.xy * s + rSeed * 2.3) * w.z; }
float rTriN(vec3 p, vec3 w, float s){ return mnoise(p.yz * s + rSeed) * w.x + mnoise(p.xz * s + rSeed * 1.7) * w.y + mnoise(p.xy * s + rSeed * 2.3) * w.z; }
float rHeight(vec3 p, vec3 w, float moss){
 float big = rTriF(p, w, .7 * rScale);
 float grain = rTriN(p, w, 9.0 * rScale);
 float strata = sin((p.y + big * 1.6) * 5.5 * rScale) * .5 + .5;
 float h = big * .7 + strata * .12 + grain * .1;
 float tuft = rTriN(p, w, 34.0) * .5 + rTriN(p, w, 13.0) * .5;
 return mix(h, .55 + tuft * .25, moss * .8);
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 rP = vNWorld; vec3 rN = normalize(vNNormalW); vec3 rWt = rW(rN);
float rBig = rTriF(rP, rWt, .7 * rScale);
float rPatch = rTriF(rP, rWt, .45 * rScale + .0) * .65 + rTriN(rP, rWt, 2.6) * .35;
float rUp = smoothstep(-.15, .75, rN.y);
float rFoot = 1.0 - smoothstep(.2, 1.6, rP.y);
float rCav = 1.0 - smoothstep(.35, .6, rBig);
float rMoss = smoothstep(.56, .68, rPatch * .62 + rUp * .3 + rCav * .16 + rFoot * .16 + (rMossAmt - .5) * .55);
vec3 rStone = mix(rA, rB, smoothstep(.3, .72, rBig));
rStone *= .8 + .4 * (rTriN(rP, rWt, 9.0 * rScale) * .6 + rTriN(rP, rWt, 23.0 * rScale) * .4);
rStone *= 1.0 - .32 * smoothstep(.45, .85, mfbm(vec2((rP.x + rP.z) * 2.2, rP.y * .25 + rSeed)));
rStone = mix(rStone, rStone * vec3(.92, 1.0, .95) * 1.18, smoothstep(.55, .8, rTriF(rP, rWt, 3.1)) * .4);
float rLich = smoothstep(.8, .86, rTriN(rP, rWt, 7.0)) * (1.0 - rMoss) * rLichenAmt;
rLich = max(rLich, smoothstep(.84, .9, rTriN(rP, rWt, 19.0)) * (1.0 - rMoss) * rLichenAmt * .8);
rStone = mix(rStone, rLichen, rLich * .5);
vec3 rMossC = mix(rMossDark, rMossLit, smoothstep(.3, .75, rTriN(rP, rWt, 6.0)) * (.55 + .45 * rUp));
rMossC *= .86 + .28 * rTriN(rP, rWt, 30.0);
vec3 rCol = mix(rStone, rMossC, rMoss);
rCol *= mix(.45, 1.0, smoothstep(0.0, .9, rP.y));
diffuseColor.rgb *= rCol;`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(.82 - rLich * .1, 1.0, rMoss);")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{ vec3 dx = dFdx(rP), dy = dFdy(rP); float h0 = rHeight(rP, rWt, rMoss);
 float foot = max(length(dx), length(dy));
 float sharp = 1.0 - smoothstep(.02, .12, foot);
 normal = nPerturb(-vViewPosition, normal, vec2(rHeight(rP + dx, rWt, rMoss) - h0, rHeight(rP + dy, rWt, rMoss) - h0) * rRelief * (.35 + .65 * sharp), faceDirection); }`
      )
  })
}

export interface MeadowOptions {
  grass?: string
  grassDark?: string
  moss?: string
  dry?: string
  dirt?: string
  litter?: string
  dirtAmount?: number
  pebbles?: number
  litterAmount?: number
  flowers?: number
  relief?: number
  seed?: number
  // A worn track painted into the floor itself along these points [x, z], `pathWidth` metres across: bare trodden
  // earth down the middle, its edges wandering and broken where the grass and moss creep back in.
  path?: [number, number][]
  pathWidth?: number
}

// A path's points smoothed into a curve, a few to each stretch, so its bends are not corners.
function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return pts.map(([x, z]) => new THREE.Vector2(x, z))
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)))
  return curve.getPoints(Math.min(48, (pts.length - 1) * 3)).map((v) => new THREE.Vector2(v.x, v.z))
}

// A meadow floor seen up close: broad patches of lush and dry grass and cushion moss, fine blade speckle, bare earth
// with pebbles, fallen leaves and the odd wildflower. Detail fades with distance so it never shimmers.
export function meadow(ctx: MaterialContext, name: string, o: MeadowOptions = {}) {
  const path = o.path?.length && o.path.length > 1 ? smoothPath(o.path) : null
  const u = {
    gGrass: { value: new THREE.Color(o.grass || "#3f6a34") },
    gDark: { value: new THREE.Color(o.grassDark || "#22401f") },
    gMoss: { value: new THREE.Color(o.moss || "#4d7a2c") },
    gDry: { value: new THREE.Color(o.dry || "#6a6a3a") },
    gSoilCol: { value: new THREE.Color(o.dirt || "#3d3226") },
    gLitter: { value: new THREE.Color(o.litter || "#6a4a2a") },
    gDirtAmt: { value: o.dirtAmount ?? 0.4 },
    gPebbles: { value: o.pebbles ?? 0.5 },
    gLitterAmt: { value: o.litterAmount ?? 0.4 },
    gFlowers: { value: o.flowers ?? 0.3 },
    gRelief: { value: o.relief ?? 0.6 },
    gSeed: { value: o.seed ?? ctx.rand(0, 50) },
    gPath: { value: path ?? [] },
    gPathW: { value: o.pathWidth ?? 1.4 },
  }
  const m = new THREE.MeshStandardMaterial({ name, color: "#ffffff", roughness: 0.95, metalness: 0 })
  m.userData.uniforms = u
  if (path) m.defines = { GPATH: path.length }
  return stageMaterial(m, ctx.shared, path ? `meadowpath${path.length}` : "meadow", (s) => {
    Object.assign(s.uniforms, u)
    WORLD_VERTEX(s)
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vNWorld; varying vec3 vNNormalW;
uniform vec3 gGrass, gDark, gMoss, gDry, gSoilCol, gLitter; uniform float gDirtAmt, gPebbles, gLitterAmt, gFlowers, gRelief, gSeed;
${NOISE}
${PERTURB}
#ifdef GPATH
uniform vec2 gPath[GPATH]; uniform float gPathW;
// How far a point lies from the path's line.
float gPathD(vec2 p){
 float d = 1e4;
 for (int i = 0; i < GPATH - 1; i++){ vec2 a = gPath[i], ab = gPath[i + 1] - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); d = min(d, length(p - a - ab * t)); }
 return d;
}
// 1 on the trodden earth, 0 off it. The half width swells and narrows along the way, the edge wanders over a metre or
// so and frays at the scale of a hand, and tongues of grass reach in from the verges.
float gPathMask(vec2 p, float d){
 float hw = gPathW * .5 * (.75 + .5 * mfbm(p * .18 + 41.0));
 float e = d - hw + (mfbm(p * .9 + 13.0) - .5) * gPathW * .55 + (mnoise(p * 6.0 + 2.0) - .5) * .16;
 float m = 1.0 - smoothstep(-.18, .22, e);
 m *= smoothstep(.15, .4, mfbm(p * 1.6 + 71.0) + .45 * (1.0 - smoothstep(0.0, hw, d)));
 return m;
}
#endif
vec2 gH2(vec2 p){ return vec2(mhash(p + gSeed), mhash(p * 1.37 + 17.1 + gSeed)); }
// A pebble per cell where the cell's dice allow: x = coverage, y = dome height.
vec2 gPebble(vec2 p, float scale, float dens){
 vec2 c = p * scale, id = floor(c), f = fract(c); vec2 h = gH2(id);
 if (mhash(id * .71 + 3.3 + gSeed) > dens) return vec2(0.0);
 vec2 d = (f - (.25 + .5 * h)) * vec2(1.0, 1.0 + h.x * .8);
 float r = .08 + .14 * h.y, q = length(d) / r;
 return vec2(1.0 - smoothstep(.8, 1.0, q), sqrt(max(1.0 - q * q, 0.0)));
}
vec3 gDirtC(vec2 p, float sharp){ return gSoilCol * mix(1.0, .7 + .5 * mnoise(p * 13.0), sharp) * (.8 + .35 * mfbm(p * 1.3)); }
float gDirtMask(vec2 p){ return smoothstep(.6, .72, mfbm(p * .21 + 3.3 + gSeed) + gDirtAmt * .6 - .2); }
float gHeight(vec2 p, float dirt, float sharp){
 float blades = mnoise(p * 26.0) * .55 + mnoise(p * 61.0 + 4.0) * .45;
 float clump = mnoise(p * 4.2);
 float peb = gPebble(p, 3.2, gPebbles * (.12 + dirt * .6)).y;
 float h = mix(blades * .5 + clump * .5, mnoise(p * 9.0) * .3, dirt) * sharp + peb * 1.6;
#ifdef GPATH
 // Trodden earth is uneven: scuffs and hollows a hand to a stride across.
 h += dirt * (mnoise(p * 2.3 + 8.0) * .9 + mnoise(p * 6.5 + 3.0) * .35);
#endif
 return h;
}
#ifdef GPATH
// The path's own mask is taken once, at the pixel: its neighbours' would change the relief by less than a pixel shows.
#define G_DIRT(p) max(gDirtMask(p), gTrod)
#else
#define G_DIRT(p) gDirtMask(p)
#endif`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 gP = vNWorld.xz;
float gFoot = fwidth(gP.x) + fwidth(gP.y);
float gSharp = 1.0 - smoothstep(.015, .09, gFoot);
float gMid = 1.0 - smoothstep(.06, .4, gFoot);
float gBig = mfbm(gP * .06 + gSeed);
vec3 gCol = mix(gDark, gGrass, smoothstep(.3, .7, gBig));
gCol = mix(gCol, gMoss, smoothstep(.52, .72, mfbm(gP * .33 + gSeed * 2.0)) * .75);
gCol = mix(gCol, gDry, smoothstep(.6, .8, mfbm(gP * .12 + 7.0)) * .55);
gCol *= .8 + .4 * mix(.5, mnoise(gP * 4.2), gMid);
float gBl = mnoise(gP * 26.0) * .55 + mnoise(gP * 61.0 + 4.0) * .45;
gCol *= mix(1.0, .55 + .8 * gBl, gSharp * .85);
#ifdef GPATH
float gPd = gPathD(gP);
float gTrod = gPd < gPathW * 1.3 ? gPathMask(gP, gPd) : 0.0;
#endif
float gDirt = G_DIRT(gP);
vec3 gSoil = gDirtC(gP, gSharp);
#ifdef GPATH
// Down the middle the earth is packed, a shade paler, with darker scuffed hollows in it.
gSoil *= mix(1.0, (1.3 + .15 * mnoise(gP * 3.0)) * mix(1.0, .72, smoothstep(.55, .78, mfbm(gP * 2.3 + 8.0))), gTrod * (1.0 - smoothstep(0.0, gPathW * .4, gPd)));
#endif
gCol = mix(gCol, gSoil, gDirt);
// Fallen leaves: small rotated ovals in a share of cells.
{ vec2 c = gP * 5.0, id = floor(c), f = fract(c) - .5; vec2 h = gH2(id + 9.0);
  float a = h.x * 6.283; vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (f - (h - .5) * .5);
  float leaf = (1.0 - smoothstep(.8, 1.0, length(q / vec2(.2, .09)))) * step(mhash(id * 1.9 + gSeed), gLitterAmt * (.35 + gDirt * .8)) * gSharp;
  gCol = mix(gCol, gLitter * (.7 + .6 * h.y), leaf * .85); }
// Pebbles: grey domes, lit on top.
{ vec2 pb = gPebble(gP, 3.2, gPebbles * (.12 + gDirt * .6));
  vec3 pc = mix(gSoilCol * 1.5, vec3(.26, .27, .25), .35 + .3 * mhash(floor(gP * 3.2) + 2.0)) * (.55 + .5 * pb.y);
  gCol = mix(gCol, pc, pb.x * gSharp); }
// Wildflowers: rare bright specks in the grass.
{ vec2 c = gP * 9.0, id = floor(c), f = fract(c); vec2 h = gH2(id + 31.0);
  float fl = (1.0 - smoothstep(.04, .07, length(f - (.2 + .6 * h)))) * step(mhash(id * 2.3 + 5.0 + gSeed), gFlowers * .06) * (1.0 - gDirt) * gSharp;
  vec3 fc = h.x < .45 ? vec3(.62, .22, .32) : h.x < .75 ? vec3(.78, .78, .7) : vec3(.75, .45, .18);
  gCol = mix(gCol, fc, fl); }
diffuseColor.rgb *= gCol;`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{ vec2 dx = dFdx(gP), dy = dFdy(gP); float h0 = gHeight(gP, gDirt, gSharp);
 float hx = gHeight(gP + dx, G_DIRT(gP + dx), gSharp), hy = gHeight(gP + dy, G_DIRT(gP + dy), gSharp);
 normal = nPerturb(-vViewPosition, normal, vec2(hx - h0, hy - h0) * gRelief * .08, faceDirection); }`
      )
  })
}

export interface GrassOptions {
  base?: string
  tip?: string
  roughness?: number
  backlight?: number
}

// Grass blades and heather: each blade shades from a dark root to its tip colour along uv.y (0 at the root, 1 at the
// tip), and its tip sways in the wind. Blade normals point up, so a meadow lights like the ground it grows from.
// Past about 5 m blades flatten toward one shade and sway less, so thin far blades don't flicker.
// uv.x carries a per-tuft random value for colour variety. Casts no shadow: thousands of blades would only add noise.
// Opt-in sun-through-blade backlight translucency adapted from patch/forests (Victor Zakharov / Patch, MIT).
export function grass(ctx: MaterialContext, name: string, o: GrassOptions = {}) {
  const backlight = o.backlight ?? 0
  const hasBacklight = backlight > 0
  const u: Record<string, { value: unknown }> = {
    gBase: { value: new THREE.Color(o.base || "#1b2d18") },
    gTip: { value: new THREE.Color(o.tip || "#5c8040") },
    ...(hasBacklight ? { uGrassBacklight: { value: backlight } } : {}),
  }
  const m = new THREE.MeshStandardMaterial({ name, color: "#ffffff", roughness: o.roughness ?? 0.95, metalness: 0, side: THREE.DoubleSide })
  m.userData.noShadow = true
  m.userData.uniforms = u
  return stageMaterial(m, ctx.shared, hasBacklight ? "grass-lit" : "grass", (s) => {
    Object.assign(s.uniforms, u)
    s.uniforms.uTime = ctx.shared.time
    s.uniforms.uWind = ctx.shared.wind
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime, uWind; varying vec2 vGUv; varying float vGDist;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vGUv = uv;
{ vec4 gp = vec4(position, 1.0);
#ifdef USE_BATCHING
 gp = batchingMatrix * gp;
#endif
#ifdef USE_INSTANCING
 gp = instanceMatrix * gp;
#endif
 vGDist = -(modelViewMatrix * gp).z; }
// Far off, a blade's tip is thinner than a pixel, and its sway makes it flicker in and out. So it sways less there.
float gSw = uv.y * uv.y * mix(1.0, .25, smoothstep(6.0, 20.0, vGDist));
float gPh = position.x * .35 + position.z * .27;
transformed.x += (sin(uTime * 1.3 + gPh) * .6 + sin(uTime * 2.9 + gPh * 2.3) * .25) * gSw * uWind * .08;
transformed.z += sin(uTime * 1.1 + gPh * 1.7) * gSw * uWind * .05;`
    )
    if (hasBacklight) s.uniforms.uSun = ctx.shared.sun
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        hasBacklight
          ? "#include <common>\nuniform vec3 gBase, gTip, uSun; uniform float uGrassBacklight; varying vec2 vGUv; varying float vGDist;"
          : "#include <common>\nuniform vec3 gBase, gTip; varying vec2 vGUv; varying float vGDist;"
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 gC = mix(gBase, gTip * (.78 + .44 * vGUv.x), smoothstep(0.0, .55, vGUv.y));
// With distance the pale tips settle toward one even shade, so subpixel blades stop sparkling against the ground.
gC = mix(gC, mix(gBase, gTip, .3), smoothstep(5.0, 18.0, vGDist) * .8);
diffuseColor.rgb *= gC;`
      )
    if (hasBacklight) {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
 { vec3 sunV = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
   float back = pow(max(dot(normalize(vViewPosition), -sunV), 0.0), 3.0);
   float tip = smoothstep(0.2, 1.0, vGUv.y);
   float fade = 1.0 - smoothstep(10.0, 28.0, vGDist);
   totalEmissiveRadiance += diffuseColor.rgb * vec3(1.05, 1.15, 0.6) * directionalLights[0].color * back * tip * fade * uGrassBacklight; }
#endif`
      )
    }
  })
}

export interface WaterOptions {
  color?: string
  reflect?: number
  ripple?: number
  flow?: [number, number]
  mirror?: number
}

// Running water: a near-mirror that reflects the sky (and so the moon), roughened by ripples that drift downstream.
// `reflect` boosts the sky reflection over the scene's own environment strength. `flow` is the downstream direction.
export function water(ctx: MaterialContext, name: string, o: WaterOptions = {}) {
  const f = o.flow ?? [0, 1]
  const len = Math.hypot(f[0], f[1]) || 1
  const u = {
    wReflect: { value: o.reflect ?? 3 },
    wRipple: { value: o.ripple ?? 1 },
    wFlow: { value: new THREE.Vector2(f[0] / len, f[1] / len) },
    wMirror: { value: o.mirror ?? 0 },
  }
  const m = new THREE.MeshStandardMaterial({ name, color: o.color || "#081218", roughness: 0.07, metalness: 0 })
  m.userData.noShadow = true
  m.userData.uniforms = u
  // The stage draws a planar reflection for water that asks for one (render/mirror.ts).
  if (o.mirror) {
    m.userData.mirror = true
    m.defines = { WMIRROR: "" }
  }
  return stageMaterial(m, ctx.shared, o.mirror ? "watermirror" : "water", (s) => {
    Object.assign(s.uniforms, u)
    s.uniforms.uTime = ctx.shared.time
    s.uniforms.tReflect = ctx.shared.reflectMap
    s.uniforms.uReflectMatrix = ctx.shared.reflectMatrix
    s.uniforms.uMirrorOn = ctx.shared.mirrorOn
    WORLD_VERTEX(s)
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vNWorld; varying vec3 vNNormalW;
uniform float wReflect, wRipple, uTime; uniform vec2 wFlow;
#ifdef WMIRROR
uniform sampler2D tReflect; uniform mat4 uReflectMatrix; uniform float uMirrorOn, wMirror;
#endif
${NOISE}
float wH(vec2 p){
 vec2 a = vec2(wFlow.y, -wFlow.x);
 vec2 q = vec2(dot(p, a), dot(p, wFlow));
 return mfbm(q * vec2(.9, .35) - vec2(0.0, uTime * .5)) * .6 + mnoise(q * vec2(3.0, 1.2) - vec2(uTime * .1, uTime * 1.1)) * .3 + mnoise(q * vec2(9.0, 4.0) - vec2(0.0, uTime * 2.0)) * .1;
}`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{ vec2 p = vNWorld.xz; float e = .06, h0 = wH(p);
 float fade = 1.0 - smoothstep(30.0, 140.0, length(vNWorld - cameraPosition));
 vec2 g = vec2(wH(p + vec2(e, 0.0)) - h0, wH(p + vec2(0.0, e)) - h0) / e * .22 * wRipple * (.25 + .75 * fade);
 vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
 normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }`
      )
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
radiance *= wReflect;
#endif
#if defined( WMIRROR ) && defined( RE_IndirectSpecular )
if (uMirrorOn > .5) {
 // The ripples smear the reflection mostly up and down the screen, into the long streaks of lit windows on water.
 vec3 nWr = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
 vec4 rc = uReflectMatrix * vec4(vNWorld, 1.0);
 rc.x += nWr.x * .03 * rc.w;
 rc.y += nWr.z * .12 * rc.w;
 vec3 planar = textureProj(tReflect, rc).rgb;
 radiance = mix(radiance, planar * wReflect, wMirror);
}
#endif`
      )
  })
}
