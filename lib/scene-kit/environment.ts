// scene-kit environment: procedural sky, environment map, sun, hemisphere, fog.
//
// A set picks an EnvironmentPreset (or passes its own options); the kit owns the
// sky shader and the PMREM bake so every exterior shares the same light model.
// Interiors pass `sky: false` and light themselves.

import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import type { TimeUniform } from "./shaders"

export interface SkyColors {
  zenith: THREE.ColorRepresentation
  horizon: THREE.ColorRepresentation
  ground: THREE.ColorRepresentation
  /** Cloud coverage threshold 0-1; higher = fewer clouds. */
  cloudCover?: number
}

export interface EnvironmentOptions {
  /** Direction toward the sun (normalized internally). */
  sun: THREE.Vector3 | [number, number, number]
  sunColor?: THREE.ColorRepresentation
  sunIntensity?: number
  /** Shadow frustum half-extent in metres around the target. */
  shadowExtent?: number
  shadowMapSize?: number
  shadowTarget?: [number, number, number]
  hemisphere?: { sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number }
  sky?: SkyColors | false
  /** With sky off, use a neutral room environment map so metals still reflect something. */
  interior?: boolean
  environmentIntensity?: number
  fog?: { color: THREE.ColorRepresentation; density: number } | false
  exposure?: number
}

export const ENVIRONMENT_PRESETS = {
  /** Late-morning autumn sun, cumulus, warm haze — the gates look. */
  autumnMorning: {
    sun: [-0.52, 0.62, 0.45],
    sunColor: 0xffe0b4,
    sunIntensity: 2.5,
    shadowExtent: 48,
    shadowMapSize: 4096,
    hemisphere: { sky: 0x9cc0ee, ground: 0x6a5636, intensity: 0.45 },
    sky: { zenith: 0x3166d6, horizon: 0xd1dbe6, ground: 0x8c7861, cloudCover: 0.5 },
    environmentIntensity: 0.3,
    fog: { color: 0xd8c4a6, density: 0.0048 },
    exposure: 0.92,
  },
  /** Low warm sun, long shadows, amber sky. */
  goldenHour: {
    sun: [-0.7, 0.22, 0.45],
    sunColor: 0xffb070,
    sunIntensity: 2.2,
    shadowExtent: 48,
    shadowMapSize: 4096,
    hemisphere: { sky: 0xc9a07a, ground: 0x4a3a3e, intensity: 0.4 },
    sky: { zenith: 0x3a4a86, horizon: 0xe8a060, ground: 0x6a5040, cloudCover: 0.55 },
    environmentIntensity: 0.3,
    fog: { color: 0xd8b090, density: 0.006 },
    exposure: 0.95,
  },
  /** A lamp-lit interior at dusk: faint blue directional from the windows, everything else from practicals. */
  interiorDusk: {
    sun: [0.2, 0.5, 0.85],
    sunColor: 0x6f8fd6,
    sunIntensity: 0.25,
    shadowExtent: 20,
    shadowMapSize: 2048,
    hemisphere: { sky: 0x3a3a48, ground: 0x2a1c12, intensity: 0.25 },
    sky: false,
    interior: true,
    environmentIntensity: 0.12,
    fog: { color: 0x1a1410, density: 0.02 },
    exposure: 0.95,
  },
  /** A lamp-lit interior at night: no directional light at all. */
  interiorNight: {
    sun: [0.2, 0.5, 0.85],
    sunColor: 0x2a3550,
    sunIntensity: 0.05,
    shadowExtent: 20,
    shadowMapSize: 1024,
    hemisphere: { sky: 0x22222c, ground: 0x1a1410, intensity: 0.22 },
    sky: false,
    interior: true,
    environmentIntensity: 0.1,
    fog: { color: 0x14100c, density: 0.022 },
    exposure: 0.95,
  },
  /** Moonlit blue with room for warm practicals. */
  night: {
    sun: [0.3, 0.55, -0.4],
    sunColor: 0x9db4dc,
    sunIntensity: 0.55,
    shadowExtent: 48,
    shadowMapSize: 2048,
    hemisphere: { sky: 0x2a3a5c, ground: 0x141418, intensity: 0.35 },
    sky: { zenith: 0x060a18, horizon: 0x1c2438, ground: 0x0c0c10, cloudCover: 0.6 },
    environmentIntensity: 0.15,
    fog: { color: 0x141a28, density: 0.008 },
    exposure: 0.85,
  },
} satisfies Record<string, EnvironmentOptions>

export type EnvironmentPresetName = keyof typeof ENVIRONMENT_PRESETS

