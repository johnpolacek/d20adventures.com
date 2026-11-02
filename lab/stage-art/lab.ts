// Browser half of the stage art spikes: changes applied to a running Stage from outside packages/stage.
//   (a) addBackdrop: a painted, keyed panorama on a far cylinder, standing in for the set's mountain cones.
//   (b) projectPaintings: paintings projected from the cameras they were made for onto the static surfaces those saw.
//   (c) animateStandee: a looping colour-and-alpha video on a cast member's front card.

import type { Stage } from "@d20/stage"
import * as THREE from "three"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"

export interface Projector {
  position: number[]
  quaternion: number[]
  fov: number
  aspect: number
  near: number
  far: number
}

export function cameraOf(stage: Stage): Projector {
  const c = stage.camera
  return { position: c.position.toArray(), quaternion: c.quaternion.toArray(), fov: c.fov, aspect: c.aspect, near: c.near, far: c.far }
}

const loadTexture = async (url: string, stage: Stage) => {
  const t = await new THREE.TextureLoader().loadAsync(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = stage.renderer.capabilities.getMaxAnisotropy()
  return t
}

// The scene renders into a linear HDR target that the output pass tone maps (AgX). A painting is already display colour,
// so it is lifted by `gain` and `sat` to come out of the tone map near where it went in. Both are tuned by eye.
const GRADE = `vec3 labGrade(vec3 c, float gain, float sat){ float l = dot(c, vec3(.2126, .7152, .0722)); return max(mix(vec3(l), c, sat), 0.0) * gain; }`

// (a) The painting covers `arc` degrees centred on `yaw` (0 looks down -z), from `bottom` to `top` degrees of elevation
// seen from the set's centre. Whatever lies below the horizon is hidden by the land in front of it. The side edges fade
// out over `feather` of the width. Unlit, unfogged except for `haze` toward the fog colour, drawn behind everything.
export async function addBackdrop(
  stage: Stage,
  o: { url: string; arc: number; yaw?: number; radius?: number; bottom?: number; top?: number; feather?: number; gain?: number; sat?: number; haze?: number }
) {
  const tex = await loadTexture(o.url, stage)
  const radius = o.radius ?? 520
  const arc = THREE.MathUtils.degToRad(o.arc)
  const y0 = radius * Math.tan(THREE.MathUtils.degToRad(o.bottom ?? -16))
  const y1 = radius * Math.tan(THREE.MathUtils.degToRad(o.top ?? 30))
  const geo = new THREE.CylinderGeometry(radius, radius, y1 - y0, 160, 1, true, Math.PI + THREE.MathUtils.degToRad(o.yaw ?? 0) - arc / 2, arc)
  geo.translate(0, (y0 + y1) / 2, 0)
  const fog = stage.scene.fog as THREE.FogExp2
  const uniforms = {
    uMap: { value: tex },
    uGain: { value: o.gain ?? 0.6 },
    uSat: { value: o.sat ?? 1 },
    uHaze: { value: o.haze ?? 0.3 },
    uFeather: { value: o.feather ?? 0.06 },
    uFog: { value: fog.color },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = vec2(1.0 - uv.x, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform float uGain, uSat, uHaze, uFeather; uniform vec3 uFog;
${GRADE}
void main(){ vec4 c = texture2D(uMap, vUv); vec3 rgb = mix(labGrade(c.rgb, uGain, uSat), uFog, uHaze);
 float edge = smoothstep(0.0, uFeather, min(vUv.x, 1.0 - vUv.x));
 gl_FragColor = vec4(rgb, c.a * edge); }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = "lab:backdrop"
  mesh.frustumCulled = false
  stage.scene.add(mesh)
  return { mesh, uniforms }
}

type Patched = THREE.Material & { onBeforeCompile: (s: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void }

// (b) Projects paintings onto the static set, each from the camera it was painted for. A depth map from each projector
// decides what it saw. Where several saw a surface, the one that saw it closest and most squarely wins, with a soft
// join, and each fades out toward the edge of its own frame. Surfaces a projector saw edge-on fade out of it when `fade` is 1, and show its stretched paint when it is 0.
// With `shadows`, only cast and crowd throw sun shadows, and those darken the paint: a painting carries the set's own
// shadows already, and replaces the engine's light where it lands. A value over 5 draws the shadow mask itself, to check it.
export async function projectPaintings(stage: Stage, list: { url: string; cam: Projector }[], o: { gain?: number; sat?: number; fade?: number; shadows?: number; fill?: number; bare?: number } = {}) {
  const hidden = [stage.standees.group, stage.crowd.group, stage.effects.group, ...stage.scene.children.filter((c) => c instanceof THREE.Mesh && (c.renderOrder < 0 || c.name.startsWith("lab:")))]
  const was = hidden.map((h) => h.visible)
  for (const h of hidden) h.visible = false
  const r = stage.renderer
  const prev = r.getRenderTarget()
  // Plates are captured with motion off, which holds the wind at time 0: the projectors see the cloth in that pose too.
  const clock = (stage as unknown as { shared: { time: { value: number } } }).shared.time
  const now = clock.value
  clock.value = 0
  const uniforms: Record<string, { value: unknown }> = {
    uLabGain: { value: o.gain ?? 1.3 },
    uLabSat: { value: o.sat ?? 0.9 },
    uLabFade: { value: o.fade ?? 1 },
    uLabShadow: { value: o.shadows ?? 0 },
    // Fill: where the camera has drifted to see a surface no painting saw, the nearest painting's paint runs on over it.
    // Bare: those surfaces in flat magenta, to count them.
    uLabFill: { value: o.fill ?? 0 },
    uLabBare: { value: o.bare ?? 0 },
    uLabOn: { value: 1 },
  }
  const cams: THREE.PerspectiveCamera[] = []
  for (const [i, p] of list.entries()) {
    const cam = new THREE.PerspectiveCamera(p.cam.fov, p.cam.aspect, Math.max(p.cam.near, 0.2), Math.min(p.cam.far, 1500))
    cam.position.fromArray(p.cam.position)
    cam.quaternion.fromArray(p.cam.quaternion)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
    cams.push(cam)
    // What the projector saw: depth of the set alone, without cast, crowd, effects or sky.
    const W = 2048
    const rt = new THREE.WebGLRenderTarget(W, Math.round(W / p.cam.aspect), { depthTexture: new THREE.DepthTexture(W, Math.round(W / p.cam.aspect), THREE.FloatType) })
    r.setRenderTarget(rt)
    r.clear()
    r.render(stage.scene, cam)
    uniforms[`uLabMap${i}`] = { value: await loadTexture(p.url, stage) }
    uniforms[`uLabDepth${i}`] = { value: rt.depthTexture }
    uniforms[`uLabVP${i}`] = { value: new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse) }
    uniforms[`uLabPos${i}`] = { value: cam.position.clone() }
    // near, far, and how many texels a metre covers at one metre: a painting's sharpness on a surface.
    uniforms[`uLabLens${i}`] = { value: new THREE.Vector3(cam.near, cam.far, 1 / Math.tan(THREE.MathUtils.degToRad(p.cam.fov / 2))) }
  }
  r.setRenderTarget(prev)
  clock.value = now
  hidden.forEach((h, i) => {
    h.visible = was[i]
  })

  const skip = new Set<THREE.Object3D>([stage.standees.group, stage.crowd.group, stage.effects.group])
  const patched = new Set<THREE.Material>()
  let skipped = 0
  const decl = list.map((_, i) => `uniform sampler2D uLabMap${i}, uLabDepth${i}; uniform mat4 uLabVP${i}; uniform vec3 uLabPos${i}, uLabLens${i};`).join("\n")
  const each = list
    .map(
      (_, i) => `{ vec4 pc = uLabVP${i} * vec4(vLabWorld, 1.0);
 vec3 ndc = pc.xyz / max(pc.w, 1e-4);
 vec2 puv = ndc.xy * .5 + .5;
 vec3 to = uLabPos${i} - vLabWorld;
 float facing = abs(dot(labN, normalize(to)));
 float here = labLin(ndc.z * .5 + .5, uLabLens${i}.x, uLabLens${i}.y);
 float inside = step(0.0, pc.w) * step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
 float vis = inside * (1.0 - smoothstep(.006, .03, (here - labLin(texture2D(uLabDepth${i}, puv).x, uLabLens${i}.x, uLabLens${i}.y)) / here));
 vis *= mix(1.0, smoothstep(.06, .28, facing), uLabFade);
 float edge = smoothstep(0.0, 0.06, min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y)));
 float w = pow(vis * edge * facing * uLabLens${i}.z / max(length(to), 0.5), 4.0) + 1e-9 * vis * edge;
 vec3 tx = texture2D(uLabMap${i}, puv).rgb;
 float rim = inside * smoothstep(0.0, 0.004, min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y)));
 float fw = pow(rim * uLabLens${i}.z / max(length(to), 0.5), 4.0) + 1e-9 * rim;
 labSum += w * tx; labW += w; labVis = max(labVis, vis * edge);
 labFillSum += fw * tx; labFillW += fw; labIn = max(labIn, rim); }`
    )
    .join("\n")
  const visit = (o3: THREE.Object3D) => {
    if (skip.has(o3)) return
    if (o3 instanceof THREE.Mesh) {
      // Only figures throw sun shadows from here on (see above).
      if (o.shadows) o3.castShadow = false
      for (const m of Array.isArray(o3.material) ? o3.material : [o3.material]) {
        if (patched.has(m)) continue
        if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) || m.transparent) {
          skipped++
          continue
        }
        patch(m as Patched)
        patched.add(m)
      }
    }
    for (const c of o3.children) visit(c)
  }
  const patch = (m: Patched) => {
    const before = m.onBeforeCompile
    const key = m.customProgramCacheKey.bind(m)
    m.onBeforeCompile = (s, renderer) => {
      before.call(m, s, renderer)
      Object.assign(s.uniforms, uniforms)
      // Cloth blows in the wind. Paint is looked up from where each point of it hung in the plate, at time 0, so a
      // banner carries its paint as it moves instead of sliding under it.
      const blown = /#include <begin_vertex>\n(float ph = [\s\S]*?\(1\.0 \+ sin\(uTime \* \.9 \+ ph\)\);)/.exec(s.vertexShader)
      const held = blown
        ? `vec3 labAt = vec3(position);\n${blown[1]
            .replace(/\bph\b/g, "labPh")
            .replace(/\bwv\b/g, "labWv")
            .replace(/\bwdir\b/g, "labDir")
            .replace(/\btransformed\b/g, "labAt")
            .replace(/\buTime\b/g, "0.0")}`
        : "vec3 labAt = transformed;"
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLabWorld;").replace(
        "#include <project_vertex>",
        `#include <project_vertex>
${held}
{ vec4 w = vec4(labAt, 1.0);
#ifdef USE_BATCHING
 w = batchingMatrix * w;
#endif
#ifdef USE_INSTANCING
 w = instanceMatrix * w;
#endif
 vLabWorld = (modelMatrix * w).xyz; }`
      )
      const lit = s.fragmentShader.includes("#include <shadowmap_pars_fragment>")
      s.fragmentShader = s.fragmentShader
        .replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>")
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vLabWorld; uniform float uLabGain, uLabSat, uLabFade, uLabShadow, uLabOn, uLabFill, uLabBare;
${decl}
float labLin(float d, float near, float far){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
${GRADE}`
        )
        .replace(
          "#include <premultiplied_alpha_fragment>",
          `{ vec3 labN = normalize(cross(dFdx(vLabWorld), dFdy(vLabWorld)));
 vec3 labSum = vec3(0.0); float labW = 0.0; float labVis = 0.0;
 vec3 labFillSum = vec3(0.0); float labFillW = 0.0; float labIn = 0.0;
${each}
 vec3 paint = labGrade(labSum / max(labW, 1e-12), uLabGain, uLabSat);
 paint = mix(paint, mix(labGrade(labFillSum / max(labFillW, 1e-20), uLabGain, uLabSat), paint, labVis), uLabFill);
 ${lit ? "paint *= mix(1.0, getShadowMask(), uLabShadow); if (uLabShadow > 5.0) { paint = vec3(getShadowMask()); labVis = 1.0; }" : ""}
 float labCover = max(labVis, uLabFill * labIn);
 if (uLabBare > .5 && labVis < .5) { paint = vec3(1.0, 0.0, 1.0); labCover = 1.0; }
 gl_FragColor.rgb = mix(gl_FragColor.rgb, paint, labCover * uLabOn); }
#include <premultiplied_alpha_fragment>`
        )
    }
    m.customProgramCacheKey = () => `${key()}|lab-project-held-${list.length}`
    m.needsUpdate = true
  }
  visit(stage.world)

  // The first painting's sky, on a dome just inside the engine's own: the same projection, cut at the frame's edges, so
  // a camera that turns away finds the engine's sky again. A wide fade there shows as a frame from the painting's own shot.
  const skyRadius = (((stage as unknown as { sky: THREE.Mesh }).sky.geometry as THREE.SphereGeometry).parameters.radius ?? 1000) * 0.9
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(skyRadius, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uLabMap: uniforms.uLabMap0, uLabVP: uniforms.uLabVP0, uLabGain: uniforms.uLabGain, uLabSat: uniforms.uLabSat, uLabOn: uniforms.uLabOn },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: "varying vec3 vLabWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vLabWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `varying vec3 vLabWorld; uniform sampler2D uLabMap; uniform mat4 uLabVP; uniform float uLabGain, uLabSat, uLabOn;
${GRADE}
void main(){ vec4 pc = uLabVP * vec4(vLabWorld, 1.0); vec2 puv = pc.xy / max(pc.w, 1e-4) * .5 + .5;
 float edge = min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y));
 gl_FragColor = vec4(labGrade(texture2D(uLabMap, puv).rgb, uLabGain, uLabSat), step(0.0, pc.w) * smoothstep(0.0, 0.004, edge) * uLabOn); }`,
    })
  )
  dome.name = "lab:sky"
  dome.position.copy(cams[0].position)
  dome.renderOrder = -0.5
  dome.frustumCulled = false
  stage.scene.add(dome)
  return { uniforms, patched: patched.size, skipped }
}

// A tripod that sways: the camera wanders up to `amp` metres from where it stands, sideways most, a little up and down
// and in and out, and keeps looking at its target. Paint sits on real shapes, so near things slide against far ones.
export function drift(stage: Stage, amp: number, period = 8) {
  const base = stage.camera.position.clone()
  const target = stage.controls ? stage.controls.target.clone() : stage.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(base)
  const fwd = target.clone().sub(base).normalize()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
  const t0 = performance.now()
  let raf = 0
  const at = (t: number) =>
    base
      .clone()
      .addScaledVector(right, amp * Math.sin((2 * Math.PI * t) / period))
      .addScaledVector(new THREE.Vector3(0, 1, 0), amp * 0.35 * Math.sin((2 * Math.PI * t) / (period * 0.62)))
      .addScaledVector(fwd, amp * 0.5 * Math.sin((2 * Math.PI * t) / (period * 1.37)))
  const tick = () => {
    stage.camera.position.copy(at((performance.now() - t0) / 1000))
    stage.camera.lookAt(target)
    raf = requestAnimationFrame(tick)
  }
  tick()
  return {
    stop: () => {
      cancelAnimationFrame(raf)
      stage.camera.position.copy(base)
      stage.camera.lookAt(target)
    },
  }
}

// (c) The video holds colour on its left half and alpha on its right. Each new video frame is unpacked into a half-float
// target with mipmaps, which becomes the card's front art; the normal map is rebuilt from the clip's first frame.
export async function animateStandee(stage: Stage, castId: string, base: string) {
  const s = stage.standees.items.get(castId)
  if (!s) throw new Error(`No cast member ${castId}`)
  const meta = (await (await fetch(`${base}.json`)).json()) as { width: number; height: number }
  const video = document.createElement("video")
  video.src = `${base}.mp4`
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  await video.play()
  // Decoded from sRGB in the shader below: a video texture's colour space is not reliably decoded on upload.
  const vt = new THREE.VideoTexture(video)
  vt.colorSpace = THREE.NoColorSpace
  const target = new THREE.WebGLRenderTarget(meta.width, meta.height, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
  target.texture.anisotropy = stage.renderer.capabilities.getMaxAnisotropy()
  const quad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { uVideo: { value: vt } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `varying vec2 vUv; uniform sampler2D uVideo;
