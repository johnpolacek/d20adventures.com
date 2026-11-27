import * as THREE from "three"

// Uniforms every Stage material shares: animation time, wind strength and the sun direction (world space).
// One set per Stage instance, handed to each material factory.
export interface SharedUniforms {
  time: { value: number }
  wind: { value: number }
  sun: { value: THREE.Vector3 }
  // How the haze tints toward the sun: warm sunlight by default, set from the atmosphere's `glow` for a moon.
  sunTint: { value: THREE.Vector3 }
  // 1 warms the colour grade of painted figures (as the paint pass does); 0 keeps it neutral for moonlit sets.
  warmth: { value: number }
  // Metres from the camera before the haze begins.
  fogStart: { value: number }
  // Ground-hugging volumetric mist: x = peak density (0 off), y = floor world y, z = scale height (m), w = start (m).
  groundMist: { value: THREE.Vector4 }
  groundMistColor: { value: THREE.Color }
  groundMistWisp: { value: number }
  // The planar water reflection (render/mirror.ts): its texture, the matrix from world space into it, and 1 while drawn.
  reflectMap: { value: THREE.Texture | null }
  reflectMatrix: { value: THREE.Matrix4 }
  mirrorOn: { value: number }
}
export function createShared(): SharedUniforms {
  return {
    time: { value: 0 },
    wind: { value: 0.8 },
    sun: { value: new THREE.Vector3(-0.8, 0.55, 0.32).normalize() },
    sunTint: { value: new THREE.Vector3(1.45, 1.18, 0.86) },
    warmth: { value: 1 },
    fogStart: { value: 0 },
    groundMist: { value: new THREE.Vector4(0, 0, 3.5, 6) },
    groundMistColor: { value: new THREE.Color("#5c9cb4") },
    groundMistWisp: { value: 0.65 },
    reflectMap: { value: null },
    reflectMatrix: { value: new THREE.Matrix4() },
    mirrorOn: { value: 0 },
  }
}

type Shader = THREE.WebGLProgramParametersWithUniforms

