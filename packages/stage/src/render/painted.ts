import * as THREE from "three"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"
import type { SharedUniforms } from "../materials/atmosphere"
import { PAINTINGS_PER_POINT, type SetSpec } from "../spec/set"
import { type TripodPoint, tripodPoints } from "../tripod"

// A painted set: paintings projected onto the built set from the points they were painted at.
// The set stays real geometry, so figures stand in it, cast shadows on it and are hidden by it, and
// near things slide against far ones as the camera sways. Its colour comes from the paintings.
//
// For each painting a depth map from its camera says what it saw. A surface takes the paint of the paintings that saw
// it, the sharpest most, each fading out toward the edge of its own frame. A surface no painting saw, which a swaying
// camera finds at the edges of near things, takes the paint beside it. Only the current point's paintings are drawn:
// the camera stands nowhere else.

type Spec = NonNullable<SetSpec["painted"]>
const N = PAINTINGS_PER_POINT
// Depth maps are this wide. A painting's own width matters less: this only decides where its paint stops.
const DEPTH_WIDTH = 1536
const FAR = 1500

interface Painting {
  map: THREE.Texture
  clear: THREE.Texture | null
  // What the painting's camera saw, in metres: r with every flag and awning hanging as painted, g with them taken down,
  // b where the two differ. Only a painting with a `clear` twin has g and b.
  depth: THREE.WebGLRenderTarget | null
  camera: THREE.PerspectiveCamera
  viewProjection: THREE.Matrix4
  // How many of its pixels a metre covers at one metre: a painting's sharpness on a surface.
  lens: number
}

