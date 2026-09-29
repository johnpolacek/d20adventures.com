import * as THREE from "three"

// Uniforms every Stage material shares: animation time, wind strength and the sun direction (world space).
// One set per Stage instance, handed to each material factory.
export interface SharedUniforms {
  time: { value: number }
  wind: { value: number }
  sun: { value: THREE.Vector3 }
}
export function createShared(): SharedUniforms {
  return { time: { value: 0 }, wind: { value: 0.8 }, sun: { value: new THREE.Vector3(-0.8, 0.55, 0.32).normalize() } }
}

type Shader = THREE.WebGLProgramParametersWithUniforms

// Aerial perspective: exponential height fog whose colour warms toward the sun, so distant towers dissolve into
// sunlit haze. Patched into each Stage material's own shader (never into three's global ShaderChunk), so any
// other three.js on the page keeps stock fog. The fog colour and density come from scene.fog as usual.
const FOG_PARS_VERTEX = "#ifdef USE_FOG\nvarying vec3 vFogView;\n#endif"
const FOG_VERTEX = "#ifdef USE_FOG\nvFogView = mvPosition.xyz;\n#endif"
const FOG_PARS_FRAGMENT = `#ifdef USE_FOG
uniform vec3 fogColor; uniform vec3 uSunDir; varying vec3 vFogView;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
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
 float optical = fd * exp(-k * max(cameraPosition.y, 0.0)) * dist * (abs(ry) > 1e-4 ? (1.0 - exp(-ry)) / ry : 1.0);
 float f = 1.0 - exp(-optical);
 float s = max(dot(dir, sunV), 0.0);
 vec3 haze = mix(fogColor, fogColor * vec3(1.45, 1.18, .86), pow(s, 5.0) * .75);
 haze = mix(haze * vec3(1.08, .98, .9), haze, smoothstep(20.0, 220.0, dist));
 gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, f);
}
#endif`

export function patchFog(s: Shader, shared: SharedUniforms) {
  s.uniforms.uSunDir = shared.sun
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
