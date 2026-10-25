// Browser half of the stage art spikes: changes applied to a running Stage from outside packages/stage.
//   (a) addBackdrop: a painted, keyed panorama on a far cylinder, standing in for the set's mountain cones.
//   (b) projectPainting: a painting projected from one camera onto every static surface it saw, the rest left as built.
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

// (b) Projects `url` from `cam` onto the static set. A depth map from the projector decides what it saw; surfaces it saw
// edge-on fade back to their own material when `fade` is 1, and show the stretched paint when it is 0.
export async function projectPainting(stage: Stage, o: { url: string; cam: Projector; gain?: number; sat?: number; fade?: number }) {
  const tex = await loadTexture(o.url, stage)
  const cam = new THREE.PerspectiveCamera(o.cam.fov, o.cam.aspect, Math.max(o.cam.near, 0.2), Math.min(o.cam.far, 1500))
  cam.position.fromArray(o.cam.position)
  cam.quaternion.fromArray(o.cam.quaternion)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()

  // What the projector saw: depth of the set alone, without cast, crowd, effects or sky.
  const W = 2048
  const rt = new THREE.WebGLRenderTarget(W, Math.round(W / o.cam.aspect), { depthTexture: new THREE.DepthTexture(W, Math.round(W / o.cam.aspect), THREE.FloatType) })
  // The sky is the scene's only mesh drawn first; the backdrop spike's cylinder is named.
  const hidden = [stage.standees.group, stage.crowd.group, stage.effects.group, ...stage.scene.children.filter((c) => c instanceof THREE.Mesh && (c.renderOrder < 0 || c.name.startsWith("lab:")))]
  const was = hidden.map((h) => h.visible)
  for (const h of hidden) h.visible = false
  const r = stage.renderer
  const prev = r.getRenderTarget()
  r.setRenderTarget(rt)
  r.clear()
  r.render(stage.scene, cam)
  r.setRenderTarget(prev)
  hidden.forEach((h, i) => {
    h.visible = was[i]
  })

  const uniforms = {
    uLabMap: { value: tex as THREE.Texture },
    uLabDepth: { value: rt.depthTexture as THREE.Texture },
    uLabVP: { value: new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse) },
    uLabPos: { value: cam.position.clone() },
    uLabNear: { value: cam.near },
    uLabFar: { value: cam.far },
    uLabGain: { value: o.gain ?? 1.3 },
    uLabSat: { value: o.sat ?? 0.9 },
    uLabFade: { value: o.fade ?? 1 },
    uLabOn: { value: 1 },
  }
  const skip = new Set<THREE.Object3D>([stage.standees.group, stage.crowd.group, stage.effects.group])
  const patched = new Set<THREE.Material>()
  let skipped = 0
  const visit = (o3: THREE.Object3D) => {
    if (skip.has(o3)) return
    if (o3 instanceof THREE.Mesh)
      for (const m of Array.isArray(o3.material) ? o3.material : [o3.material]) {
        if (patched.has(m)) continue
        if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial) || m.transparent) {
          skipped++
          continue
        }
        patch(m as Patched)
        patched.add(m)
      }
    for (const c of o3.children) visit(c)
  }
  const patch = (m: Patched) => {
    const before = m.onBeforeCompile
    const key = m.customProgramCacheKey.bind(m)
    m.onBeforeCompile = (s, renderer) => {
      before.call(m, s, renderer)
      Object.assign(s.uniforms, uniforms)
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLabWorld;").replace(
        "#include <project_vertex>",
        `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_BATCHING
 w = batchingMatrix * w;
#endif
#ifdef USE_INSTANCING
 w = instanceMatrix * w;
#endif
 vLabWorld = (modelMatrix * w).xyz; }`
      )
      s.fragmentShader = s.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vLabWorld; uniform sampler2D uLabMap, uLabDepth; uniform mat4 uLabVP; uniform vec3 uLabPos; uniform float uLabNear, uLabFar, uLabGain, uLabSat, uLabFade, uLabOn;
float labLin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uLabNear * uLabFar / (uLabFar + uLabNear - z * (uLabFar - uLabNear)); }
${GRADE}`
        )
        .replace(
          "#include <premultiplied_alpha_fragment>",
          `{ vec4 pc = uLabVP * vec4(vLabWorld, 1.0);
 vec3 ndc = pc.xyz / max(pc.w, 1e-4);
 vec2 puv = ndc.xy * .5 + .5;
 vec3 paint = labGrade(texture2D(uLabMap, puv).rgb, uLabGain, uLabSat);
 float seen = texture2D(uLabDepth, puv).x;
 vec3 n = normalize(cross(dFdx(vLabWorld), dFdy(vLabWorld)));
 float facing = abs(dot(n, normalize(uLabPos - vLabWorld)));
 float here = labLin(ndc.z * .5 + .5);
 float inside = step(0.0, pc.w) * step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
 float vis = inside * (1.0 - smoothstep(.006, .03, (here - labLin(seen)) / here));
 vis *= mix(1.0, smoothstep(.06, .28, facing), uLabFade);
 gl_FragColor.rgb = mix(gl_FragColor.rgb, paint, vis * uLabOn); }
#include <premultiplied_alpha_fragment>`
        )
    }
    m.customProgramCacheKey = () => `${key()}|lab-project`
    m.needsUpdate = true
  }
  visit(stage.world)
  return { uniforms, patched: patched.size, skipped }
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