// Aerial perspective: exponential height fog whose colour warms toward the sun, so distant towers dissolve into
// sunlit haze, plus an optional ground-hugging volumetric mist layer integrated along the view ray in 3D world space.
// Patched into each Stage material's own shader (never into three's global ShaderChunk), so any other three.js on the
// page keeps stock fog. The fog colour and density come from scene.fog as usual.
const FOG_PARS_VERTEX = "#ifdef USE_FOG\nvarying vec3 vFogView;\n#endif"
const FOG_VERTEX = "#ifdef USE_FOG\nvFogView = mvPosition.xyz;\n#endif"
const FOG_PARS_FRAGMENT = `#ifdef USE_FOG
uniform vec3 fogColor; uniform vec3 uSunDir; uniform vec3 uSunTint; uniform float uFogStart; uniform float uFogTime;
uniform vec4 uGroundMist; uniform vec3 uGroundMistColor; uniform float uGroundMistWisp;
varying vec3 vFogView;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
float fogHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fogNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(fogHash(i), fogHash(i + vec2(1.0, 0.0)), f.x), mix(fogHash(i + vec2(0.0, 1.0)), fogHash(i + vec2(1.0, 1.0)), f.x), f.y); }
#endif`
const FOG_FRAGMENT = `#ifdef USE_FOG
{
 #ifdef FOG_EXP2
 float fd = fogDensity;
 #else
 float fd = 1.0 / max(fogFar, 1.0);
 #endif
 float dist = length(vFogView);
 vec3 dir = vFogView / max(dist, 1e-3);
 vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
 vec3 sunV = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
 float k = 0.0085;
 float ry = dot(dir, upV) * dist * k;
 float optical = fd * exp(-k * max(cameraPosition.y, 0.0)) * max(dist - uFogStart, 0.0) * (abs(ry) > 1e-4 ? (1.0 - exp(-ry)) / ry : 1.0);
 float groundOpt = 0.0;
 if (uGroundMist.x > 0.0) {
  float gmDens = uGroundMist.x;
  float gmLevel = uGroundMist.y;
  float gmH = max(uGroundMist.z, 0.25);
  float gmStart = uGroundMist.w;
  vec3 dirW = dir * mat3(viewMatrix);
  // In the planar water reflection pass the virtual camera sits below the water plane: start integrating where the ray
  // leaves the water so submerged virtual length is never fogged.
  float tEnter = (cameraPosition.y < gmLevel && dirW.y > 1e-4) ? (gmLevel - cameraPosition.y) / dirW.y : 0.0;
  float t0 = max(gmStart * 0.5, tEnter);
  float tNearEnd = min(dist, 85.0);
  if (tNearEnd > t0) {
   float span = tNearEnd - t0;
   float stops[7];
   stops[0] = 0.0; stops[1] = 0.08; stops[2] = 0.19; stops[3] = 0.34; stops[4] = 0.52; stops[5] = 0.74; stops[6] = 1.0;
   for (int i = 0; i < 6; i++) {
    float ta = t0 + span * stops[i];
    float tb = t0 + span * stops[i + 1];
    float seg = tb - ta;
    float tm = 0.5 * (ta + tb);
    vec3 pm = cameraPosition + dirW * tm;
    float ya = max(cameraPosition.y + dirW.y * ta - gmLevel, 0.0);
    float yb = max(cameraPosition.y + dirW.y * tb - gmLevel, 0.0);
    float dy = (yb - ya) / gmH;
    float hInt = exp(-ya / gmH) * (abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0);
    vec2 uv1 = pm.xz * 0.042 + vec2(uFogTime * 0.016, uFogTime * 0.007) + vec2(pm.y * 0.05, -pm.y * 0.04);
    vec2 uv2 = pm.xz * 0.095 - vec2(uFogTime * 0.011, -uFogTime * 0.019) + vec2(-pm.y * 0.09, pm.y * 0.07);
    float n = fogNoise(uv1) * 0.65 + fogNoise(uv2) * 0.35;
    // Billow the mist's top height organically so it never reads as a flat horizontal sheet from above.
    float topBillow = exp(-max(pm.y - gmLevel, 0.0) / (gmH * (0.6 + 0.9 * n)));
    float bank = mix(1.0, smoothstep(0.18, 0.8, n) * 1.65, uGroundMistWisp);
    float nearFade = smoothstep(gmStart, gmStart + 14.0, tm);
    groundOpt += gmDens * seg * mix(hInt, topBillow, uGroundMistWisp * 0.45) * bank * nearFade;
   }
  }
  if (dist > 85.0) {
   float ta = max(85.0, t0);
   float tailSeg = dist - ta;
   if (tailSeg > 0.0) {
    float ya = max(cameraPosition.y + dirW.y * ta - gmLevel, 0.0);
    float yb = max(cameraPosition.y + dirW.y * dist - gmLevel, 0.0);
    float dy = (yb - ya) / gmH;
    float hInt = exp(-ya / gmH) * (abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0);
    groundOpt += gmDens * tailSeg * hInt;
   }
  }
 }
 float totalOpt = optical + groundOpt;
 float f = 1.0 - exp(-totalOpt);
 float s = max(dot(dir, sunV), 0.0);
 vec3 haze = mix(fogColor, fogColor * uSunTint, pow(s, 5.0) * .75);
 haze = mix(haze * vec3(1.08, .98, .9), haze, smoothstep(20.0, 220.0, dist));
 if (groundOpt > 0.0) {
  vec3 mistCol = mix(uGroundMistColor, uGroundMistColor * uSunTint, pow(s, 4.0) * .55);
  haze = mix(haze, mistCol, groundOpt / max(totalOpt, 1e-5));
 }
 gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, f);
}
#endif`

export function patchFog(s: Shader, shared: SharedUniforms) {
  s.uniforms.uSunDir = shared.sun
  s.uniforms.uSunTint = shared.sunTint
  s.uniforms.uFogStart = shared.fogStart
  s.uniforms.uFogTime = shared.time
  s.uniforms.uGroundMist = shared.groundMist
  s.uniforms.uGroundMistColor = shared.groundMistColor
  s.uniforms.uGroundMistWisp = shared.groundMistWisp
  s.vertexShader = s.vertexShader.replace("#include <fog_pars_vertex>", FOG_PARS_VERTEX).replace("#include <fog_vertex>", FOG_VERTEX)
  s.fragmentShader = s.fragmentShader.replace("#include <fog_pars_fragment>", FOG_PARS_FRAGMENT).replace("#include <fog_fragment>", FOG_FRAGMENT)
}

// Every material in a Stage scene goes through here: its own patch first (which may append after a fog include),
// then the scoped atmosphere. The cache key must name the patch, since three otherwise keys on the callback's source.
export function stageMaterial<T extends THREE.Material>(m: T, shared: SharedUniforms, key: string, patch?: (s: Shader) => void): T {
  m.onBeforeCompile = (s) => {
    patch?.(s)
    patchFog(s, shared)
  }
  m.customProgramCacheKey = () => `stage:${key}`
  return m
}

export const NOISE = /* glsl */ `
float mhash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float mnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(mhash(i), mhash(i + vec2(1, 0)), f.x), mix(mhash(i + vec2(0, 1)), mhash(i + vec2(1, 1)), f.x), f.y); }
float mfbm(vec2 p){ float s = 0.0, a = .5; for (int i = 0; i < 4; i++){ s += a * mnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; } return s; }
`