export interface EnvironmentHandle {
  sun: THREE.DirectionalLight
  hemisphere: THREE.HemisphereLight
  sky: THREE.Mesh | null
  sunDirection: THREE.Vector3
  dispose(): void
}

function skyMaterial(sun: THREE.Vector3, time: TimeUniform, colors: SkyColors): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sun },
      uTime: time,
      uZenith: { value: new THREE.Color(colors.zenith) },
      uHorizon: { value: new THREE.Color(colors.horizon) },
      uGround: { value: new THREE.Color(colors.ground) },
      uCover: { value: colors.cloudCover ?? 0.5 },
    },
    vertexShader: "varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}",
    fragmentShader: `varying vec3 vDir;uniform vec3 uSun,uZenith,uHorizon,uGround;uniform float uTime,uCover;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*noise(p);p=p*2.05+vec2(1.7,9.2);a*=.5;}return s;}
 void main(){vec3 d=normalize(vDir);float h=d.y;
  vec3 col=mix(uHorizon,uZenith,pow(clamp(h,0.,1.),0.5));
  float sd=max(dot(d,uSun),0.);
  col+=vec3(1.0,0.82,0.55)*pow(sd,5.0)*0.28;
  col+=vec3(1.0,0.96,0.88)*pow(sd,2000.0)*12.0;
  if(h>0.0){vec2 uv=d.xz/(h+0.18)*1.6+uTime*0.003;float n=fbm(uv*0.8);float cov=smoothstep(uCover,uCover+0.16,n);float n2=fbm(uv*0.8+vec2(0.05,-0.04));float lit=clamp((n-n2)*14.0+0.55,0.,1.);
   vec3 cc=mix(vec3(0.58,0.62,0.76),vec3(1.06,1.03,0.99),lit);cc+=vec3(1.0,0.85,0.6)*pow(sd,3.0)*0.35;col=mix(col,cc,cov*smoothstep(0.0,0.10,h)*0.96);
   float wisp=smoothstep(0.55,0.75,fbm(uv*2.5+vec2(3.0)))*0.25*smoothstep(0.0,0.2,h);col=mix(col,vec3(0.95,0.95,0.97),wisp);}
  else{col=mix(uHorizon,uGround,smoothstep(0.0,-0.08,h));}
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
  })
}

export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, time: TimeUniform, options: EnvironmentOptions): EnvironmentHandle {
  const sunDirection = (Array.isArray(options.sun) ? new THREE.Vector3(...options.sun) : options.sun.clone()).normalize()
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = options.exposure ?? 0.92

  if (options.fog) scene.fog = new THREE.FogExp2(options.fog.color, options.fog.density)
  else scene.fog = null

  let sky: THREE.Mesh | null = null
  if (options.sky) {
    const material = skyMaterial(sunDirection, time, options.sky)
    sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), material)
    sky.frustumCulled = false
    scene.add(sky)
    // The same shader lights the environment map, so metals and wet stone reflect the sky.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), material.clone()))
    scene.environment = pmrem.fromScene(envScene, 0.04).texture
    scene.environmentIntensity = options.environmentIntensity ?? 0.3
    pmrem.dispose()
  } else if (options.interior) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = options.environmentIntensity ?? 0.12
    pmrem.dispose()
  }

  const sun = new THREE.DirectionalLight(options.sunColor ?? 0xffffff, options.sunIntensity ?? 2)
  sun.position.copy(sunDirection).multiplyScalar(90)
  const target = options.shadowTarget ?? [0, 0, 4]
  sun.target.position.set(...target)
  scene.add(sun, sun.target)
  sun.castShadow = true
  const size = options.shadowMapSize ?? 4096
  sun.shadow.mapSize.set(size, size)
  const extent = options.shadowExtent ?? 48
  const cam = sun.shadow.camera
  cam.left = -extent
  cam.right = extent
  cam.top = extent
  cam.bottom = -extent
  cam.near = 20
  cam.far = 200
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = 3

  const hemi = options.hemisphere ?? { sky: 0x9cc0ee, ground: 0x6a5636, intensity: 0.45 }
  const hemisphere = new THREE.HemisphereLight(hemi.sky, hemi.ground, hemi.intensity)
  scene.add(hemisphere)

  return {
    sun,
    hemisphere,
    sky,
    sunDirection,
    dispose() {
      scene.remove(sun, sun.target, hemisphere)
      if (sky) {
        scene.remove(sky)
        sky.geometry.dispose()
        ;(sky.material as THREE.Material).dispose()
      }
      scene.environment?.dispose()
      scene.environment = null
    },
  }
}