type Patched = THREE.Material & { onBeforeCompile: (s: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void }

const GLSL = /* glsl */ `
vec3 paintGrade(vec3 c, vec2 g){ float l = dot(c, vec3(.2126, .7152, .0722)); return max(mix(vec3(l), c, g.y), 0.0) * g.x; }`

const slotUniforms = (i: number) => `uniform sampler2D uPaintMap${i}, uPaintClear${i}, uPaintDepth${i}; uniform mat4 uPaintVP${i}; uniform vec3 uPaintLens${i};`

// One painting's share of a surface point. `uPaintLens` is (in use, sharpness, has a cloth-free twin).
const slotSurface = (i: number) => /* glsl */ `{
 vec4 pc = uPaintVP${i} * vec4(vPaintWorld, 1.0);
 vec2 puv = pc.xy / max(pc.w, 1e-4) * .5 + .5;
 float e = min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y));
 float inside = uPaintLens${i}.x * step(0.0, pc.w) * step(0.0, e);
 vec3 saw = texture2D(uPaintDepth${i}, puv).rgb;
 float vis = inside * (1.0 - smoothstep(.006, .03, (pc.w - saw.r) / max(pc.w, 1e-4)));
 float rim = inside * smoothstep(0.0, .004, e);
 vec3 tx = texture2D(uPaintMap${i}, puv).rgb;
#ifndef PAINT_CLOTH
 { float cov = saw.b * uPaintLens${i}.z;
   vis = mix(vis, inside * (1.0 - smoothstep(.006, .03, (pc.w - saw.g) / max(pc.w, 1e-4))), cov);
   tx = mix(tx, texture2D(uPaintClear${i}, puv).rgb, cov); }
#endif
 float edge = smoothstep(0.0, .06, e);
 float a = pow(vis * edge * paintFacing * uPaintLens${i}.y / paintDist, 4.0) + 1e-9 * vis * edge;
 float f = pow(rim * uPaintLens${i}.y / paintDist, 4.0) + 1e-9 * rim;
 paintSum += a * tx; paintW += a; paintSeen = max(paintSeen, vis * edge);
 fillSum += f * tx; fillW += f; paintIn = max(paintIn, rim); }`

const slotSky = (i: number) => /* glsl */ `{
 vec4 pc = uPaintVP${i} * vec4(vPaintWorld, 1.0);
 vec2 puv = pc.xy / max(pc.w, 1e-4) * .5 + .5;
 float e = min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y));
 float inside = uPaintLens${i}.x * step(0.0, pc.w) * smoothstep(0.0, .004, e);
 float cov = texture2D(uPaintDepth${i}, puv).b * uPaintLens${i}.z;
 vec3 tx = mix(texture2D(uPaintMap${i}, puv).rgb, texture2D(uPaintClear${i}, puv).rgb, cov);
 float a = inside * (pow(uPaintLens${i}.y, 4.0) * smoothstep(0.0, .06, e) + 1e-6);
 paintSum += a * tx; paintW += a; paintIn = max(paintIn, inside); }`

// The set's shadow on a figure. Only figures are in the sun's own shadow map, so that their shadows alone darken the
// paint. What the set would cast on them, an awning's shade or a tower's, comes from a second map: the built set alone,
// seen from the sun, over the ground about the current point.
const SHADE_SIZE = 2048
const SHADE_RADIUS = 40
// How much of the sun the set's shade takes from a figure. Not all: under an awning a painting's own figures would
// still catch light off the ground and the walls, and at full strength the sergeant at his table is a silhouette.
const SHADE_STRENGTH = 0.65
const SHADE_GLSL = /* glsl */ `
uniform sampler2D uSetShadeMap; uniform mat4 uSetShadeView; uniform float uSetShadeOn;
float setShade(vec3 viewPosition){
 vec3 p = (uSetShadeView * vec4(viewPosition, 1.0)).xyz * .5 + .5;
 float e = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
 if (uSetShadeOn < .5 || e < 0.0 || p.z > 1.0) return 1.0;
 float lit = 0.0;
 for (int k = 0; k < 4; k++) {
  vec2 o = vec2(k == 0 || k == 2 ? -.75 : .75, k < 2 ? -.75 : .75) / ${SHADE_SIZE}.0;
  lit += step(p.z - .0006, textureLod(uSetShadeMap, p.xy + o, 0.0).x); }
 return mix(1.0, lit * .25, uSetShadeOn * smoothstep(0.0, .05, e)); }`
// The sun's light on a figure, dimmed by that shade, where three works out each directional light.
const SHADED_LIGHTS = `float setShadeNow = setShade(-vViewPosition);\n${THREE.ShaderChunk.lights_fragment_begin.replace(
  "getDirectionalLightInfo( directionalLight, directLight );",
  "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= setShadeNow;"
)}`

const slots = (each: (i: number) => string) => Array.from({ length: N }, (_, i) => each(i)).join("\n")

export class Painted {
  readonly points: TripodPoint[]
  // False until the paintings have loaded and their depth is baked, and for good if either fails: the set then shows as
  // built.
  on = false
  point: TripodPoint | null = null
  private paintings = new Map<string, Painting[]>()
  private uniforms: Record<string, { value: unknown }> = {}
  private blank: THREE.DataTexture
  private dome: THREE.Mesh
  private patched = new Set<THREE.Material>()
  private cloths: THREE.Mesh[] = []
  private plate: THREE.Mesh[] = []
  // What stands among the plate's meshes without taking paint: flames, glass, mist.
  private aside: THREE.Mesh[] = []
  private scene: THREE.Scene | null = null
  private hidden: THREE.Object3D[] = []
  private shade = { uSetShadeMap: { value: null as THREE.Texture | null }, uSetShadeView: { value: new THREE.Matrix4() }, uSetShadeOn: { value: 0 } }
  private shadeTarget: THREE.WebGLRenderTarget | null = null
  private shadeCamera = new THREE.OrthographicCamera(-SHADE_RADIUS, SHADE_RADIUS, SHADE_RADIUS, -SHADE_RADIUS, 1, 700)
  private shadeMatrix = new THREE.Matrix4()
  private shadeDepth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide })
  // The ground the sun's shadows are worked out over: about the current point, more of it ahead than behind.
  readonly shadeBox = { center: new THREE.Vector3(), radius: SHADE_RADIUS }

  constructor(
    private renderer: THREE.WebGLRenderer,
    private spec: Spec,
    private shared: SharedUniforms,
    skyRadius: number,
    // Toward the sun.
    private sun: THREE.Vector3
  ) {
    this.points = tripodPoints(spec)
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this.blank.needsUpdate = true
    this.uniforms.uPaintPos = { value: new THREE.Vector3() }
    this.uniforms.uPaintGrade = { value: new THREE.Vector2(spec.gain, spec.sat) }
    this.uniforms.uPaintShadow = { value: spec.shadows }
    for (let i = 0; i < N; i++) {
      this.uniforms[`uPaintMap${i}`] = { value: this.blank }
      this.uniforms[`uPaintClear${i}`] = { value: this.blank }
      this.uniforms[`uPaintDepth${i}`] = { value: this.blank }
      this.uniforms[`uPaintVP${i}`] = { value: new THREE.Matrix4() }
      this.uniforms[`uPaintLens${i}`] = { value: new THREE.Vector3() }
    }
    // The paintings' sky, on a dome just inside the engine's own: the same projection, cut at each frame's edge.
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(skyRadius * 0.9, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        vertexShader: "varying vec3 vPaintWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vPaintWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader: `varying vec3 vPaintWorld; uniform vec2 uPaintGrade;
${slots(slotUniforms)}
${GLSL}
void main(){ vec3 paintSum = vec3(0.0); float paintW = 0.0; float paintIn = 0.0;
${slots(slotSky)}
 gl_FragColor = vec4(paintGrade(paintSum / max(paintW, 1e-12), uPaintGrade), paintIn); }`,
      })
    )
    this.dome.name = "painted-sky"
    this.dome.renderOrder = -0.5
    this.dome.frustumCulled = false
    this.dome.visible = false
  }

  // The built set's own surfaces take the paint: its merged statics, its standalone pieces and the land. See-through
  // things (flames, glass, mist) stay as built and play over it.
  patch(root: THREE.Object3D[]) {
    const visit = (o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
        let takes = false
        for (const m of materials) {
          if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) || m.transparent) continue
          takes = true
          if (m.userData.sway) this.cloths.push(o)
          if (!this.patched.has(m)) this.patchMaterial(m as Patched)
        }
        if (takes) this.plate.push(o)
        else this.aside.push(o)
      }
      for (const c of o.children) visit(c)
    }
    for (const o of root) visit(o)
  }

  private patchMaterial(m: Patched) {
    this.patched.add(m)
    const before = m.onBeforeCompile
    const key = m.customProgramCacheKey.bind(m)
    const cloth = !!m.userData.sway
    m.onBeforeCompile = (s, renderer) => {
      before.call(m, s, renderer)
      Object.assign(s.uniforms, this.uniforms)
      // Cloth blows in the wind. Its paint is looked up from where each point of it hung when the paintings were made, at
      // time 0, so a banner carries its paint as it moves.
      const at = cloth ? "position + clothWind(position, objectNormal, 0.0)" : "transformed"
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPaintWorld;").replace(
        "#include <project_vertex>",
        `#include <project_vertex>
{ vec4 paintAt = vec4(${at}, 1.0);
#ifdef USE_BATCHING
 paintAt = batchingMatrix * paintAt;
#endif
#ifdef USE_INSTANCING
 paintAt = instanceMatrix * paintAt;
#endif
 vPaintWorld = (modelMatrix * paintAt).xyz; }`
      )
      const lit = s.fragmentShader.includes("#include <shadowmap_pars_fragment>")
      s.fragmentShader = s.fragmentShader
        .replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>")
        .replace(
          "#include <common>",
          `#include <common>
${cloth ? "#define PAINT_CLOTH" : ""}
varying vec3 vPaintWorld; uniform vec3 uPaintPos; uniform vec2 uPaintGrade; uniform float uPaintShadow;
${slots(slotUniforms)}
${GLSL}`
        )
        .replace(
          "#include <premultiplied_alpha_fragment>",
          `{ vec3 paintTo = uPaintPos - vPaintWorld;
 float paintDist = max(length(paintTo), .5);
 float paintFacing = abs(dot(normalize(cross(dFdx(vPaintWorld), dFdy(vPaintWorld))), paintTo / max(length(paintTo), 1e-4)));
 vec3 paintSum = vec3(0.0); float paintW = 0.0; float paintSeen = 0.0;
 vec3 fillSum = vec3(0.0); float fillW = 0.0; float paintIn = 0.0;
${slots(slotSurface)}
 vec3 paint = mix(paintGrade(fillSum / max(fillW, 1e-20), uPaintGrade), paintGrade(paintSum / max(paintW, 1e-12), uPaintGrade), paintSeen);
 ${lit ? "paint *= mix(1.0, getShadowMask(), uPaintShadow);" : ""}
 gl_FragColor.rgb = mix(gl_FragColor.rgb, paint, max(paintSeen, paintIn)); }
#include <premultiplied_alpha_fragment>`
        )
    }
    m.customProgramCacheKey = () => `${key()}|painted`
    m.needsUpdate = true
  }

  // Loads every painting. Rejects if one is missing: the stage then shows the set as built.
  async load(anisotropy: number) {
    const loader = new THREE.TextureLoader()
    const texture = async (url: string) => {
      const t = await loader.loadAsync(url)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = anisotropy
      return t
    }
    await Promise.all(
      this.points.map(async (point) => {
        const specs = this.spec.points[point.name].paintings
        const list = await Promise.all(
          specs.map(async (p, i): Promise<Painting> => {
            const [map, clear] = await Promise.all([texture(p.map), p.clear ? texture(p.clear) : null])
            const camera = new THREE.PerspectiveCamera(p.fov, p.aspect, 0.2, FAR)
            camera.position.copy(point.position)
            camera.quaternion.copy(point.frames[i].quaternion)
            camera.updateMatrixWorld(true)
            camera.updateProjectionMatrix()
            return { map, clear, depth: null, camera, viewProjection: new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), lens: 1 / point.frames[i].tanY }
          })
        )
        this.paintings.set(point.name, list)
      })
    )
  }

  // What each painting's camera saw of the built set. `hidden` is everything that was not in its plate: cast, crowd,
  // effects, birds, the sky. Plates are made with motion off, which holds the wind at time 0, so depth is taken there.
  bake(scene: THREE.Scene, hidden: THREE.Object3D[]) {
    this.scene = scene
    this.hidden = hidden
    const r = this.renderer
    const hide = [...hidden, this.dome]
    const was = hide.map((h) => h.visible)
    for (const h of hide) h.visible = false
    const prev = r.getRenderTarget()
    const now = this.shared.time.value
    this.shared.time.value = 0
    const pack = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tA: { value: null }, tB: { value: null }, uHasB: { value: 0 }, uNear: { value: 0.2 }, uFar: { value: FAR } },
        depthTest: false,
        depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        // b is 1 where the plate had loose cloth in front of this spot, or within a few pixels of it, since a painter's
        // flag is never quite where the plate's was.
        fragmentShader: `varying vec2 vUv; uniform sampler2D tA, tB; uniform float uHasB, uNear, uFar;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main(){ float a = lin(texture2D(tA, vUv).x); float b = a; float cov = 0.0;
 if (uHasB > .5) { b = lin(texture2D(tB, vUv).x);
  for (int k = 0; k < 5; k++) { vec2 q = vUv + (k == 0 ? vec2(0.0) : k == 1 ? vec2(.004, 0.0) : k == 2 ? vec2(-.004, 0.0) : k == 3 ? vec2(0.0, .004) : vec2(0.0, -.004));
   cov = max(cov, step(lin(texture2D(tA, q).x), lin(texture2D(tB, q).x) * .985 - .02)); } }
 gl_FragColor = vec4(a, b, cov, 1.0); }`,
      })
    )
    const u = (pack.material as THREE.ShaderMaterial).uniforms
    try {
      for (const list of this.paintings.values())
        for (const p of list) {
          const w = DEPTH_WIDTH
          const h = Math.round(w / p.camera.aspect)
          const target = () => new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType) })
          const a = target()
          r.setRenderTarget(a)
          r.clear()
          r.render(scene, p.camera)
          let b: THREE.WebGLRenderTarget | null = null
          if (p.clear) {
            b = target()
            for (const c of this.cloths) c.visible = false
            r.setRenderTarget(b)
            r.clear()
            r.render(scene, p.camera)
            for (const c of this.cloths) c.visible = true
          }
          p.depth = new THREE.WebGLRenderTarget(w, h, {
            type: THREE.HalfFloatType,
            format: b ? THREE.RGBAFormat : THREE.RedFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
          })
          u.tA.value = a.depthTexture
          u.tB.value = b?.depthTexture ?? a.depthTexture
          u.uHasB.value = b ? 1 : 0
          r.setRenderTarget(p.depth)
          pack.render(r)
          a.dispose()
          a.depthTexture?.dispose()
          b?.dispose()
          b?.depthTexture?.dispose()
        }
    } finally {
      r.setRenderTarget(prev)
      this.shared.time.value = now
      pack.material.dispose()
      pack.dispose()
      hide.forEach((h, i) => {
        h.visible = was[i]
      })
    }
    // Only figures throw sun shadows from here on: a painting carries the set's own, and replaces its light.
    for (const m of this.plate) m.castShadow = false
    scene.add(this.dome)
    this.dome.visible = true
    this.on = true
  }

  // The paintings of the point the camera now stands at.
  setPoint(point: TripodPoint) {
    this.point = point
    const list = this.paintings.get(point.name) ?? []
    ;(this.uniforms.uPaintPos.value as THREE.Vector3).copy(point.position)
    this.dome.position.copy(point.position)
    this.dome.updateMatrixWorld(true)
    for (let i = 0; i < N; i++) {
      const p = list[i]
      this.uniforms[`uPaintMap${i}`].value = p?.map ?? this.blank
      this.uniforms[`uPaintClear${i}`].value = p?.clear ?? p?.map ?? this.blank
      this.uniforms[`uPaintDepth${i}`].value = p?.depth?.texture ?? this.blank
      if (p) (this.uniforms[`uPaintVP${i}`].value as THREE.Matrix4).copy(p.viewProjection)
      ;(this.uniforms[`uPaintLens${i}`].value as THREE.Vector3).set(p ? 1 : 0, p?.lens ?? 0, p?.clear ? 1 : 0)
    }
    this.renderShade(point)
  }

  // Figures take the set's shade (see SHADE_GLSL): every lit material under `roots`, the cast's cards and the crowd's.
  shadeFigures(roots: THREE.Object3D[]) {
    const done = new Set<THREE.Material>()
    for (const root of roots)
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as Patched[]) {
          if (!(m instanceof THREE.MeshStandardMaterial) || done.has(m)) continue
          done.add(m)
          const before = m.onBeforeCompile
          const key = m.customProgramCacheKey.bind(m)
          m.onBeforeCompile = (s, renderer) => {
            before.call(m, s, renderer)
            Object.assign(s.uniforms, this.shade)
            s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\n${SHADE_GLSL}`).replace("#include <lights_fragment_begin>", SHADED_LIGHTS)
          }
          m.customProgramCacheKey = () => `${key()}|shade`
          m.needsUpdate = true
        }
      })
  }

  // The set's shade about a point: the built set alone, seen from the sun.
  private renderShade(point: TripodPoint) {
    if (!this.scene) return
    const r = this.renderer
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(point.frames[0].quaternion).setY(0)
    if (ahead.lengthSq() > 1e-6) ahead.normalize()
    const center = this.shadeBox.center
      .copy(point.position)
      .setY(0)
      .addScaledVector(ahead, SHADE_RADIUS * 0.6)
    const cam = this.shadeCamera
    cam.position.copy(center).addScaledVector(this.sun, 300)
    cam.lookAt(center)
    cam.updateMatrixWorld(true)
    this.shadeMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    this.shadeTarget ??= new THREE.WebGLRenderTarget(SHADE_SIZE, SHADE_SIZE, { depthTexture: new THREE.DepthTexture(SHADE_SIZE, SHADE_SIZE) })
    const hide = [...this.hidden, this.dome, ...this.aside]
    const was = hide.map((h) => h.visible)
    for (const h of hide) h.visible = false
    const prev = r.getRenderTarget()
    const auto = r.shadowMap.autoUpdate
    r.shadowMap.autoUpdate = false
    this.scene.overrideMaterial = this.shadeDepth
    try {
      r.setRenderTarget(this.shadeTarget)
      r.clear()
      r.render(this.scene, cam)
    } finally {
      this.scene.overrideMaterial = null
      r.shadowMap.autoUpdate = auto
      r.setRenderTarget(prev)
      hide.forEach((h, i) => {
        h.visible = was[i]
      })
    }
    this.shade.uSetShadeMap.value = this.shadeTarget.depthTexture
    this.shade.uSetShadeOn.value = SHADE_STRENGTH
  }

  // Once a frame: the way from the camera's own space into the shade map.
  frame(camera: THREE.Camera) {
    this.shade.uSetShadeView.value.multiplyMatrices(this.shadeMatrix, camera.matrixWorld)
  }

  dispose() {
    this.dome.removeFromParent()
    this.dome.geometry.dispose()
    ;(this.dome.material as THREE.Material).dispose()
    this.blank.dispose()
    this.shadeTarget?.depthTexture?.dispose()
    this.shadeTarget?.dispose()
    this.shadeDepth.dispose()
    for (const list of this.paintings.values())
      for (const p of list) {
        p.map.dispose()
        p.clear?.dispose()
        p.depth?.dispose()
      }
  }
}
