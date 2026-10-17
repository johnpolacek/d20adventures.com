import * as THREE from "three"
import type { Disposable } from "./life"
import type { SetSpec } from "./spec/set"

type BackdropSpec = NonNullable<SetSpec["backdrop"]>

// The set's painted backdrop: far scenery on an open cylinder round the set's centre, drawn unlit and unfogged after
// everything opaque, so the land in front hides its lower edge and the sky shows through its keyed sky. The side edges
// fade out over `feather` of its width. A painting is already display colour and the scene is tone mapped after (AgX),
// so `gain` lowers it to come out near where it went in, and `haze` blends it toward the fog colour. Both are by eye.
export function backdrop(root: THREE.Object3D, fog: THREE.Color, anisotropy: number, o: BackdropSpec): Disposable & { ready: Promise<void> } {
  const arc = THREE.MathUtils.degToRad(o.arc)
  const y0 = o.radius * Math.tan(THREE.MathUtils.degToRad(o.bottom))
  const y1 = o.radius * Math.tan(THREE.MathUtils.degToRad(o.top))
  const geo = new THREE.CylinderGeometry(o.radius, o.radius, y1 - y0, 160, 1, true, Math.PI + THREE.MathUtils.degToRad(o.yaw) - arc / 2, arc)
  geo.translate(0, (y0 + y1) / 2, 0)
  const map = new THREE.Texture()
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = anisotropy
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uGain: { value: o.gain }, uHaze: { value: o.haze }, uFeather: { value: o.feather }, uFog: { value: fog } },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = vec2(1.0 - uv.x, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform float uGain, uHaze, uFeather; uniform vec3 uFog;
void main(){
 vec4 c = texture2D(uMap, vUv);
 float edge = smoothstep(0.0, uFeather, min(vUv.x, 1.0 - vUv.x));
 gl_FragColor = vec4(mix(c.rgb * uGain, uFog, uHaze), c.a * edge);
}`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = "backdrop"
  mesh.frustumCulled = false
  mesh.visible = false
  root.add(mesh)
  // A backdrop that fails to load stays hidden rather than blocking the stage.
  const ready = new THREE.ImageLoader()
    .loadAsync(o.map)
    .then((img) => {
      map.image = img
      map.needsUpdate = true
      mesh.visible = true
    })
    .catch(() => console.warn(`[stage] backdrop failed: ${o.map}`))
  return {
    ready,
    dispose() {
      root.remove(mesh)
      geo.dispose()
      mat.dispose()
      map.dispose()
    },
  }
}