vec3 lin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
void main(){ vec3 c = lin(texture2D(uVideo, vec2(vUv.x * .5, vUv.y)).rgb); float a = texture2D(uVideo, vec2(.5 + vUv.x * .5, vUv.y)).g; gl_FragColor = vec4(c, a); }`,
    })
  )
  const r = stage.renderer
  const draw = () => {
    const prev = r.getRenderTarget()
    r.setRenderTarget(target)
    quad.render(r)
    r.setRenderTarget(prev)
  }
  let alive = true
  const onFrame = () => {
    if (!alive) return
    draw()
    video.requestVideoFrameCallback(onFrame)
  }
  video.requestVideoFrameCallback(onFrame)
  draw()
  const still = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = `${base}-still.webp`
  })
  const normal = pillowNormals(still)
  const st = s as unknown as { map?: THREE.Texture; normal?: THREE.Texture; aspect: number }
  st.map = target.texture
  st.normal = normal
  st.aspect = meta.width / meta.height
  s.mat.map = target.texture
  s.depth.map = target.texture
  s.mat.normalMap = normal
  s.mat.needsUpdate = s.depth.needsUpdate = true
  s.mesh.scale.set(s.cast.height * st.aspect, s.cast.height, 1)
  return {
    video,
    stop: () => {
      alive = false
      video.pause()
    },
  }
}

// A soft rounded relief from the silhouette (a blurred alpha as height), close to the standee's own normal map.
function pillowNormals(img: HTMLImageElement) {
  const H = 256
  const W = Math.max(8, Math.round((H * img.width) / img.height))
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.filter = "blur(10px)"
  cx.drawImage(img, 0, 0, W, H)
  const px = cx.getImageData(0, 0, W, H).data
  const at = (x: number, y: number) => px[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + 3] / 255
  const out = cx.createImageData(W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * 6
      const ny = (at(x, y + 1) - at(x, y - 1)) * 6
      const l = Math.hypot(nx, ny, 1)
      const o = (y * W + x) * 4
      out.data[o] = (nx / l / 2 + 0.5) * 255
      out.data[o + 1] = (ny / l / 2 + 0.5) * 255
      out.data[o + 2] = (1 / l / 2 + 0.5) * 255
      out.data[o + 3] = 255
    }
  cx.putImageData(out, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

// Environment spike, splat track: the set as a 360 degree panorama from `pos`, in colour or as depth. Six 90 degree
// faces are rendered without cast, crowd or effects and resampled to an equirectangular image on the CPU. The image
// centre looks down -z.
//   colour: the scene's linear light, tone mapped simply. A layout guide for an image model, not a finished frame.
//   depth:  World Labs' web-chisel-depth-png encoding: log distance between zMin and zMax, near white, far and sky black.
export async function pano(stage: Stage, pos: [number, number, number], kind: "color" | "depth", width = 2048) {
  const face = Math.round(width / 4 / 64) * 64 + 64
  const near = 0.2
  const far = 420
  const r = stage.renderer
  const sceneRt = new THREE.WebGLRenderTarget(face, face, { type: THREE.FloatType, depthTexture: new THREE.DepthTexture(face, face, THREE.FloatType) })
  const outRt = new THREE.WebGLRenderTarget(face, face, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  const quad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: sceneRt.depthTexture }, uNear: { value: near }, uFar: { value: far } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDepth; uniform float uNear, uFar;
void main(){ float d = texture2D(tDepth, vUv).x; if (d >= 0.99999) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
 float z = d * 2.0 - 1.0; float viewZ = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
 gl_FragColor = vec4(viewZ * length(vec3(vUv * 2.0 - 1.0, 1.0)), 0.0, 0.0, 1.0); }`,
    })
  )
  const sky = stage.scene.children.filter((c) => c instanceof THREE.Mesh && (c.renderOrder < 0 || c.name.startsWith("lab:")))
  const hidden = [stage.standees.group, stage.crowd.group, stage.effects.group, ...(kind === "depth" ? sky : [])]
  const was = hidden.map((h) => h.visible)
  for (const h of hidden) h.visible = false
  const prev = r.getRenderTarget()
  const dirs: [number, number, number, number, number, number][] = [
    [1, 0, 0, 0, 1, 0],
    [-1, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 1],
    [0, -1, 0, 0, 0, -1],
    [0, 0, 1, 0, 1, 0],
    [0, 0, -1, 0, 1, 0],
  ]
  const faces: { inv: THREE.Matrix4; px: Float32Array }[] = []
  for (const [dx, dy, dz, ux, uy, uz] of dirs) {
    const cam = new THREE.PerspectiveCamera(90, 1, near, kind === "depth" ? far : 2000)
    cam.position.fromArray(pos)
    cam.up.set(ux, uy, uz)
    cam.lookAt(pos[0] + dx, pos[1] + dy, pos[2] + dz)
    cam.updateMatrixWorld(true)
    r.setRenderTarget(sceneRt)
    r.clear()
    r.render(stage.scene, cam)
    if (kind === "depth") {
      r.setRenderTarget(outRt)
      quad.render(r)
    }
    const px = new Float32Array(face * face * 4)
    r.readRenderTargetPixels(kind === "depth" ? outRt : sceneRt, 0, 0, face, face, px)
    faces.push({ inv: new THREE.Matrix4().extractRotation(cam.matrixWorldInverse), px })
  }
  r.setRenderTarget(prev)
  hidden.forEach((h, i) => {
    h.visible = was[i]
  })
  sceneRt.dispose()
  outRt.dispose()
  quad.dispose()

  const height = width / 2
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const cx = canvas.getContext("2d")!
  const img = cx.createImageData(width, height)
  const dist = new Float32Array(kind === "depth" ? width * height : 0)
  const v = new THREE.Vector3()
  // A plain filmic curve and display gamma: close enough to the engine's AgX for a layout guide.
  const tone = (c: number) => 255 * (1 - Math.exp(-Math.max(c, 0) * 1.1)) ** (1 / 2.2)
  let zMin = Infinity
  let zMax = 0
  for (let y = 0; y < height; y++) {
    const phi = ((y + 0.5) / height) * Math.PI
    for (let x = 0; x < width; x++) {
      const theta = ((x + 0.5) / width) * 2 * Math.PI - Math.PI
      const d = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.cos(theta) * Math.sin(phi)]
      let at = 0
      let px = faces[0].px
      let bestZ = 0
      for (const f of faces) {
        v.set(d[0], d[1], d[2]).applyMatrix4(f.inv)
        if (-v.z <= bestZ) continue
        bestZ = -v.z
        const fx = Math.min(face - 1, Math.max(0, Math.floor(((v.x / -v.z) * 0.5 + 0.5) * face)))
        const fy = Math.min(face - 1, Math.max(0, Math.floor(((v.y / -v.z) * 0.5 + 0.5) * face)))
        at = (fy * face + fx) * 4
        px = f.px
      }
      const o = (y * width + x) * 4
      img.data[o + 3] = 255
      if (kind === "color") {
        img.data[o] = tone(px[at])
        img.data[o + 1] = tone(px[at + 1])
        img.data[o + 2] = tone(px[at + 2])
        continue
      }
      const z = px[at]
      dist[y * width + x] = z
      if (z > 0) {
        zMin = Math.min(zMin, z)
        zMax = Math.max(zMax, z)
      }
    }
  }
  if (kind === "depth") {
    const l0 = Math.log(zMin)
    const span = Math.max(Math.log(zMax) - l0, 1e-5)
    for (let i = 0; i < dist.length; i++) {
      const e = dist[i] > 0 ? Math.round(255 * (1 - Math.min(1, Math.max(0, (Math.log(dist[i]) - l0) / span)))) : 0
      img.data.set([e, e, e], i * 4)
    }
  }
  cx.putImageData(img, 0, 0)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/png"))
  return kind === "depth" ? { blob, zMin, zMax } : { blob }
}

