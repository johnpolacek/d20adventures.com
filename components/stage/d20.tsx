"use client"

// The d20.
// - D20Solid, the roll card's: a real icosahedron in three.js, shaded, that tumbles and settles with a face to you.
// - D20Shape, kept for the dev lab: the outline a real one shows in photographs, seen slightly from above and to one
//   side (a true icosahedron tilted 20° toward the viewer, turned 22° and rolled 8° from face-on, through a 30° lens),
//   with the corners rounded the way tumbled dice are; face-on, a d20 is a plain regular hexagon and reads as any die.

import { useEffect, useId, useRef } from "react"
import * as THREE from "three"

export const D20_OUTLINE =
  "M10.4 73.4Q4.2 70.1 5.2 63.2L11.2 21.3Q12.2 14.4 19.1 13.0L60.9 4.4Q67.8 3.0 72.3 8.4L85.3 23.7Q89.8 29.1 91.4 35.9L94.2 48.6Q95.8 55.4 92.2 61.4L86.2 71.3Q82.6 77.3 76.8 81.3L59.8 93.0Q54.0 97.0 47.8 93.7Z"

export function D20Shape({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    <svg viewBox="-2 -2 104 104" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id={`${id}-fill`} cx="38%" cy="30%" r="78%">
          <stop offset="0" stopColor="#5a3d27" />
          <stop offset="0.78" stopColor="#1c1410" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <path d={D20_OUTLINE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`} style={{ isolation: "isolate" }}>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id}-fill)`} />
        <image href="/images/app/backgrounds/buried.png" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" style={{ mixBlendMode: "overlay" }} />
      </g>
      <path d={D20_OUTLINE} fill="none" stroke="#e3b67c" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  )
}

// How a die's material looks: the stage's brown, burnished gold for a critical success, and charred black with embers
// glowing through for a critical failure.
const TONES = {
  base: { color: 0x6b4a30, emissive: 0x000000, glow: 0, metalness: 0.15, roughness: 0.5 },
  gold: { color: 0xd8a64c, emissive: 0x7a5410, glow: 0.45, metalness: 0.7, roughness: 0.3 },
  char: { color: 0x1c1410, emissive: 0x6a1404, glow: 0.3, metalness: 0.05, roughness: 0.9 },
}
export type D20Tone = "gold" | "char"

// A true icosahedron, shaded (flat facets and a soft fill light, no edge lines), at rest with one face square to the
// viewer and a corner up, so a number laid over the middle sits on that face. Each change of `roll` tumbles it about a
// random axis, slowing, back to rest over `seconds`. A `tone` turns the die gold or charred over half a second.
export function D20Solid({ size, roll, seconds = 1.2, tone, className }: { size: number; roll: number; seconds?: number; tone?: D20Tone; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const start = useRef<(() => void) | null>(null)
  const recolor = useRef<((tone: D20Tone | undefined) => void) | null>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(size, size)
    renderer.domElement.style.display = "block"
    el.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
    camera.position.set(0, 0, 4.4)
    scene.add(new THREE.HemisphereLight(0xf3e6c8, 0x1c1410, 1.4))
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.2)
    sun.position.set(-1.5, 2, 3)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xc79a5a, 0.7)
    fill.position.set(2, -1.5, 2)
    scene.add(fill)
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: TONES.base.color, roughness: TONES.base.roughness, metalness: TONES.base.metalness, flatShading: true })
    const die = new THREE.Mesh(geo, mat)
    scene.add(die)
    // Rest: the first face square to the camera, one of its corners straight up.
    const p = geo.getAttribute("position")
    const a = new THREE.Vector3().fromBufferAttribute(p, 0)
    const b = new THREE.Vector3().fromBufferAttribute(p, 1)
    const c = new THREE.Vector3().fromBufferAttribute(p, 2)
    const center = a.clone().add(b).add(c).divideScalar(3)
    const toFront = new THREE.Quaternion().setFromUnitVectors(center.clone().normalize(), new THREE.Vector3(0, 0, 1))
    const corner = a.clone().sub(center).applyQuaternion(toFront)
    const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(corner.x, corner.y)).multiply(toFront)
    die.quaternion.copy(rest)
    renderer.render(scene, camera)
    let raf = 0
    start.current = () => {
      cancelAnimationFrame(raf)
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const turns = Math.PI * 2 * (2 + Math.random())
      const t0 = performance.now()
      const frame = () => {
        const t = Math.min(1, (performance.now() - t0) / (seconds * 1000))
        die.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, turns * (1 - t) ** 3).multiply(rest))
        die.position.y = Math.sin(t * Math.PI) * 0.15
        renderer.render(scene, camera)
        if (t < 1) raf = requestAnimationFrame(frame)
      }
      frame()
    }
    let fade = 0
    recolor.current = (next) => {
      cancelAnimationFrame(fade)
      const to = TONES[next ?? "base"]
      const from = { color: mat.color.clone(), emissive: mat.emissive.clone(), glow: mat.emissiveIntensity, metalness: mat.metalness, roughness: mat.roughness }
      const target = { color: new THREE.Color(to.color), emissive: new THREE.Color(to.emissive) }
      const t0 = performance.now()
      const frame = () => {
        const t = Math.min(1, (performance.now() - t0) / 500)
        const e = t * t * (3 - 2 * t)
        mat.color.lerpColors(from.color, target.color, e)
        mat.emissive.lerpColors(from.emissive, target.emissive, e)
        mat.emissiveIntensity = from.glow + (to.glow - from.glow) * e
        mat.metalness = from.metalness + (to.metalness - from.metalness) * e
        mat.roughness = from.roughness + (to.roughness - from.roughness) * e
        renderer.render(scene, camera)
        if (t < 1) fade = requestAnimationFrame(frame)
      }
      frame()
    }
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(fade)
      start.current = null
      recolor.current = null
      geo.dispose()
      mat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [size, seconds])
  useEffect(() => {
    if (roll > 0) start.current?.()
  }, [roll])
  useEffect(() => {
    recolor.current?.(tone)
  }, [tone])
  return <div ref={host} className={className} style={{ width: size, height: size }} />
}
