// scene-kit shader mods: onBeforeCompile patches for MeshStandardMaterial.
//
//   mossify   world-space moss and grime on stone, heaviest near the ground
//   clothify  vertex wind on a plane (banners, tabards, awnings)
//   grassify  vertex sway for instanced blades and flowers
//
// All time-driven mods share one TimeUniform, owned by the runtime and ticked
// once per frame, so every cloth and blade in the scene moves on the same clock.

import type * as THREE from "three"

export interface TimeUniform {
  value: number
}

export const glslNoise = `float hashN(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noiseN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashN(i),hashN(i+vec2(1,0)),f.x),mix(hashN(i+vec2(0,1)),hashN(i+vec2(1,1)),f.x),f.y);}
float fbmN(vec2 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=a*noiseN(p);p=p*2.1+vec2(3.1,7.7);a*=0.5;}return s;}`

type Shader = THREE.WebGLProgramParametersWithUniforms

/** Adds a vWPos varying (world position, instancing-aware) and the GLSL noise helpers. */
export function addWorldPos(shader: Shader) {
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;").replace(
    "#include <worldpos_vertex>",
    `#include <worldpos_vertex>
  #ifdef USE_INSTANCING
   vWPos=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;
  #else
   vWPos=(modelMatrix*vec4(transformed,1.0)).xyz;
  #endif`
  )
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\n${glslNoise}`)
}

export function mossify<M extends THREE.MeshStandardMaterial>(material: M, strength = 1): M {
  material.onBeforeCompile = (shader) => {
    addWorldPos(shader)
    shader.uniforms.uMoss = { value: strength }
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uMoss;").replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
   float mN=fbmN(vWPos.xz*1.6+vWPos.y*0.4);float mN2=fbmN(vWPos.xy*3.5+vWPos.z*2.0);
   float mossA=smoothstep(2.4,0.0,vWPos.y+(mN-0.5)*3.0)*smoothstep(0.32,0.62,mN2)*uMoss;
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.19,0.30,0.09)*(0.7+mN2*0.7),mossA*0.85);
   roughnessFactor=mix(roughnessFactor,0.95,mossA);
   float gr=fbmN(vec2(vWPos.x*2.5+vWPos.z*2.5,vWPos.y*0.22));
   diffuseColor.rgb*=1.0-0.2*smoothstep(0.52,0.78,gr);`
    )
  }
  material.customProgramCacheKey = () => "scene-kit:moss"
  return material
}

export interface ClothOptions {
  /** Plane width and height in metres; the wave amplitude is scaled by them. */
  W?: number
  H?: number
  strength?: number
  phase?: number
  /** 0: hangs from the top edge (banner). 1: fixed along the left edge (streamer). */
  mode?: 0 | 1
}

export function clothify<M extends THREE.MeshStandardMaterial>(material: M, time: TimeUniform, { W = 2, H = 6, strength = 1, phase = 0, mode = 0 }: ClothOptions = {}): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uW = { value: W }
    shader.uniforms.uH = { value: H }
    shader.uniforms.uWind = { value: strength }
    shader.uniforms.uPhase = { value: phase }
    shader.uniforms.uMode = { value: mode }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
   uniform float uTime,uW,uH,uWind,uPhase,uMode;
   float wave(vec2 p){float y=(uMode<0.5)?(1.0-p.y):(p.x);float amp=y*y*uWind;
     float w=sin(p.y*5.0+p.x*2.5+uTime*2.1+uPhase)*0.34+sin(p.y*10.5-uTime*3.3+uPhase*1.7+p.x*4.0)*0.11+sin(p.x*6.0+uTime*2.6+uPhase*0.6)*0.10+sin(uTime*0.9+uPhase)*0.25;
     if(uMode>0.5){w=sin(p.x*8.0-uTime*4.5+uPhase)*0.3+sin(p.y*6.0+uTime*3.1+uPhase)*0.1;}
     return w*amp;}`
      )
      .replace(
        "#include <beginnormal_vertex>",
        `
   float wv=wave(uv);float e=0.01;float wx=wave(uv+vec2(e,0.0));float wy=wave(uv+vec2(0.0,e));
   vec3 objectNormal=normalize(vec3(-(wx-wv)/(e*uW),-(wy-wv)/(e*uH),1.0));
   #ifdef USE_TANGENT
    vec3 objectTangent=vec3(tangent.xyz);
   #endif`
      )
      .replace("#include <begin_vertex>", "vec3 transformed=vec3(position);transformed.z+=wv;transformed.x+=0.12*wv;")
  }
  material.customProgramCacheKey = () => "scene-kit:cloth"
  return material
}

export function grassify<M extends THREE.MeshStandardMaterial>(material: M, time: TimeUniform): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `vec3 transformed=vec3(position);
   #ifdef USE_INSTANCING
   vec3 wp=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;
   #else
   vec3 wp=(modelMatrix*vec4(position,1.0)).xyz;
   #endif
   float sw=uv.y*uv.y;float t=uTime;float g=sin(t*1.3+wp.x*0.35+wp.z*0.2)*0.5+sin(t*2.7+wp.x*1.1+wp.z*0.8)*0.25+0.35;
   transformed.x+=g*sw*0.35;transformed.z+=sin(t*1.9+wp.z*0.7)*sw*0.12;`
    )
  }
  material.customProgramCacheKey = () => "scene-kit:grass"
  return material
}

/** Hay: high-frequency world-space brightness noise so straw reads as strands. */
export function hayify<M extends THREE.MeshStandardMaterial>(material: M): M {
  material.onBeforeCompile = (shader) => {
    addWorldPos(shader)
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nfloat hn=fbmN(vWPos.xz*22.0+vWPos.y*15.0);diffuseColor.rgb*=0.6+hn*0.9;"
    )
  }
  material.customProgramCacheKey = () => "scene-kit:hay"
  return material
}
