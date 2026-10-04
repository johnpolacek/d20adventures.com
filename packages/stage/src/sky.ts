import * as THREE from "three"
import { NOISE, type SharedUniforms } from "./materials/atmosphere"

export interface SkyColors {
  horizon: THREE.Color
  mid: THREE.Color
  zenith: THREE.Color
}

// A painted sky: deep cerulean overhead, pale haze at the horizon, and heaped cumulus lit from the sun's side with cool
// shadowed undersides. The horizon colour is also the fog colour, so the land dissolves seamlessly into the sky.
export function skyMaterial(shared: SharedUniforms, colors: SkyColors, { gain = 1, clouds = 1, stars = 0, glow = new THREE.Color(1, 0.78, 0.5) } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: shared.time,
      uSun: shared.sun,
      uHorizon: { value: colors.horizon },
      uZenith: { value: colors.zenith },
      uMid: { value: colors.mid },
      uGain: { value: gain },
      uClouds: { value: clouds },
      uStars: { value: stars },
      uGlow: { value: glow },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
    fragmentShader: `varying vec3 vDir; uniform float uTime, uGain, uClouds, uStars; uniform vec3 uHorizon, uZenith, uMid, uSun, uGlow;
${NOISE}
float cfbm(vec2 p){ float s = 0.0, a = .5; for (int i = 0; i < 6; i++){ s += a * mnoise(p); p = p * 2.03 + vec2(4.1, 1.3); a *= .5; } return s; }
// Heaped cumulus: broad low-frequency masses with billowed, eroded edges.
float clouds(vec2 p){
 vec2 q = vec2(cfbm(p * .35), cfbm(p * .35 + 5.2));
 float d = cfbm(p * 1.1 + q * .8);
 float puff = 1.0 - abs(mnoise(p * 2.2) * 2.0 - 1.0);
 d += (puff - .5) * .12 - mnoise(p * 6.0) * .05;
 float band = smoothstep(-1.5, 1.5, p.x) * .1 - smoothstep(0.5, -2.0, p.x) * .02;
 return smoothstep(.44, .6, d + band);
}
void main(){
 vec3 d = normalize(vDir); vec3 sun = normalize(uSun);
 float y = max(d.y, 0.0);
 vec3 c = mix(uHorizon, uMid, smoothstep(0.0, .28, y));
 c = mix(c, uZenith, smoothstep(.22, .95, y));
 float s = max(dot(d, sun), 0.0);
 c += uGlow * (pow(s, 7.0) * .32 + pow(s, 400.0) * 6.0);
 if (d.y > -.02){
  vec2 uv = d.xz / (d.y + .16) * 1.25 + vec2(uTime * .006, uTime * .002);
  float cov = clouds(uv);
  vec2 sd = normalize(sun.xz) * .09;
  float lit = clamp(.5 + (cov - clouds(uv + sd)) * 3.0, 0.0, 1.0);
  float body = clamp(cfbm(uv * 1.6) * 1.5 - .3, 0.0, 1.0);
  vec3 shade = mix(vec3(.5, .56, .66), vec3(.76, .77, .8), body) * mix(.85, 1.0, smoothstep(.02, .3, y));
  vec3 cc = mix(shade, vec3(1.12, 1.05, .95), lit);
  cc = mix(cc, uHorizon * 1.05, smoothstep(.2, .0, y) * .7);
  c = mix(c, cc, cov * smoothstep(.0, .12, y) * .96 * uClouds);
 }
 if (uStars > 0.0 && d.y > 0.0){
  vec3 cell = floor(d * 320.0);
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  c += vec3(.8, .86, 1.0) * step(.9982, h) * (.4 + .6 * fract(h * 37.0)) * smoothstep(.04, .25, y) * uStars / max(uGain, .05);
 }
 c = mix(c, uHorizon * .92, smoothstep(0.0, -.08, d.y));
 gl_FragColor = vec4(c * uGain, 1.0);
}`,
  })
}