// Environment spike, splat track: a Marble splat world drawn by Spark in place of the built set. Cast, crowd and effects
// stay. The world is placed by its panorama point and sized so that point sits at the height it was captured from.
// Splats arrive as display colour, so `gain` lifts them through the tone map, by eye.
export async function addSplat(stage: Stage, base: string, o: { gain?: number; yaw?: number; scale?: number } = {}) {
  const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark")
  const meta = (await (await fetch(`${base}.json`)).json()) as { position: [number, number, number]; eye: number }
  const keep = new Set<THREE.Object3D>([stage.standees.group, stage.crowd.group, stage.effects.group])
  for (const c of stage.world.children) if (!keep.has(c)) c.visible = false
  for (const c of stage.scene.children) if (c instanceof THREE.Mesh && c.renderOrder < 0) c.visible = false
  const spark = new SparkRenderer({ renderer: stage.renderer })
  stage.scene.add(spark)
  const mesh = new SplatMesh({ url: `${base}.spz` })
  await mesh.initialized
  // `eye` is how far the world's ground lies under its panorama point, in its own units (marble.ts measures it).
  const scale = o.scale ?? meta.position[1] / meta.eye
  mesh.scale.setScalar(scale)
  // Marble's raw frame is OpenCV's (y down, z forward): half a turn about x makes it three's.
  mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI, THREE.MathUtils.degToRad(o.yaw ?? 0), 0, "YXZ"))
  mesh.position.fromArray(meta.position)
  mesh.recolor.setScalar(o.gain ?? 1.3)
  mesh.name = "lab:splat"
  stage.scene.add(mesh)
  return { mesh, spark, scale }
}

