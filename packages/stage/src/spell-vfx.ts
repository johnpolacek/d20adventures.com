/**
 * Procedural GPU spell VFX primitives for Stageview.
 *
 * Adapted from two MIT-licensed Three.js projects (code & shaders only; zero external assets):
 * - Ultra Elements / Patch Elements (https://git.patch.gg/patch/elements, https://github.com/Humpalumps/ultra-elements)
 *   Copyright (c) 2026 Patch; Copyright (c) 2026 Humpalumps (MIT License)
 *   Techniques: midpoint-displacement GPU lightning strips (Bolts.js), procedural SDF rune sigils (Sigils.js),
 *   exact-chord shockwave shells (Shockwaves.js), plasma knots/bursts (arcane.js), phone-wire AA strips (Ribbons.js),
 *   and velocity-stretched sparks & faceted crystal shards (Particles.js).
 * - Small Magic (https://git.patch.gg/blendi/small-magic)
 *   Copyright (c) 2026 Patch (MIT License)
 *   Techniques: scrolling dual-stream camera-facing spell ribbons (beam.js), premultiplied fire/smoke/mote/leaf
 *   billboard shaders (fx.js, flames.js), and ground cast rings.
 * - Hash without Sine (https://www.shadertoy.com/view/4djSRW)
 *   Copyright (c) 2014 David Hoskins (MIT License).
 *
 * Constraints:
 * - Zero FloatType render targets or extra FBO passes (WebGL2 + Safari/WebKit Metal safe).
 * - All shader timers are driven exclusively by the `dt` accumulated in `Effects.update(dt)` (hit-stop safe).
 * - Shared shader source strings + warmup meshes ensure zero shader recompiles on spell casts.
 */

import * as THREE from "three"
import type { Element } from "./effects"
import type { TierName } from "./quality"

export interface ElementPalette {
  core: THREE.Color
  primary: THREE.Color
  secondary: THREE.Color
  dark: THREE.Color
  light: string
  sigilStyle: number // 0 holy, 1 arcane, 2 void, 3 fire scorch, 4 frost, 5 lightning, 6 nature
  occlude: number // 0 pure glow, >0 premultiplied dark/body occlusion (fire/shadow)
}

const C = (hex: string) => new THREE.Color(hex)

export const ELEMENT_PALETTES: Record<Element, ElementPalette> = {
  fire: {
    core: C("#fff4cc"),
    primary: C("#ff7a1f"),
    secondary: C("#d92b04"),
    dark: C("#1c1412"),
    light: "#ff7a2e",
    sigilStyle: 3,
    occlude: 0.45,
  },
  frost: {
    core: C("#f2fbff"),
    primary: C("#7ad8ff"),
    secondary: C("#2a80d8"),
    dark: C("#bfe6ff"),
    light: "#8fd4ff",
    sigilStyle: 4,
    occlude: 0,
  },
  lightning: {
    core: C("#f4f8ff"),
    primary: C("#8bb8ff"),
    secondary: C("#4a5eff"),
    dark: C("#1d2438"),
    light: "#cce0ff",
    sigilStyle: 5,
    occlude: 0,
  },
  radiant: {
    core: C("#fffdf0"),
    primary: C("#ffd56b"),
    secondary: C("#ff9e2c"),
    dark: C("#fff2c2"),
    light: "#ffe08a",
    sigilStyle: 0,
    occlude: 0,
  },
  nature: {
    core: C("#f5ffd4"),
    primary: C("#7ae058"),
    secondary: C("#2fa34a"),
    dark: C("#3b6e2c"),
    light: "#8fdc6a",
    sigilStyle: 6,
    occlude: 0,
  },
  shadow: {
    core: C("#e8c8ff"),
    primary: C("#8b3dff"),
    secondary: C("#3d1278"),
    dark: C("#07030d"),
    light: "#8a5cc8",
    sigilStyle: 2,
    occlude: 0.92,
  },
  arcane: {
    core: C("#ffe8fc"),
    primary: C("#c266ff"),
    secondary: C("#ff4fd8"),
    dark: C("#261242"),
    light: "#b98cff",
    sigilStyle: 1,
    occlude: 0,
  },
}

export function paletteOf(element?: Element, fallback: Element = "arcane"): ElementPalette {
  return ELEMENT_PALETTES[element ?? fallback]
}

export interface TierBudget {
  particles: number
  branches: number
  subBranches: number
  shards: number
}

const TIER_BUDGET: Record<TierName, TierBudget> = {
  mobile: { particles: 0.42, branches: 3, subBranches: 2, shards: 0.5 },
  balanced: { particles: 0.68, branches: 4, subBranches: 4, shards: 0.72 },
  high: { particles: 1.0, branches: 6, subBranches: 6, shards: 1.0 },
  ultra: { particles: 1.35, branches: 8, subBranches: 8, shards: 1.25 },
}

export function tierBudget(tier: TierName): TierBudget {
  return TIER_BUDGET[tier] ?? TIER_BUDGET.high
}

export function scaleCount(base: number, tier: TierName, min = 4): number {
  return Math.max(min, Math.round(base * tierBudget(tier).particles))
}

// Premultiplied blending: src * 1 + dst * (1 - srcA).
// - alpha == 0 behaves as pure additive glow (sparks, sigils, lightning, stars).
// - alpha > 0 blends opaque/smoky/shadow body AND can simultaneously emit HDR light (fire flames, dark mist, scorch).
const PREMUL_BLENDING: THREE.ShaderMaterialParameters = {
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendEquationAlpha: THREE.AddEquation,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
}

// ── Shared GLSL helpers ───────────────────────────────────────────────────────────────────────────────────────────────

const COMMON_GLSL = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#endif
// Hash without Sine (Dave Hoskins, MIT)
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec4 hash41(float p) { vec4 p4 = fract(vec4(p) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

float vNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
// Piecewise-linear 1D lattice noise (-1..1) for midpoint-displacement lightning
float lNoise(float x, float salt) {
  float i = floor(x);
  return mix(hash11(i + salt), hash11(i + 1.0 + salt), x - i) * 2.0 - 1.0;
}
vec3 perpVec(vec3 t) {
  return normalize(cross(t, abs(t.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
}
mat3 basisFrom(vec3 n) {
  vec3 t = perpVec(n);
  return mat3(t, cross(t, n), n);
}
vec3 stripSide(vec3 p, vec3 tangent) {
  vec3 s = cross(tangent, p - cameraPosition);
  float l = length(s);
  return l > 1e-6 ? s / l : vec3(1.0, 0.0, 0.0);
}
// Humus phone-wire AA: clamps ribbon width to >= 1.5 px and preserves energy in aa.
float wireHalfWidth(float width, float viewZ, float viewportH, out float aa) {
  float pxPerM = 0.5 * viewportH * projectionMatrix[1][1];
  float px = width * pxPerM / max(viewZ, 0.05);
  float clamped = max(px, 1.5);
  aa = px / clamped;
  return 0.5 * width * clamped / max(px, 1e-6);
}
// Artist fire ramp (blendi/small-magic flames.js): deep red -> orange -> gold -> incandescent white
vec3 fireRamp(float hot) {
  vec3 c = mix(vec3(0.55, 0.03, 0.0), vec3(1.0, 0.26, 0.02), smoothstep(0.0, 0.34, hot));
  c = mix(c, vec3(1.0, 0.64, 0.12), smoothstep(0.3, 0.65, hot));
  c = mix(c, vec3(1.0, 0.94, 0.7), smoothstep(0.65, 0.98, hot));
  return c * (1.0 + 1.45 * hot * hot);
}
`

// ── 1. GPU Procedural Lightning Bolt (adapted from patch/elements Bolts.js) ───────────────────────────────────────────

const BOLT_MAIN_SEGS = 48
const BOLT_BRANCH_SEGS = 14
const BOLT_SUB_SEGS = 8
const BOLT_MAX_BRANCHES = 8
const BOLT_MAX_SUBS = 8

let sharedBoltGeo: THREE.BufferGeometry | null = null
function boltGeometry(): THREE.BufferGeometry {
  if (sharedBoltGeo) return sharedBoltGeo
  const pos: number[] = []
  const index: number[] = []
  let strand = 0
  const addStrand = (segs: number) => {
    const base = pos.length / 3
    for (let i = 0; i <= segs; i++) pos.push(i / segs, -1, strand, i / segs, 1, strand)
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    strand++
  }
  addStrand(BOLT_MAIN_SEGS)
  for (let i = 0; i < BOLT_MAX_BRANCHES; i++) addStrand(BOLT_BRANCH_SEGS)
  for (let i = 0; i < BOLT_MAX_SUBS; i++) addStrand(BOLT_SUB_SEGS)
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(index)
  sharedBoltGeo = g
  return g
}

const BOLT_VERT =
  COMMON_GLSL +
  /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec4 uShape;   // x: branches, y: subBranches, z: jag, w: coreWidth
uniform vec4 uState;   // x: reveal, y: seed, z: branchSeed, w: residual
uniform vec4 uStyle;   // x: intensity, y: viewportH, z: rough, w: branchLevel
varying vec2 vUv;
varying float vS;
varying float vPower;
varying float vStrand;

vec3 boltPath(vec3 A, vec3 B, float t, float seed, float jag, float freq, int octaves, float freeEnd, float gain) {
  vec3 d = B - A;
  float L = length(d);
  vec3 T = d / max(L, 1e-5);
  vec3 Ub = perpVec(T);
  vec3 Vb = cross(T, Ub);
  float n1 = 0.0, n2 = 0.0, amp = 1.0, f = freq;
  for (int k = 0; k < 6; k++) {
    if (k >= octaves) break;
    float salt = seed * 17.31 + float(k) * 53.7;
    n1 += amp * lNoise(t * f, salt);
    n2 += amp * lNoise(t * f, salt + 191.3);
    amp *= gain;
    f *= 2.0;
  }
  float env = sqrt(max(sin(PI * t * (1.0 - 0.5 * freeEnd)), 0.0));
  return mix(A, B, t) + (Ub * n1 + Vb * n2) * (L * jag * env);
}

vec3 deviate(vec3 T, float h) {
  float th = radians(mix(24.0, 52.0, hash11(h + 1.3)));
  float ph = 2.0 * PI * hash11(h + 7.9);
  vec3 Ub = perpVec(T);
  vec3 Vb = cross(T, Ub);
  return cos(th) * T + sin(th) * (cos(ph) * Ub + sin(ph) * Vb);
}

void main() {
  vUv = vec2(0.0);
  vS = 0.0;
  vPower = 0.0;
  vStrand = position.z;
  int strand = int(position.z + 0.5);
  int nb = int(uShape.x + 0.5);
  int ns = int(uShape.y + 0.5);
  float reveal = uState.x;
  float seed = uState.y;
  float bseed = uState.z;
  float res = uState.w;
  float jag = uShape.z;
  float gain = uStyle.z;
  float L = length(uB - uA);
  if (L < 1e-4 || reveal <= 0.0 || uStyle.x <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 sA = uA, sB = uB;
  float sSeed = seed, freq = 2.5, freeEnd = 0.0, vis = reveal;
  float wMul = 1.0, iMul = 1.0, sJag = jag, len = L;
  int oct = 5;

  if (strand > 0) {
    bool isSub = strand > ${BOLT_MAX_BRANCHES};
    int bi = isSub ? int(mod(float(strand - ${BOLT_MAX_BRANCHES + 1}), float(max(nb, 1)))) : strand - 1;
    if (isSub ? (strand - ${BOLT_MAX_BRANCHES + 1} >= ns || nb == 0) : bi >= nb) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float bh = bseed * 13.7 + float(bi) * 29.1;
    float tb = mix(0.08, 0.78, hash11(bh));
    sA = boltPath(uA, uB, tb, seed, jag, freq, oct, 0.0, gain);
    vec3 Tm = normalize(boltPath(uA, uB, min(tb + 0.06, 1.0), seed, jag, freq, oct, 0.0, gain) - sA);
    len = mix(0.16, 0.42, hash11(bh + 3.7)) * L;
    sB = sA + deviate(Tm, bh) * len;
    sSeed = bh + 11.3;
    freq = 2.0;
    oct = 4;
    freeEnd = 1.0;
    sJag = jag * 1.25;
    vis = (reveal - tb) * L / max(len, 0.05);
    wMul = 0.58;
    iMul = 0.5;
    if (isSub) {
      float sh = bseed * 23.1 + float(strand) * 41.7;
      float ts = mix(0.12, 0.7, hash11(sh));
      vec3 q0 = boltPath(sA, sB, ts, sSeed, sJag, freq, oct, 1.0, gain);
      vec3 Tq = normalize(boltPath(sA, sB, min(ts + 0.12, 1.0), sSeed, sJag, freq, oct, 1.0, gain) - q0);
      float len2 = mix(0.3, 0.58, hash11(sh + 5.1)) * len;
      vis = (vis - ts) * len / max(len2, 0.04);
      sA = q0;
      sB = q0 + deviate(Tq, sh) * len2;
      len = len2;
      sSeed = sh + 17.9;
      freq = 1.6;
      oct = 3;
      wMul = 0.36;
      iMul = 0.3;
    }
    float t = position.x;
    wMul *= (1.0 - 0.58 * t) * (0.6 + 0.4 * uStyle.w);
    iMul *= (1.0 - 0.65 * t) * uStyle.w * (1.0 - res) * (1.0 - res);
  }

  if (vis <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float t = position.x;
  float tt = min(t, vis);
  float stepH = strand == 0 ? 0.045 : 0.09;
  vec3 p = boltPath(sA, sB, tt, sSeed, sJag, freq, oct, freeEnd, gain);
  vec3 pP = boltPath(sA, sB, max(tt - stepH, 0.0), sSeed, sJag, freq, oct, freeEnd, gain);
  vec3 pN = boltPath(sA, sB, min(tt + stepH, 1.0), sSeed, sJag, freq, oct, freeEnd, gain);

  // Leader tip burns brighter while advancing
  if (vis < 1.0) iMul *= 1.0 + 2.5 * exp(-(vis - tt) * len / 0.25);

  float x = t * len;
  // Natural brightness knots along the channel
  float knot = exp(0.45 * lNoise(x * 1.2, sSeed + 71.0) + 0.25 * lNoise(x * 3.8, sSeed + 137.0));
  iMul *= knot;
  float wVar = 1.0 + 0.3 * lNoise(x * 1.4, sSeed + 211.0);
  // Cooling residual breakup into incandescent beads
  if (res > 0.0) {
    float beads = 0.5 + 0.35 * lNoise(x * 1.8, sSeed + 313.0) + 0.15 * lNoise(x * 5.2, sSeed + 419.0);
    iMul *= smoothstep(res * 1.15 - 0.28, res * 1.15 + 0.08, beads);
    wVar *= 1.0 + 0.9 * res;
  }

  vec3 Ts = pN - pP;
  float viewZ = max(-(viewMatrix * vec4(p, 1.0)).z, 0.05);
  vec3 side = stripSide(p, Ts);
  float aa;
  // Ribbon carries both hot filament core (center ~20%) and wide glow sheath (outer ~80%)
  float hw = min(wireHalfWidth(uShape.w * 4.8 * wMul * wVar, viewZ, uStyle.y, aa), 0.09 * viewZ);
  vUv = vec2(t, position.y);
  vS = x;
  vPower = uStyle.x * iMul * aa * smoothstep(0.0, 0.03, min(t, min(vis, 1.0) - t + 0.02));
  gl_Position = projectionMatrix * viewMatrix * vec4(p + side * position.y * hw, 1.0);
}
`

const BOLT_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
varying vec2 vUv;
varying float vS;
varying float vPower;
varying float vStrand;

void main() {
  if (vPower <= 0.002) discard;
  float y = vUv.y;
  float r2 = y * y;
  float env = max(1.0 - r2, 0.0);
  // Twisting hot filament inside a softer body inside a saturated plasma sheath (Bolts.js)
  float off = y - 0.08 * sin(vS * 11.0 + 2.1 * sin(vS * 4.3));
  float filament = exp(-off * off * 95.0);
  float body = exp(-r2 * 18.0);
  float halo = (exp(-r2 * 3.4) - 0.033) * env;
  vec3 col = (uCore * (filament * 2.2 + body * 0.85) + uGlow * (body * 0.8 + max(halo, 0.0) * 1.1)) * vPower;
  gl_FragColor = vec4(col, 0.0);
}
`

export interface LightningBoltHandle {
  mesh: THREE.Mesh
  set(opts: {
    a: THREE.Vector3
    b: THREE.Vector3
    reveal?: number
    intensity?: number
    width?: number
    jag?: number
    seed?: number
    branchSeed?: number
    residual?: number
    branchLevel?: number
    viewportH?: number
  }): void
  dispose(): void
}

export function createLightningBolt(
  palette: ElementPalette,
  { branches = 6, subBranches = 6, rough = 0.58 }: { branches?: number; subBranches?: number; rough?: number } = {}
): LightningBoltHandle {
  const uniforms = {
    uA: { value: new THREE.Vector3() },
    uB: { value: new THREE.Vector3(0, 1, 0) },
    uShape: { value: new THREE.Vector4(branches, subBranches, 0.11, 0.032) },
    uState: { value: new THREE.Vector4(1, 1, 1, 0) },
    uStyle: { value: new THREE.Vector4(1, 900, rough, 0.85) },
    uCore: { value: palette.core.clone() },
    uGlow: { value: palette.primary.clone().lerp(palette.secondary, 0.35) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BOLT_VERT,
    fragmentShader: BOLT_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-bolt"
  const mesh = new THREE.Mesh(boltGeometry(), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  return {
    mesh,
    set(o) {
      uniforms.uA.value.copy(o.a)
      uniforms.uB.value.copy(o.b)
      if (o.reveal !== undefined) uniforms.uState.value.x = o.reveal
      if (o.seed !== undefined) uniforms.uState.value.y = o.seed
      if (o.branchSeed !== undefined) uniforms.uState.value.z = o.branchSeed
      if (o.residual !== undefined) uniforms.uState.value.w = o.residual
      if (o.jag !== undefined) uniforms.uShape.value.z = o.jag
      if (o.width !== undefined) uniforms.uShape.value.w = o.width
      if (o.intensity !== undefined) uniforms.uStyle.value.x = o.intensity
      if (o.viewportH !== undefined) uniforms.uStyle.value.y = o.viewportH
      if (o.branchLevel !== undefined) uniforms.uStyle.value.w = o.branchLevel
    },
    dispose() {
      mat.dispose()
    },
  }
}

// ── 2. Dual-Stream Spell Ribbon + Optional Helical Threads (small-magic beam.js + ultra-elements light.js) ────────────

const RIBBON_SEGS = 36
let sharedRibbonGeo: THREE.BufferGeometry | null = null
let sharedRibbonHelixGeo: THREE.BufferGeometry | null = null

function ribbonGeometry(withHelix: boolean): THREE.BufferGeometry {
  if (!withHelix && sharedRibbonGeo) return sharedRibbonGeo
  if (withHelix && sharedRibbonHelixGeo) return sharedRibbonHelixGeo
  const pos: number[] = []
  const index: number[] = []
  const layers = withHelix ? [0, 1, 2] : [0]
  for (const layer of layers) {
    const base = pos.length / 3
    for (let i = 0; i <= RIBBON_SEGS; i++) pos.push(i / RIBBON_SEGS, -1, layer, i / RIBBON_SEGS, 1, layer)
    for (let i = 0; i < RIBBON_SEGS; i++) {
      const a = base + i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(index)
  if (withHelix) sharedRibbonHelixGeo = g
  else sharedRibbonGeo = g
  return g
}

const RIBBON_VERT =
  COMMON_GLSL +
  /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec4 uGeom;    // x: lift, y: wide0, z: wide1, w: waveAmp
uniform vec4 uSpan;    // x: tail 0..1, y: head 0..1, z: time, w: flowSpeed
uniform vec4 uHelix;   // x: radius, y: twist rad/m, z: threadWidth, w: spin rad/s
varying vec2 vUv;
varying float vLen;
varying float vLayer;
varying float vLocalT;

vec3 arcAt(float t) {
  return mix(uA, uB, t) + vec3(0.0, uGeom.x * 4.0 * t * (1.0 - t), 0.0);
}

void main() {
  float u = position.x;
  float layer = position.z;
  float t0 = uSpan.x, t1 = uSpan.y;
  float len = length(uB - uA);
  if (len < 1e-4 || t1 <= t0 + 1e-4) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float tt = mix(t0, t1, u);
  float ttP = mix(t0, t1, max(u - 0.02, 0.0));
  float ttN = mix(t0, t1, min(u + 0.02, 1.0));
  vec3 p = arcAt(tt);
  vec3 tangent = normalize(arcAt(ttN) - arcAt(ttP) + vec3(1e-5, 0.0, 0.0));
  vec3 across = stripSide(p, tangent);

  if (layer < 0.5) {
    float w = mix(uGeom.y, uGeom.z, pow(tt, 0.78));
    float waver = sin(tt * len * 1.8 - uSpan.z * 10.0) * uGeom.w * sin(PI * tt);
    p += across * (position.y * w + waver);
  } else {
    mat3 B = basisFrom(tangent);
    float s = tt * len;
    float signH = layer > 1.5 ? -1.0 : 1.0;
    float ph = s * uHelix.y * signH + layer * PI - uSpan.z * uHelix.w * signH;
    float rr = uHelix.x * sin(PI * u) * (0.75 + 0.25 * sin(s * 2.1 - uSpan.z * 6.0 + layer * 2.0));
    vec3 offset = (B[0] * cos(ph) + B[1] * sin(ph)) * rr;
    p += offset;
    vec3 hAcross = stripSide(p, tangent);
    p += hAcross * (position.y * uHelix.z * (0.55 + 0.45 * sin(PI * u)));
  }

  vUv = vec2(position.y, tt);
  vLen = len;
  vLayer = layer;
  vLocalT = u;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`

const RIBBON_FRAG =
  COMMON_GLSL +
  /* glsl */ `
uniform vec3 uCore;
uniform vec3 uCol1;
uniform vec3 uCol2;
uniform vec3 uDark;
uniform vec4 uSpan;    // x: tail, y: head, z: time, w: flowSpeed
uniform vec4 uLook;    // x: power, y: occlude (0..1), z: turbulence, w: seed
varying vec2 vUv;
varying float vLen;
varying float vLayer;
varying float vLocalT;

void main() {
  if (uLook.x <= 0.003) discard;
  float u = vUv.x;
  float v = vUv.y * vLen;
  float t = uSpan.z;
  float flow = uSpan.w;
  float ends = smoothstep(0.0, 0.06, vLocalT) * (1.0 - smoothstep(0.88, 1.0, vLocalT));

  if (vLayer > 0.5) {
    float prof = exp(-u * u * 6.5);
    float knot = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(v * 2.4 - t * flow * 2.4 + vLayer * 3.1), 2.0);
    vec3 col = mix(uCol1, uCore, prof * 0.7) * prof * knot * ends * uLook.x * 1.45;
    gl_FragColor = vec4(col, 0.0);
    return;
  }

  // Dual intertwined scrolling noise streams (blendi/small-magic beam.js)
  float wind = (vNoise(vec2(v * 0.55 - t * flow * 0.35, 3.1 + uLook.w)) - 0.5) * 2.4 * uLook.z;
  float s1 = vNoise(vec2(u * 3.2 + wind, v * 0.75 - t * flow));
  float s2 = vNoise(vec2(u * 7.2 - wind, v * 1.7 - t * flow * 1.65));
  float r2 = u * u;
  float core = pow(max(1.0 - r2, 0.0), 1.55);
  float hotCore = exp(-r2 * 14.0);
  float body = core * (0.28 + 1.15 * s1 * s1 + 0.55 * s2 * s2 * core);

  vec3 streamCol = mix(uCol2, uCol1, smoothstep(0.22, 0.78, s1));
  if (uLook.y > 0.55) {
    // Shadow/void beam: dark light-absorbing heart with blazing violet sheath
    float rim = exp(-pow(abs(u) - 0.42, 2.0) * 18.0) * (0.65 + 0.6 * s2);
    float darkA = core * ends * uLook.y * clamp(uLook.x, 0.0, 1.0) * 0.85;
    vec3 emit = (streamCol * rim * 1.7 + uCore * pow(rim, 2.2) * 0.9) * ends * uLook.x;
    gl_FragColor = vec4(uDark * darkA + emit, darkA);
    return;
  }

  vec3 col = streamCol * body * 1.15 + uCore * (hotCore * (0.75 + 0.6 * s2)) * 1.35;
  col *= ends * uLook.x;
  float occ = uLook.y * core * ends * clamp(uLook.x, 0.0, 1.0) * 0.45;
  gl_FragColor = vec4(col, occ);
}
`

export interface SpellRibbonHandle {
  mesh: THREE.Mesh
  set(opts: {
    a: THREE.Vector3
    b: THREE.Vector3
    time: number
    power: number
    tail?: number
    head?: number
    wide0?: number
    wide1?: number
    lift?: number
    wave?: number
    flowSpeed?: number
    turbulence?: number
    helixRadius?: number
  }): void
  dispose(): void
}

export function createSpellRibbon(
  palette: ElementPalette,
  { helix = false, seed = 0 }: { helix?: boolean; seed?: number } = {}
): SpellRibbonHandle {
  const uniforms = {
    uA: { value: new THREE.Vector3() },
    uB: { value: new THREE.Vector3(0, 1, 0) },
    uGeom: { value: new THREE.Vector4(0, 0.05, 0.24, 0.03) },
    uSpan: { value: new THREE.Vector4(0, 1, 0, 9.5) },
    uHelix: { value: new THREE.Vector4(0.14, 2.2, 0.022, 4.5) },
    uCore: { value: palette.core.clone() },
    uCol1: { value: palette.primary.clone() },
    uCol2: { value: palette.secondary.clone() },
    uDark: { value: palette.dark.clone() },
    uLook: { value: new THREE.Vector4(1, palette.occlude, 1, seed) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-ribbon"
  const mesh = new THREE.Mesh(ribbonGeometry(helix), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 9
  return {
    mesh,
    set(o) {
      uniforms.uA.value.copy(o.a)
      uniforms.uB.value.copy(o.b)
      uniforms.uSpan.value.set(o.tail ?? 0, o.head ?? 1, o.time, o.flowSpeed ?? 9.5)
      uniforms.uLook.value.x = o.power
      if (o.turbulence !== undefined) uniforms.uLook.value.z = o.turbulence
      if (o.lift !== undefined) uniforms.uGeom.value.x = o.lift
      if (o.wide0 !== undefined) uniforms.uGeom.value.y = o.wide0
      if (o.wide1 !== undefined) uniforms.uGeom.value.z = o.wide1
      if (o.wave !== undefined) uniforms.uGeom.value.w = o.wave
      if (o.helixRadius !== undefined) uniforms.uHelix.value.x = o.helixRadius
    },
    dispose() {
      mat.dispose()
    },
  }
}

// ── 3. GPU Vertex-Animated Instanced Particle Cloud (ultra-elements Particles.js + small-magic fx.js) ─────────────────

// Particle kinds:
// 0 = flame tongue (premultiplied fireCol)
// 1 = velocity-stretched spark / ember (additive capsule + phone-wire AA)
// 2 = 4-point star mote / glint (additive twinkling star)
// 3 = glowing wisp / orb (additive soft halo)
// 4 = volumetric noise-eroded puff (premultiplied mist/smoke/shadow/spore)
// 5 = tumbling leaf / petal (premultiplied pointed silhouette)
export type ParticleKind = 0 | 1 | 2 | 3 | 4 | 5

export interface ParticleSeed {
  x: number
  y: number
  z: number
  birth: number
  vx: number
  vy: number
  vz: number
  life: number
  size0: number
  size1: number
  rot?: number
  spin?: number // or stretch seconds for kind 1
  kind: ParticleKind
  seed?: number
  swirlR?: number
  swirlW?: number
}

const PARTICLE_VERT =
  COMMON_GLSL +
  /* glsl */ `
attribute vec4 aOrigin; // xyz, birthTime
attribute vec4 aVel;    // vx, vy, vz, lifeDuration
attribute vec4 aSize;   // size0, size1, rot0, spinOrStretch
attribute vec4 aMisc;   // kind, seed, swirlRadius, swirlSpeed

uniform float uTime;
uniform vec3 uAnchor;
uniform vec4 uPhysics;  // x: gravity, y: drag, z: curlAmp, w: viewportH
uniform float uGlobalAlpha;

varying vec2 vUv;
varying vec4 vInfo;     // x: u (0..1), y: seed, z: kind, w: alphaMul
varying float vSoft;

void main() {
  vUv = vec2(0.0);
  vInfo = vec4(0.0);
  vSoft = 0.0;
  float age = uTime - aOrigin.w;
  float life = aVel.w;
  if (age < 0.0 || age >= life || life <= 1e-4 || uGlobalAlpha <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = clamp(age / life, 0.0, 1.0);
  float kind = aMisc.x;
  float seed = aMisc.y;
  float drag = uPhysics.y;
  float grav = uPhysics.x;
  float curlAmp = uPhysics.z;

  float kDrag = drag > 0.01 ? exp(-drag * age) : 1.0;
  float intDrag = drag > 0.01 ? (1.0 - kDrag) / drag : age;

  vec3 pos = uAnchor + aOrigin.xyz + aVel.xyz * intDrag;
  pos.y -= 0.5 * grav * age * age;

  // Optional orbital swirl around anchor (for auras, sparkles, whirlwinds)
  float swirlR = aMisc.z;
  float swirlW = aMisc.w;
  if (abs(swirlR) > 1e-4) {
    float ang = seed * 6.283185 + age * swirlW;
    float r = swirlR * (1.0 + 0.15 * sin(age * 2.5 + seed * 11.0));
    pos.x += cos(ang) * r;
    pos.z += sin(ang) * r;
  }

  // Analytic curl-like drift
  if (curlAmp > 1e-4) {
    float ph = seed * 43.0 + age * 2.2;
    pos += vec3(sin(ph + pos.y * 1.3), 0.4 * cos(ph * 0.8), cos(ph * 1.13 + pos.x * 1.2)) * (curlAmp * age * (1.0 - 0.35 * u));
  }

  // Clamp above ground for falling sparks/debris
  if (pos.y < 0.03 && grav > 0.5) pos.y = 0.03;

  float size = mix(aSize.x, aSize.y, u);
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  float viewZ = -mv.z;
  if (viewZ < 0.08) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float alphaMul = uGlobalAlpha * smoothstep(0.12, 0.55, viewZ);

  if (kind > 0.5 && kind < 1.5) {
    // Velocity-stretched spark / ember (ultra-elements Particles.js GLOW_VERT)
    vec3 velNow = aVel.xyz * kDrag;
    velNow.y -= grav * age;
    if (abs(swirlR) > 1e-4) {
      float ang = seed * 6.283185 + age * swirlW;
      velNow.x += -sin(ang) * swirlR * swirlW;
      velNow.z += cos(ang) * swirlR * swirlW;
    }
    float stretch = max(aSize.w, 0.015);
    vec3 tailV = (viewMatrix * vec4(pos - velNow * stretch, 1.0)).xyz;
    float pxWorld = 2.0 * viewZ / (projectionMatrix[1][1] * max(uPhysics.w, 200.0));
    float w = max(size, 1.4 * pxWorld);
    float aa = size / w;
    vec2 axis = tailV.xy - mv.xy;
    float len = min(length(axis), size * 14.0);
    vec2 dir = len > 1e-4 ? axis / max(length(axis), 1e-4) : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 off = dir * (position.x < 0.0 ? -w : len + w) + perp * position.y * w;
    gl_Position = projectionMatrix * vec4(mv.xyz + vec3(off, 0.0), 1.0);
    vUv = vec2(position.x < 0.0 ? -1.0 : 1.0, position.y);
    vSoft = len / max(len + 2.0 * w, 1e-5);
    // Motion-blur energy conservation + ember flicker
    float flicker = 0.72 + 0.28 * sin(seed * 91.0 + age * mix(14.0, 29.0, fract(seed * 13.7)));
    alphaMul *= aa * (2.0 * w / max(len + 2.0 * w, 1e-5)) * flicker;
  } else {
    float rot = aSize.z + aSize.w * age;
    float cs = cos(rot), sn = sin(rot);
    vec2 q = vec2(cs * position.x - sn * position.y, sn * position.x + cs * position.y);
    // Flame tongues are slightly taller than wide
    vec2 aspect = kind < 0.5 ? vec2(0.75, 1.25) : vec2(1.0);
    mv.xy += q * size * aspect;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy;
  }

  vInfo = vec4(u, seed, kind, alphaMul);
}
`

const PARTICLE_FRAG =
  COMMON_GLSL +
  /* glsl */ `
uniform vec3 uColCore;
uniform vec3 uColMid;
uniform vec3 uColDark;
uniform vec4 uTone; // x: emissiveGain, y: useFireRamp (0/1), z: puffOpacity, w: smokeDarken

varying vec2 vUv;
varying vec4 vInfo;
varying float vSoft;

void main() {
  float u = vInfo.x;
  float seed = vInfo.y;
  float kind = vInfo.z;
  float gain = vInfo.w;
  if (gain <= 0.002) discard;

  if (kind < 0.5) {
    // 0: Flame tongue (blendi/small-magic fx.js)
    float n = vNoise(vUv * 2.2 + seed * 31.0 + vec2(0.0, -u * 2.4)) * 0.62
            + vNoise(vUv * 4.8 - seed * 13.0 + vec2(0.0, -u * 3.8)) * 0.38;
    float d = 1.0 - length(vUv * vec2(1.0 + 0.55 * max(vUv.y, 0.0), 1.0)) - (n - 0.32) * (0.55 + 0.8 * u) - u * 0.48;
    float a = smoothstep(0.0, 0.14, d) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.65, 1.0, u)) * gain;
    if (a < 0.004) discard;
    float hot = clamp(d * 1.2 * (1.0 - 0.5 * u), 0.0, 1.0);
    vec3 col = uTone.y > 0.5 ? fireRamp(hot) : mix(uColMid, uColCore, smoothstep(0.15, 0.85, hot)) * (1.0 + 0.9 * hot);
    gl_FragColor = vec4(col * a * uTone.x, min(a * 0.72, 0.95));
    return;
  }

  if (kind < 1.5) {
    // 1: Velocity-stretched capsule spark / ember (ultra-elements Particles.js)
    float x = vUv.x * 0.5 + 0.5;
    float ends = 1.0 - vSoft;
    float dx = x < ends * 0.5
      ? (ends * 0.5 - x) / max(ends * 0.5, 1e-3)
      : x > 1.0 - ends * 0.5
        ? (x - 1.0 + ends * 0.5) / max(ends * 0.5, 1e-3)
        : 0.0;
    float d2 = dx * dx + vUv.y * vUv.y;
    if (d2 >= 1.0) discard;
    float core = exp(-d2 * 4.5);
    float fade = smoothstep(0.0, 0.07, u) * (1.0 - u * u);
    float tail = mix(1.0, 0.3, x);
    vec3 col = mix(uColCore, uColMid, clamp(u * 0.85 + x * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col * core * tail * fade * gain * uTone.x, 0.0);
    return;
  }

  float r = length(vUv);
  if (r >= 1.0) discard;

  if (kind < 2.5) {
    // 2: 4-point star mote / crystal glint (blendi/small-magic fx.js)
    float core = pow(max(1.0 - r, 0.0), 3.0);
    float crossArm = max(
      max(1.0 - abs(vUv.x) * 7.0 - abs(vUv.y), 0.0),
      max(1.0 - abs(vUv.y) * 7.0 - abs(vUv.x), 0.0)
    );
    float star = core + 0.78 * crossArm * crossArm;
    float twinkle = 0.65 + 0.35 * sin(u * 18.0 + seed * 47.0);
    float fade = sin(PI * u);
    vec3 col = mix(uColMid, uColCore, clamp(core * 1.6, 0.0, 1.0));
    gl_FragColor = vec4(col * star * twinkle * fade * gain * uTone.x, 0.0);
    return;
  }

  if (kind < 3.5) {
    // 3: Soft glowing wisp / orb
    float core = exp(-r * r * 14.0);
    float halo = exp(-r * r * 3.5) * (1.0 - r * r);
    float fade = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.55, 1.0, u));
    vec3 col = (uColCore * core * 1.4 + uColMid * halo * 0.9) * fade * gain * uTone.x;
    gl_FragColor = vec4(col, 0.0);
    return;
  }

  if (kind < 4.5) {
    // 4: Noise-eroded volumetric puff (smoke, frost fog, shadow mist, spores)
    float n = vNoise(vUv * 1.85 + seed * 19.0 + vec2(0.0, -u * 0.85)) * 0.62
            + vNoise(vUv * 4.2 + seed * 7.0 + vec2(u * 0.3, -u * 1.3)) * 0.38;
    float edge = 1.0 - smoothstep(0.28 - 0.22 * u, 1.0, r + (n - 0.5) * (0.65 + 0.55 * u));
    float fade = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.42, 1.0, u));
    float a = edge * fade * uTone.z * gain;
    if (a < 0.004) discard;
    float topLit = 0.55 + 0.45 * smoothstep(-0.65, 0.75, vUv.y + (n - 0.5) * 0.7);
    vec3 baseCol = mix(uColDark, uColMid, uTone.w > 0.5 ? (1.0 - edge) * 0.55 : topLit * 0.55);
    vec3 col = baseCol * topLit;
    // Subtle internal rim glow for shadow / arcane / frost mist
    float rim = edge * (1.0 - edge) * 3.0 * (1.0 - u * 0.5);
    col += uColMid * rim * 0.22 * uTone.x;
    gl_FragColor = vec4(col * a, a);
    return;
  }

  // 5: Tumbling leaf / petal (blendi/small-magic fx.js)
  float flip = 0.24 + 0.76 * abs(sin(u * 9.5 + seed * 23.0));
  float leaf = 1.0 - smoothstep(0.54, 0.64, abs(vUv.x) / flip / max(pow(max(1.0 - vUv.y * vUv.y, 0.0), 0.65), 1e-3));
  float a = leaf * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.75, 1.0, u)) * gain;
  if (a < 0.01) discard;
  vec3 col = mix(uColMid, uColCore, 0.25 + 0.55 * flip * (vUv.y * 0.5 + 0.5));
  gl_FragColor = vec4(col * a, a);
}
`

export interface ParticleCloudHandle {
  mesh: THREE.Mesh
  update(time: number, opts?: { anchor?: THREE.Vector3; alpha?: number; viewportH?: number }): void
  dispose(): void
}

export function createParticleCloud(
  seeds: ParticleSeed[],
  palette: ElementPalette,
  {
    gravity = 0,
    drag = 0.8,
    curl = 0.25,
    emissive = 1.6,
    useFireRamp = false,
    puffOpacity = 0.42,
    smokeDarken = false,
    renderOrder = 8,
  }: {
    gravity?: number
    drag?: number
    curl?: number
    emissive?: number
    useFireRamp?: boolean
    puffOpacity?: number
    smokeDarken?: boolean
    renderOrder?: number
  } = {}
): ParticleCloudHandle {
  const n = seeds.length
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  const aOrigin = new Float32Array(n * 4)
  const aVel = new Float32Array(n * 4)
  const aSize = new Float32Array(n * 4)
  const aMisc = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const s = seeds[i]
    const o = i * 4
    aOrigin[o] = s.x
    aOrigin[o + 1] = s.y
    aOrigin[o + 2] = s.z
    aOrigin[o + 3] = s.birth
    aVel[o] = s.vx
    aVel[o + 1] = s.vy
    aVel[o + 2] = s.vz
    aVel[o + 3] = s.life
    aSize[o] = s.size0
    aSize[o + 1] = s.size1
    aSize[o + 2] = s.rot ?? Math.random() * Math.PI * 2
    aSize[o + 3] = s.spin ?? (s.kind === 1 ? 0.032 : (Math.random() - 0.5) * 3)
    aMisc[o] = s.kind
    aMisc[o + 1] = s.seed ?? Math.random()
    aMisc[o + 2] = s.swirlR ?? 0
    aMisc[o + 3] = s.swirlW ?? 0
  }
  geo.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(aOrigin, 4))
  geo.setAttribute("aVel", new THREE.InstancedBufferAttribute(aVel, 4))
  geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(aSize, 4))
  geo.setAttribute("aMisc", new THREE.InstancedBufferAttribute(aMisc, 4))
  geo.instanceCount = n

  const uniforms = {
    uTime: { value: 0 },
    uAnchor: { value: new THREE.Vector3() },
    uPhysics: { value: new THREE.Vector4(gravity, drag, curl, 900) },
    uGlobalAlpha: { value: 1 },
    uColCore: { value: palette.core.clone() },
    uColMid: { value: palette.primary.clone() },
    uColDark: { value: palette.dark.clone() },
    uTone: { value: new THREE.Vector4(emissive, useFireRamp ? 1 : 0, puffOpacity, smokeDarken ? 1 : 0) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-particles"
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = renderOrder
  return {
    mesh,
    update(time, opts) {
      uniforms.uTime.value = time
      if (opts?.anchor) uniforms.uAnchor.value.copy(opts.anchor)
      if (opts?.alpha !== undefined) uniforms.uGlobalAlpha.value = opts.alpha
      if (opts?.viewportH !== undefined) uniforms.uPhysics.value.w = opts.viewportH
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

// ── 4. Procedural SDF Magic Sigils & Elemental Ground Marks (ultra-elements Sigils.js) ────────────────────────────────

let sharedGroundGeo: THREE.BufferGeometry | null = null
function groundQuadGeometry(): THREE.BufferGeometry {
  if (sharedGroundGeo) return sharedGroundGeo
  const g = new THREE.PlaneGeometry(2, 2)
  sharedGroundGeo = g
  return g
}

const GROUND_VERT = /* glsl */ `
varying vec2 vQ;
void main() {
  vQ = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const GROUND_FRAG =
  COMMON_GLSL +
  /* glsl */ `
uniform float uTime;
uniform vec4 uParams;   // x: style (0..6), y: reveal (0..1), z: fade (0..1), w: rot (rad)
uniform vec4 uExtra;    // x: seed, y: intensity, z: heat (cooling 1..0), w: -
uniform vec3 uCore;
uniform vec3 uPrimary;
uniform vec3 uDark;
varying vec2 vQ;

float sgSat(float x) { return clamp(x, 0.0, 1.0); }
float sgSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
float sgCircle(vec2 p, vec2 c, float r) { return abs(length(p - c) - r); }

// 8 futhark-inspired procedural rune SDFs (adapted from ultra-elements Sigils.js)
float sigilGlyph(int id, vec2 p) {
  float d = 1e3;
  if (id == 0) {
    d = min(d, sgSeg(p, vec2(-0.25, -0.85), vec2(-0.25, 0.85)));
    d = min(d, sgSeg(p, vec2(-0.25, 0.15), vec2(0.35, 0.6)));
    d = min(d, sgSeg(p, vec2(-0.25, -0.35), vec2(0.35, 0.1)));
  } else if (id == 1) {
    d = min(d, sgSeg(p, vec2(0.0, -0.85), vec2(0.0, 0.85)));
    d = min(d, sgSeg(p, vec2(0.0, 0.85), vec2(-0.38, 0.42)));
    d = min(d, sgSeg(p, vec2(0.0, 0.85), vec2(0.38, 0.42)));
  } else if (id == 2) {
    d = min(d, sgSeg(p, vec2(0.0, 0.85), vec2(0.38, 0.0)));
    d = min(d, sgSeg(p, vec2(0.38, 0.0), vec2(0.0, -0.85)));
    d = min(d, sgSeg(p, vec2(0.0, -0.85), vec2(-0.38, 0.0)));
    d = min(d, sgSeg(p, vec2(-0.38, 0.0), vec2(0.0, 0.85)));
  } else if (id == 3) {
    d = min(d, sgSeg(p, vec2(0.0, -0.85), vec2(0.0, 0.85)));
    d = min(d, sgCircle(p, vec2(0.0, 0.25), 0.28));
  } else if (id == 4) {
    d = min(d, sgSeg(p, vec2(-0.3, 0.85), vec2(0.3, 0.25)));
    d = min(d, sgSeg(p, vec2(0.3, 0.25), vec2(-0.3, -0.25)));
    d = min(d, sgSeg(p, vec2(-0.3, -0.25), vec2(0.3, -0.85)));
  } else if (id == 5) {
    d = min(d, sgSeg(p, vec2(-0.35, -0.85), vec2(-0.35, 0.85)));
    d = min(d, sgSeg(p, vec2(0.35, -0.85), vec2(0.35, 0.85)));
    d = min(d, sgSeg(p, vec2(-0.35, 0.3), vec2(0.35, -0.3)));
  } else if (id == 6) {
    d = min(d, sgCircle(p, vec2(0.0), 0.4));
    d = min(d, sgSeg(p, vec2(0.0, -0.8), vec2(0.0, 0.8)));
    d = min(d, sgSeg(p, vec2(-0.4, 0.0), vec2(0.4, 0.0)));
  } else {
    d = min(d, sgSeg(p, vec2(0.32, 0.8), vec2(-0.3, 0.0)));
    d = min(d, sgSeg(p, vec2(-0.3, 0.0), vec2(0.32, -0.8)));
    d = min(d, sgSeg(p, vec2(0.0, 0.0), vec2(0.4, 0.0)));
  }
  return d;
}

void sgLine(float d, float w, float k, float px, inout vec3 acc) {
  if (k <= 0.0) return;
  float we = max(w, px * 0.7);
  acc.x = max(acc.x, sgSat((we - d) / px + 0.5) * (w / we) * k);
  acc.y = min(acc.y, d);
  float wc = 0.36 * w;
  float wce = max(wc, px * 0.55);
  acc.z = max(acc.z, sgSat((wce - d) / px + 0.5) * (wc / wce) * k);
}

vec2 sgPolar(float r, float cw) {
  float a = cw * 6.283185;
  return r * vec2(sin(a), -cos(a));
}

void sgRing(vec2 q, float r, float cw, float R, float w, float p, float k, float px, inout vec3 acc, inout float front) {
  if (p <= 0.0) return;
  float d = (p >= 1.0 || cw <= p) ? abs(r - R) : min(length(q - vec2(0.0, -R)), length(q - sgPolar(R, p)));
  sgLine(d, w, k, px, acc);
  if (p > 0.0 && p < 1.0) {
    vec2 e = q - sgPolar(R, p);
    front += exp(-dot(e, e) * 1400.0);
  }
}

void sgRunes(float r, float cw, float rot, float n, float rc, float hh, float seed, float p, float time, float glitch, float px, inout vec3 acc) {
  if (abs(r - rc) > hh * 1.35 || p <= 0.0) return;
  float a = fract(cw + rot / 6.283185) * n;
  float cell = floor(a);
  vec2 g = vec2((fract(a) - 0.5) * (6.283185 * rc / n) / hh, (r - rc) / hh);
  int id = int(floor(hash11(cell * 7.31 + seed * 13.7) * 8.0));
  float at = (cell + 0.5) / n;
  float on = sgSat((p - at) * n * 2.0 + 0.5);
  float flash = 1.0 + 1.4 * exp(-max(p - at, 0.0) * n * 1.2) * on;
  float pulse = 0.78 + 0.42 * pow(0.5 + 0.5 * sin(time * 2.6 - cell * 0.9), 4.0);
  if (glitch > 0.5) pulse *= step(0.14, hash11(cell + floor(time * 9.0) * 3.1));
  sgLine(sigilGlyph(id, g) * hh, 0.08 * hh, on * flash * pulse, px, acc);
}

void sgStar(vec2 q, float R, int sides, int stepK, int loops, float rot, float p, float w, float px, inout vec3 acc) {
  if (p <= 0.0 || dot(q, q) > (R + 0.05) * (R + 0.05)) return;
  float st = 6.283185 * float(stepK) / float(sides);
  mat2 M = mat2(cos(st), sin(st), -sin(st), cos(st));
  int per = sides / loops;
  for (int s = 0; s < 2; s++) {
    if (s >= loops) break;
    float a0 = rot + 6.283185 * float(s) / float(sides);
    vec2 A = R * vec2(sin(a0), -cos(a0));
    for (int m = 0; m < 8; m++) {
      if (m >= per) break;
      float cp = sgSat(p * float(per) - float(m));
      if (cp <= 0.0) break;
      vec2 B = M * A;
      vec2 E = mix(A, B, cp);
      sgLine(sgSeg(q, A, E), w, 1.0, px, acc);
      A = B;
    }
  }
}

void main() {
  float fade = uParams.z;
  float reveal = uParams.y;
  if (fade <= 0.002 || reveal <= 0.002) discard;
  vec2 q = vQ * 1.08;
  float r = length(q);
  if (r > 1.08) discard;
  int style = int(uParams.x + 0.5);
  float rot = uParams.w;
  float seed = uExtra.x;
  float intensity = uExtra.y;
  float heat = uExtra.z;
  float px = max(length(fwidth(q)) * 0.75, 0.003);

  // Style 3: Fire scorch crater + glowing lava/ember cracks
  if (style == 3) {
    float n1 = vNoise(q * 3.2 + seed * 7.1);
    float n2 = vNoise(q * 8.5 - seed * 3.3);
    float mask = 1.0 - smoothstep(0.45 * reveal, 1.0 * reveal, r + (n1 - 0.5) * 0.32 + (n2 - 0.5) * 0.12);
    if (mask <= 0.003) discard;
    float sootA = mask * fade * 0.72;
    float crack = 1.0 - smoothstep(0.015, 0.085, abs(n2 - 0.5) + abs(n1 - 0.5) * 0.35);
    float ringHot = exp(-pow((r - 0.62 * reveal) / 0.14, 2.0)) * (0.4 + 0.6 * n1);
    float glow = (crack * 1.35 * (1.0 - r * 0.55) + ringHot * 0.7) * mask * heat * fade;
    vec3 emit = fireRamp(clamp(glow * 0.9, 0.0, 1.0)) * glow * intensity;
    gl_FragColor = vec4(uDark * sootA + emit, sootA);
    return;
  }

  // Style 4: Frost creeping fern-fingered hoarfrost ring
  if (style == 4) {
    float ang = atan(q.y, q.x);
    float fern = vNoise(vec2(ang * 4.5 + seed * 5.0, r * 4.0)) * 0.65 + vNoise(q * 9.0 + seed) * 0.35;
    float reach = reveal * (0.72 + 0.34 * fern);
    float disc = 1.0 - smoothstep(reach - 0.14, reach, r);
    if (disc <= 0.003) discard;
    float rim = exp(-pow((r - reach * 0.9) / 0.08, 2.0)) * (0.6 + 0.6 * fern);
    float crystal = smoothstep(0.76, 0.94, vNoise(q * 24.0 + seed * 11.0)) * (0.6 + 0.4 * sin(uTime * 11.0 + q.x * 30.0));
    float a = disc * fade * 0.46;
    vec3 col = mix(uPrimary, uCore, clamp(rim * 0.7 + crystal, 0.0, 1.0));
    vec3 emit = col * (rim * 1.15 + crystal * 1.4 + disc * 0.25) * fade * intensity;
    gl_FragColor = vec4(uDark * a * 0.55 + emit, a);
    return;
  }

  // Style 5: Lightning Lichtenberg scorch + pulsing electric veins
  if (style == 5) {
    float ang = atan(q.y, q.x);
    float branch = abs(sin(ang * 7.0 + vNoise(q * 6.0 + seed) * 3.8));
    float vein = pow(1.0 - branch, 8.0) * (1.0 - smoothstep(0.25, 0.98 * reveal, r));
    float n = vNoise(q * 5.5 + seed * 4.0);
    float scorch = (1.0 - smoothstep(0.25, 0.78 * reveal, r + (n - 0.5) * 0.25)) * fade * 0.55;
    float pulse = 0.55 + 0.45 * sin(uTime * 28.0 + seed * 9.0);
    vec3 emit = mix(uPrimary, uCore, vein) * (vein * 2.1 * pulse + exp(-r * r * 9.0) * 0.9) * heat * fade * intensity;
    if (scorch + length(emit) <= 0.004) discard;
    gl_FragColor = vec4(uDark * scorch + emit, scorch);
    return;
  }

  // Style 6: Nature glowing vine-ring & blooming meadow seal
  if (style == 6) {
    float ang = atan(q.y, q.x) + rot;
    float wave = 0.05 * sin(ang * 6.0 + uTime * 2.2) + 0.025 * sin(ang * 12.0 - uTime * 3.1);
    float ring1 = exp(-pow((r - (0.86 + wave)) / 0.032, 2.0));
    float ring2 = exp(-pow((r - (0.58 - wave * 0.8)) / 0.024, 2.0));
    float petal = pow(0.5 + 0.5 * cos(ang * 6.0), 4.0) * exp(-pow((r - 0.72) / 0.09, 2.0));
    float sw = smoothstep(0.0, 0.25, reveal - fract(ang / 6.283185 + 0.5) * 0.65);
    float glow = (ring1 * 1.1 + ring2 * 0.85 + petal * 0.9) * sw * fade;
    if (glow <= 0.004) discard;
    vec3 col = mix(uPrimary, uCore, clamp(ring1 * 0.6 + petal * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * glow * intensity, 0.0);
    return;
  }

  // Styles 0 (holy/radiant), 1 (arcane), 2 (void/shadow): procedural SDF rune sigil
  float cw = fract(atan(q.x, -q.y) / 6.283185);
  float pO = sgSat(reveal / 0.38);
  float pR = sgSat((reveal - 0.12) / 0.45);
  float pS = sgSat((reveal - 0.35) / 0.45);
  float pC = sgSat((reveal - 0.65) / 0.35);
  vec3 acc = vec3(0.0, 1e3, 0.0);
  float front = 0.0;
  float shimmer = 0.85 + 0.25 * sin(cw * 44.0 - uTime * 3.2) * sin(cw * 25.0 + uTime * 1.9);

  if (style == 0) {
    // Holy / radiant: double ring, 12 runes, hexagram, sunburst center
    sgRing(q, r, cw, 0.96, 0.014, pO, shimmer, px, acc, front);
    sgRing(q, r, cw, 0.79, 0.008, pR, 1.0, px, acc, front);
    sgRunes(r, cw, rot, 12.0, 0.875, 0.052, seed, pR, uTime, 0.0, px, acc);
    sgStar(q, 0.76, 6, 2, 2, -rot * 0.6, pS, 0.008, px, acc);
    sgRing(q, r, cw, 0.36, 0.008, pC, 1.0, px, acc, front);
    sgLine(max(r - 0.05, 0.0), 0.01, pC, px, acc);
  } else if (style == 1) {
    // Arcane: dashed outer counter ring, 14 runes, heptagram, inner ring
    sgRing(q, r, cw, 0.96, 0.014, pO, shimmer, px, acc, front);
    float dash = step(fract(cw * 36.0 - uTime * 0.15), 0.58);
    sgLine(abs(r - 0.915), 0.006, step(cw, pO + 0.01) * dash, px, acc);
    sgRing(q, r, cw, 0.78, 0.007, pR, 1.0, px, acc, front);
    sgRunes(r, cw, rot, 14.0, 0.85, 0.048, seed, pR, uTime, 0.0, px, acc);
    sgStar(q, 0.76, 7, 2, 1, -rot * 0.55, pS, 0.0075, px, acc);
    sgRing(q, r, cw, 0.34, 0.007, pC, 1.0, px, acc, front);
  } else {
    // Void / shadow: broken ring, glitching runes, octagram, inward spiral arms + dark shadow base
    float gap = step(sin(cw * 25.13 + rot * 2.5), 0.78);
    sgLine(abs(r - 0.96), 0.015, step(cw, pO + 0.01) * gap * shimmer, px, acc);
    sgRing(q, r, cw, 0.78, 0.007, pR, 1.0, px, acc, front);
    sgRunes(r, cw, rot, 10.0, 0.87, 0.052, seed, pR, uTime, 1.0, px, acc);
    sgStar(q, 0.74, 8, 3, 1, -rot * 0.45, pS, 0.0075, px, acc);
    if (r > 0.1 && r < 0.65) {
      float ph = fract(cw - 2.0 * log(max(r, 0.05)) / 6.283185 + uTime * 0.1 + rot / 6.283185) * 4.0;
      float dArm = abs(fract(ph) - 0.5) * 6.283185 * r / 4.0 / 2.236;
      sgLine(dArm, 0.007 * smoothstep(0.1, 0.25, r) * smoothstep(0.65, 0.45, r), pS, px, acc);
    }
  }

  float halo = (exp(-acc.y / 0.022) * 0.35 + exp(-acc.y / 0.07) * 0.09) * step(acc.y, 1e2);
  halo += 0.14 * exp(-abs(r - 0.96) / 0.055) * pO;
  float voidDark = style == 2 ? (1.0 - smoothstep(0.35, 0.96, r)) * pO * fade * 0.52 : 0.0;
  if (acc.x + halo + front + voidDark <= 0.004) discard;
  vec3 col = (uCore * (acc.z * 2.1 + front * 1.8) + uPrimary * (acc.x * 1.15 + halo * 0.95)) * fade * intensity;
  gl_FragColor = vec4(uDark * voidDark + col, voidDark);
}
`

export interface GroundMarkHandle {
  mesh: THREE.Mesh
  update(opts: { time: number; reveal: number; fade: number; rot?: number; heat?: number; scale?: number; intensity?: number }): void
  dispose(): void
}

export function createGroundMark(
  palette: ElementPalette,
  {
    style = palette.sigilStyle,
    radius = 1.1,
    upright = false,
    seed = Math.random() * 100,
    intensity = 1.25,
  }: { style?: number; radius?: number; upright?: boolean; seed?: number; intensity?: number } = {}
): GroundMarkHandle {
  const uniforms = {
    uTime: { value: 0 },
    uParams: { value: new THREE.Vector4(style, 1, 1, 0) },
    uExtra: { value: new THREE.Vector4(seed, intensity, 1, 0) },
    uCore: { value: palette.core.clone() },
    uPrimary: { value: palette.primary.clone() },
    uDark: { value: palette.dark.clone() },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-ground"
  const mesh = new THREE.Mesh(groundQuadGeometry(), mat)
  if (!upright) mesh.rotation.x = -Math.PI / 2
  mesh.scale.setScalar(radius)
  mesh.frustumCulled = false
  mesh.renderOrder = 6
  return {
    mesh,
    update(o) {
      uniforms.uTime.value = o.time
      uniforms.uParams.value.y = o.reveal
      uniforms.uParams.value.z = o.fade
      if (o.rot !== undefined) uniforms.uParams.value.w = o.rot
      if (o.heat !== undefined) uniforms.uExtra.value.z = o.heat
      if (o.intensity !== undefined) uniforms.uExtra.value.y = o.intensity
      if (o.scale !== undefined) mesh.scale.setScalar(o.scale)
    },
    dispose() {
      mat.dispose()
    },
  }
}

// ── 5. Analytical Shockwave Shell, Ground Ring & Plasma Knot (ultra-elements Shockwaves.js + arcane.js) ──────────────

const SHOCK_VERT = /* glsl */ `
uniform float uBillboard;
varying vec2 vQ;
void main() {
  vQ = position.xy;
  if (uBillboard > 0.5) {
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Extract uniform scale from modelMatrix column 0 length
    float sc = length(vec3(modelMatrix[0][0], modelMatrix[0][1], modelMatrix[0][2]));
    mv.xy += position.xy * sc;
    gl_Position = projectionMatrix * mv;
  } else {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
}
`

const SHOCK_FRAG =
  COMMON_GLSL +
  /* glsl */ `
uniform float uTime;
uniform vec4 uState;    // x: mode (0 sphere shell, 1 plasma knot, 2 plasma burst pop, 3 ground ring), y: progress 0..1, z: intensity, w: seed
uniform vec3 uCore;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uDark;
uniform float uOcclude;
varying vec2 vQ;

void main() {
  float r2 = dot(vQ, vQ);
  if (r2 >= 1.0) discard;
  float r = sqrt(r2);
  int mode = int(uState.x + 0.5);
  float prog = uState.y;
  float I = uState.z;
  float seed = uState.w;
  if (I <= 0.002) discard;

  if (mode == 0) {
    // Spherical shockwave shell: exact chord through hollow shell [ri, ro] (ultra-elements Shockwaves.js)
    float ro = 1.0;
    float ri = mix(0.68, 0.86, prog);
    float chord = sqrt(max(ro * ro - r2, 0.0)) - sqrt(max(ri * ri - r2, 0.0));
    float prof = chord / max(sqrt(ro * ro - ri * ri), 1e-4);
    float p2 = prof * prof;
    float rim = p2 * p2;
    float fade = pow(max(1.0 - prog, 0.0), 1.8);
    // Chromatic dispersion fringe on rim
    vec3 disp = vec3(
      exp(-pow((r - 0.91) / 0.075, 2.0)),
      exp(-pow((r - 0.88) / 0.075, 2.0)),
      exp(-pow((r - 0.85) / 0.075, 2.0))
    );
    vec3 col = (uPrimary * rim * 1.1 + uCore * pow(rim, 2.2) * 0.9 + uSecondary * disp * 0.45) * fade * I;
    float occ = uOcclude > 0.6 ? (1.0 - smoothstep(0.0, ri, r)) * fade * 0.35 : 0.0;
    gl_FragColor = vec4(uDark * occ + col, occ);
    return;
  }

  if (mode == 1) {
    // Plasma knot orb (ultra-elements arcane.js SPRITE_FRAG)
    float ang = atan(vQ.y, vQ.x) / 6.283185 + 0.5;
    float flick = 0.85 + 0.25 * sin(uTime * 29.0 + seed * 37.0);
    float edge = 1.0 - r2;
    edge *= edge;
    float fil = vNoise(vec2(ang * 8.0 + uTime * 2.2 + seed, r * 3.5)) * 0.6
              + vNoise(vec2(ang * 16.0 - uTime * 3.6 + seed * 2.0, r * 5.0)) * 0.4;
    fil = pow(fil, 3.0);
    float tend = fil * exp(-r * 4.5) * smoothstep(0.04, 0.16, r);
    if (uOcclude > 0.65) {
      // Shadow/void orb: absorbing dark horizon ringed in blazing violet plasma
      float darkCore = (1.0 - smoothstep(0.24, 0.42, r));
      float rim = exp(-pow((r - 0.38) / 0.1, 2.0));
      vec3 emit = (uCore * pow(rim, 2.0) * 1.5 + uPrimary * (rim * 1.4 + tend * 2.2)) * edge * flick * I;
      gl_FragColor = vec4(uDark * darkCore * 0.92 + emit, darkCore * 0.92);
      return;
    }
    float core = exp(-r2 * 46.0) * flick;
    float sheath = exp(-r2 * 12.0);
    vec3 halo = (0.018 / (r2 * vec3(0.85, 1.0, 1.25) + 0.018) - 0.018) * 0.55;
    vec3 col = (uCore * (core * 2.2 + sheath * 0.35) + uPrimary * (sheath * 0.8 + tend * 2.1 + halo * 0.85) + uSecondary * halo * 0.45) * edge * I;
    float bodyA = uOcclude * sheath * edge * 0.5;
    gl_FragColor = vec4(col, bodyA);
    return;
  }

  if (mode == 2) {
    // Plasma impact pop: flash + chromatic shock ring + 24 radial spark streaks (arcane.js)
    float x = clamp(prog, 0.0, 1.0);
    float k = 1.0 - x;
    float ang = atan(vQ.y, vQ.x) / 6.283185 + 0.5;
    vec3 y = (r - (0.08 + 0.78 * sqrt(x)) * vec3(1.035, 1.0, 0.965)) / (0.12 + 0.2 * x);
    vec3 ring = exp(-y * y) * k * k * smoothstep(0.0, 0.35, r);
    float fl = exp(-r2 * 24.0) * k * k * k;
    float slot = floor(ang * 24.0);
    float h = hash11(slot * 1.37 + seed);
    float head = 0.14 + (0.45 + 0.55 * h) * 0.85 * x;
    float u = (fract(ang * 24.0) - 0.5) * 6.283185 * r / 24.0;
    float along = clamp(r - head, -0.24, 0.0);
    float ray = step(0.38, h) * exp(-u * u / 0.00022) * exp(along * 10.0) * step(r, head) * k * k;
    float edge = 1.0 - r2;
    edge *= edge;
    vec3 col = (uCore * (fl * 2.2 + ray * 1.3) + uPrimary * (ring * 0.75 + fl * 1.2 + ray * 0.75) + uSecondary * ring * 0.4) * edge * I;
    gl_FragColor = vec4(col, 0.0);
    return;
  }

  // Mode 3: Ground shock ring (sharp leading edge, soft trailing wake)
  float x = (r - mix(0.2, 0.92, pow(prog, 0.45))) / mix(0.11, 0.17, prog);
  float prof = exp(-x * x * (x > 0.0 ? 6.5 : 1.0));
  float fade = pow(max(1.0 - prog, 0.0), 1.6);
  vec3 col = mix(uPrimary, uCore, prof * 0.55) * prof * fade * I;
  gl_FragColor = vec4(col, 0.0);
}
`

export type ShockMode = 0 | 1 | 2 | 3

export interface ShockSpriteHandle {
  mesh: THREE.Mesh
  update(opts: { time: number; progress: number; intensity: number; scale?: number }): void
  dispose(): void
}

export function createShockSprite(
  palette: ElementPalette,
  mode: ShockMode,
  { scale = 1, seed = Math.random() * 50 }: { scale?: number; seed?: number } = {}
): ShockSpriteHandle {
  const billboard = mode !== 3
  const uniforms = {
    uBillboard: { value: billboard ? 1 : 0 },
    uTime: { value: 0 },
    uState: { value: new THREE.Vector4(mode, 0, 1, seed) },
    uCore: { value: palette.core.clone() },
    uPrimary: { value: palette.primary.clone() },
    uSecondary: { value: palette.secondary.clone() },
    uDark: { value: palette.dark.clone() },
    uOcclude: { value: palette.occlude },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHOCK_VERT,
    fragmentShader: SHOCK_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-shock"
  const mesh = new THREE.Mesh(groundQuadGeometry(), mat)
  if (!billboard) mesh.rotation.x = -Math.PI / 2
  mesh.scale.setScalar(scale)
  mesh.frustumCulled = false
  mesh.renderOrder = billboard ? 11 : 7
  return {
    mesh,
    update(o) {
      uniforms.uTime.value = o.time
      uniforms.uState.value.y = o.progress
      uniforms.uState.value.z = o.intensity
      if (o.scale !== undefined) mesh.scale.setScalar(o.scale)
    },
    dispose() {
      mat.dispose()
    },
  }
}

// ── 6. Aura Energy Veil Cylinder (adapted from small-magic blast.js wall + ultra-elements arcane.js) ──────────────────

let sharedVeilGeo: THREE.BufferGeometry | null = null
function veilGeometry(): THREE.BufferGeometry {
  if (sharedVeilGeo) return sharedVeilGeo
  const g = new THREE.CylinderGeometry(0.54, 0.72, 1, 32, 1, true)
  g.translate(0, 0.5, 0)
  sharedVeilGeo = g
  return g
}

const VEIL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const VEIL_FRAG =
  COMMON_GLSL +
  /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uOcclude;
uniform vec3 uCore;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uDark;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;

void main() {
  if (uOpacity <= 0.002) discard;
  float y = vUv.y;
  float vertFade = smoothstep(0.0, 0.14, y) * pow(max(1.0 - y, 0.0), 1.35);
  vec3 V = normalize(cameraPosition - vWorld);
  float limb = pow(1.0 - abs(dot(normalize(vNormalW), V)), 1.6);
  // Upward-streaming energy bands + counter-rotating ribbons
  float s1 = vNoise(vec2(vUv.x * 9.0 + uTime * 0.55, y * 3.0 - uTime * 1.9));
  float s2 = vNoise(vec2(vUv.x * 18.0 - uTime * 0.9, y * 5.5 - uTime * 3.1));
  float streak = pow(s1 * 0.65 + s2 * 0.35, 2.2);
  // Horizontal rune-like pulse ring rising from the feet
  float ring = exp(-pow(fract(y * 1.4 - uTime * 0.65) - 0.5, 2.0) * 65.0) * 0.55;
  float baseRim = (1.0 - smoothstep(0.0, 0.08, y)) * 0.9;
  float energy = ((0.22 + 0.95 * limb) * (0.35 + 1.35 * streak) + ring + baseRim) * vertFade * uOpacity;

  if (uOcclude > 0.65) {
    float darkA = (0.25 + 0.45 * limb) * (0.5 + 0.5 * s1) * vertFade * uOpacity * 0.72;
    vec3 emit = mix(uSecondary, uCore, clamp(limb * 0.7 + ring, 0.0, 1.0)) * energy * 0.95;
    gl_FragColor = vec4(uDark * darkA + emit, darkA);
    return;
  }

  vec3 col = mix(uSecondary, uPrimary, smoothstep(0.2, 0.8, s1));
  col = mix(col, uCore, clamp(limb * 0.5 + ring * 0.8 + baseRim * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col * energy * 1.05, uOcclude * vertFade * uOpacity * 0.25);
}
`

export interface AuraVeilHandle {
  mesh: THREE.Mesh
  update(time: number, opacity: number): void
  dispose(): void
}

export function createAuraVeil(palette: ElementPalette, height: number): AuraVeilHandle {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uOcclude: { value: palette.occlude },
    uCore: { value: palette.core.clone() },
    uPrimary: { value: palette.primary.clone() },
    uSecondary: { value: palette.secondary.clone() },
    uDark: { value: palette.dark.clone() },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VEIL_VERT,
    fragmentShader: VEIL_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-veil"
  const mesh = new THREE.Mesh(veilGeometry(), mat)
  mesh.scale.set(1, height, 1)
  mesh.frustumCulled = false
  mesh.renderOrder = 8
  return {
    mesh,
    update(time, opacity) {
      uniforms.uTime.value = time
      uniforms.uOpacity.value = opacity
    },
    dispose() {
      mat.dispose()
    },
  }
}

// ── 7. Instanced Faceted 3D Crystal Shards (adapted from ultra-elements Particles.js shardGeometry) ───────────────────

let sharedShardBase: THREE.BufferGeometry | null = null
function shardBaseGeometry(): THREE.BufferGeometry {
  if (sharedShardBase) return sharedShardBase
  const tip = new THREE.CylinderGeometry(0, 0.2, 0.72, 6, 1, false)
  tip.translate(0, 0.36, 0)
  const tail = new THREE.CylinderGeometry(0.2, 0.04, 0.36, 6, 1, false)
  tail.translate(0, -0.18, 0)
  const a = tip.toNonIndexed()
  const b = tail.toNonIndexed()
  const posA = a.attributes.position.array
  const posB = b.attributes.position.array
  const mergedPos = new Float32Array(posA.length + posB.length)
  mergedPos.set(posA, 0)
  mergedPos.set(posB, posA.length)
  const out = new THREE.BufferGeometry()
  out.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3))
  out.computeVertexNormals()
  tip.dispose()
  tail.dispose()
  a.dispose()
  b.dispose()
  sharedShardBase = out
  return out
}

const SHARD_VERT = /* glsl */ `
attribute vec4 aOrigin; // xyz, birth
attribute vec4 aVel;    // vx, vy, vz, life
attribute vec4 aSpin;   // rx, ry, rz, size

uniform float uTime;
uniform vec3 uAnchor;
uniform float uGravity;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vFade;

mat3 rotEuler(vec3 r) {
  vec3 c = cos(r), s = sin(r);
  return mat3(
    c.y * c.z, -c.y * s.z, s.y,
    c.x * s.z + s.x * s.y * c.z, c.x * c.z - s.x * s.y * s.z, -s.x * c.y,
    s.x * s.z - c.x * s.y * c.z, s.x * c.z + c.x * s.y * s.z, c.x * c.y
  );
}

void main() {
  float age = uTime - aOrigin.w;
  float life = aVel.w;
  if (age < 0.0 || age >= life || life <= 1e-4) {
    vFade = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = clamp(age / life, 0.0, 1.0);
  float scale = aSpin.w * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.65, 1.0, u));
  mat3 R = rotEuler(aSpin.xyz * age + aOrigin.xyz * 7.0);
  vec3 center = uAnchor + aOrigin.xyz + aVel.xyz * age;
  center.y = max(0.04, center.y - 0.5 * uGravity * age * age);
  vec3 wp = center + R * (position * scale);
  vWorld = wp;
  vNormalW = normalize(R * normal);
  vFade = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.7, 1.0, u));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`

const SHARD_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uPrimary;
uniform vec3 uDark;
uniform float uOcclude;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vFade;

void main() {
  if (vFade <= 0.01) discard;
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(N, V));
  float rim = pow(1.0 - ndv, 2.2);
  float spec = pow(max(dot(reflect(-V, N), normalize(vec3(0.4, 0.85, 0.35))), 0.0), 18.0);
  vec3 col = mix(uDark, uPrimary, 0.45 + 0.55 * ndv) + uCore * (rim * 1.15 + spec * 1.6);
  float a = clamp(vFade * (uOcclude > 0.4 ? 0.92 : 0.78), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`

export interface ShardSeed {
  x: number
  y: number
  z: number
  birth: number
  vx: number
  vy: number
  vz: number
  life: number
  size: number
  spinX?: number
  spinY?: number
  spinZ?: number
}

export interface ShardBurstHandle {
  mesh: THREE.Mesh
  update(time: number, anchor?: THREE.Vector3): void
  dispose(): void
}

export function createShardBurst(
  seeds: ShardSeed[],
  palette: ElementPalette,
  { gravity = 5.5 }: { gravity?: number } = {}
): ShardBurstHandle {
  const n = seeds.length
  const base = shardBaseGeometry()
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute("position", base.attributes.position)
  geo.setAttribute("normal", base.attributes.normal)
  const aOrigin = new Float32Array(n * 4)
  const aVel = new Float32Array(n * 4)
  const aSpin = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const s = seeds[i]
    const o = i * 4
    aOrigin[o] = s.x
    aOrigin[o + 1] = s.y
    aOrigin[o + 2] = s.z
    aOrigin[o + 3] = s.birth
    aVel[o] = s.vx
    aVel[o + 1] = s.vy
    aVel[o + 2] = s.vz
    aVel[o + 3] = s.life
    aSpin[o] = s.spinX ?? (Math.random() - 0.5) * 14
    aSpin[o + 1] = s.spinY ?? (Math.random() - 0.5) * 14
    aSpin[o + 2] = s.spinZ ?? (Math.random() - 0.5) * 14
    aSpin[o + 3] = s.size
  }
  geo.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(aOrigin, 4))
  geo.setAttribute("aVel", new THREE.InstancedBufferAttribute(aVel, 4))
  geo.setAttribute("aSpin", new THREE.InstancedBufferAttribute(aSpin, 4))
  geo.instanceCount = n

  const uniforms = {
    uTime: { value: 0 },
    uAnchor: { value: new THREE.Vector3() },
    uGravity: { value: gravity },
    uCore: { value: palette.core.clone() },
    uPrimary: { value: palette.primary.clone() },
    uDark: { value: palette.dark.clone() },
    uOcclude: { value: palette.occlude },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHARD_VERT,
    fragmentShader: SHARD_FRAG,
    side: THREE.DoubleSide,
    ...PREMUL_BLENDING,
  })
  mat.customProgramCacheKey = () => "d20-spell-shards"
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 9
  return {
    mesh,
    update(time, anchor) {
      uniforms.uTime.value = time
      if (anchor) uniforms.uAnchor.value.copy(anchor)
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

// ── Single-crystal lance mesh for frost bolt projectiles ──────────────────────────────────────────────────────────────

export function createCrystalLance(palette: ElementPalette): { mesh: THREE.Mesh; dispose: () => void } {
  const mat = new THREE.MeshStandardMaterial({
    color: palette.primary,
    emissive: palette.core,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.15,
    transparent: true,
    opacity: 0.9,
  })
  const mesh = new THREE.Mesh(shardBaseGeometry(), mat)
  mesh.rotation.x = Math.PI / 2
  mesh.scale.set(0.32, 0.72, 0.32)
  return {
    mesh,
    dispose() {
      mat.dispose()
    },
  }
}

// ── Pre-compilation warmup group ──────────────────────────────────────────────────────────────────────────────────────
// Held on `Effects.group` at zero-area/collapsed state so `Stage.load()`'s `renderer.compileAsync(scene, camera)`
// compiles all 6 spell shader programs off the main thread before the first frame — zero recompiles on cast.

export interface WarmupPack {
  group: THREE.Group
  dispose(): void
}

export function createSpellWarmup(): WarmupPack {
  const group = new THREE.Group()
  group.name = "spell-vfx-warmup"
  const p = ELEMENT_PALETTES.arcane
  const bolt = createLightningBolt(p, { branches: 1, subBranches: 1 })
  bolt.set({ a: new THREE.Vector3(), b: new THREE.Vector3(), reveal: 0, intensity: 0 })
  const ribbon = createSpellRibbon(p, { helix: false })
  ribbon.set({ a: new THREE.Vector3(), b: new THREE.Vector3(), time: 0, power: 0, tail: 0, head: 0 })
  const particles = createParticleCloud([{ x: 0, y: 0, z: 0, birth: 10, vx: 0, vy: 0, vz: 0, life: 0.1, size0: 0, size1: 0, kind: 0 }], p)
  particles.update(0, { alpha: 0 })
  const ground = createGroundMark(p, { radius: 0.001, intensity: 0 })
  ground.update({ time: 0, reveal: 0, fade: 0 })
  const shock = createShockSprite(p, 0, { scale: 0.001 })
  shock.update({ time: 0, progress: 0, intensity: 0 })
  const veil = createAuraVeil(p, 0.001)
  veil.update(0, 0)
  const shards = createShardBurst([{ x: 0, y: 0, z: 0, birth: 10, vx: 0, vy: 0, vz: 0, life: 0.1, size: 0 }], p)
  shards.update(0)

  group.add(bolt.mesh, ribbon.mesh, particles.mesh, ground.mesh, shock.mesh, veil.mesh, shards.mesh)
  return {
    group,
    dispose() {
      bolt.dispose()
      ribbon.dispose()
      particles.dispose()
      ground.dispose()
      shock.dispose()
      veil.dispose()
      shards.dispose()
      sharedBoltGeo?.dispose()
      sharedBoltGeo = null
      sharedRibbonGeo?.dispose()
      sharedRibbonGeo = null
      sharedRibbonHelixGeo?.dispose()
      sharedRibbonHelixGeo = null
      sharedGroundGeo?.dispose()
      sharedGroundGeo = null
      sharedVeilGeo?.dispose()
      sharedVeilGeo = null
      sharedShardBase?.dispose()
      sharedShardBase = null
    },
  }
}