// Character spike: a rigged, animated glTF figure in place of a cast member's standee, at their spot and facing, scaled
// to their height. It casts and takes the sun's shadow and plays its first clip on its own clock.
export async function addFigure(stage: Stage, url: string, castId: string, o: { yaw?: number; keep?: boolean } = {}) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
  const s = stage.standees.items.get(castId)
  if (!s) throw new Error(`No cast member ${castId}`)
  const gltf = await new GLTFLoader().loadAsync(url)
  const root = gltf.scene
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const scale = s.cast.height / Math.max(box.max.y - box.min.y, 1e-3)
  root.scale.setScalar(scale)
  const lift = -box.min.y * scale
  // Where the cast member stands and faces, followed every frame. A glTF figure faces +z, as the engine's yaw 0 does.
  const place = () => {
    root.position.set(s.cast.x, lift + (s.cast.y ?? 0), s.cast.z)
    root.rotation.y = THREE.MathUtils.degToRad(o.yaw ?? 0) + s.cast.ry
  }
  place()
  let triangles = 0
  root.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return
    m.castShadow = m.receiveShadow = true
    m.frustumCulled = false
    triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3
  })
  root.name = "lab:figure"
  stage.scene.add(root)
  // The standee's own update shows it again every frame, so its group is pinned hidden.
  if (!o.keep) Object.defineProperty(s.grp, "visible", { get: () => false, set: () => {} })
  const mixer = new THREE.AnimationMixer(root)
  if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play()
  let last = performance.now()
  let alive = true
  const tick = (now: number) => {
    if (!alive) return
    mixer.update(Math.min(0.1, (now - last) / 1000))
    place()
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return { root, mixer, triangles, clips: gltf.animations.map((a) => `${a.name} ${a.duration.toFixed(1)}s`), stop: () => (alive = false) }
}
