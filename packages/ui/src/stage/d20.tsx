"use client"

// The d20.
// - D20Solid, the roll card's: a real icosahedron in three.js, shaded, that tumbles and settles with a face to you.
//   Numbered, its twenty faces carry their numbers and it comes to rest on the one rolled.
// - D20Shape, kept for the dev lab: the outline a real one shows in photographs, seen slightly from above and to one
//   side (a true icosahedron tilted 20° toward the viewer, turned 22° and rolled 8° from face-on, through a 30° lens),
//   with the corners rounded the way tumbled dice are; face-on, a d20 is a plain regular hexagon and reads as any die.

import { served } from "@d20/stage/served"
import { useEffect, useId, useRef } from "react"
import * as THREE from "three"
import { prefersReducedMotion as still } from "../motion"

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
        <image href={served("/images/app/backgrounds/buried.png")} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" style={{ mixBlendMode: "overlay" }} />
      </g>
      <path d={D20_OUTLINE} fill="none" stroke="#e3b67c" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  )
}

// How a die's material looks: indigo, burnished gold for a critical success, and charred black with embers
// glowing through for a critical failure.
const TONES = {
  base: { color: 0x4338ca, emissive: 0x000000, glow: 0, metalness: 0.15, roughness: 0.5 },
  gold: { color: 0xd8a64c, emissive: 0x7a5410, glow: 0.45, metalness: 0.7, roughness: 0.3 },
  char: { color: 0x1c1410, emissive: 0x6a1404, glow: 0.3, metalness: 0.05, roughness: 0.9 },
}
export type D20Tone = "gold" | "char"
type Tone = keyof typeof TONES

// A numbered die's faces are painted on one sheet, a cell to a face: the face's colour, a bevel line inside its edges
// and its number. Each face is a triangle in its cell, point up, so the number reads upright with that corner on top.
const CELL = 192
const CORNERS = [
  [0.5, 0.93],
  [0.03, 0.116],
  [0.97, 0.116],
] as const
const CENTRE = 0.387
const INKS: Record<Tone, { light: string; dark: string; number: string; bevel: string }> = {
  base: { light: "#5d52ee", dark: "#3327a6", number: "#fef3c7", bevel: "rgba(199,210,254,.5)" },
  gold: { light: "#f4cd7c", dark: "#b98a34", number: "#3a220c", bevel: "rgba(255,244,214,.75)" },
  char: { light: "#2c1e17", dark: "#120c09", number: "#ff8a4a", bevel: "rgba(255,138,74,.4)" },
}
const sheets = new Map<Tone, HTMLCanvasElement>()
function sheet(tone: Tone) {
  const made = sheets.get(tone)
  if (made) return made
  const canvas = document.createElement("canvas")
  canvas.width = CELL * 5
  canvas.height = CELL * 4
  const g = canvas.getContext("2d")
  const ink = INKS[tone]
  if (g) {
    for (let f = 0; f < 20; f++) {
      const x = (f % 5) * CELL
      const y = Math.floor(f / 5) * CELL
      const cx = x + CELL * 0.5
      const cy = y + CELL * (1 - CENTRE)
      const fill = g.createRadialGradient(cx, cy, 6, cx, cy, CELL * 0.62)
      fill.addColorStop(0, ink.light)
      fill.addColorStop(1, ink.dark)
      g.fillStyle = fill
      g.fillRect(x, y, CELL, CELL)
      g.beginPath()
      for (const [i, [u, v]] of CORNERS.entries()) {
        const px = x + CELL * (0.5 + (u - 0.5) * 0.9)
        const py = y + CELL * (1 - (CENTRE + (v - CENTRE) * 0.9))
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.strokeStyle = ink.bevel
      g.lineWidth = 2.5
      g.lineJoin = "round"
      g.stroke()
      g.fillStyle = ink.number
      g.font = `bold ${CELL * 0.32}px ui-serif, Georgia, "Times New Roman", serif`
      g.textAlign = "center"
      g.textBaseline = "middle"
      g.shadowColor = "rgba(0,0,0,.45)"
      g.shadowBlur = 5
      g.shadowOffsetY = 2
      g.fillText(String(f + 1), cx, cy + CELL * 0.024)
      // A bar under 6 and 9 tells them apart.
      if (f + 1 === 6 || f + 1 === 9) g.fillRect(cx - CELL * 0.07, cy + CELL * 0.16, CELL * 0.14, CELL * 0.02)
      g.shadowColor = "transparent"
      g.shadowBlur = 0
      g.shadowOffsetY = 0
    }
  }
  sheets.set(tone, canvas)
  return canvas
}


// A true icosahedron, shaded (flat facets and a soft fill light, no edge lines), at rest with one face square to the
// viewer and a corner up, so a number laid over the middle sits on that face. Each change of `roll` tumbles it about a
// random axis, slowing, back to rest over `seconds`. A `tone` turns the die gold or charred over half a second.
// `numbered` paints each face's number on it: the die then waits tilted, with no face square to the viewer, turns
// slowly while `idle`, and each roll brings it to rest on `face`. `landed` puts it there at once: a tumble cut short.
export function D20Solid({
  size,
  roll,
  seconds = 1.2,
  tone,
  numbered = false,
  face,
  idle = false,
  landed = false,
  className,
}: {
  size: number
  roll: number
  seconds?: number
  tone?: D20Tone
  numbered?: boolean
  face?: number
  idle?: boolean
  landed?: boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const start = useRef<((face?: number) => void) | null>(null)
  const recolor = useRef<((tone: D20Tone | undefined) => void) | null>(null)
  const show = useRef<((face: number) => void) | null>(null)
  const drift = useRef<((on: boolean) => void) | null>(null)
  // The face the die is on, or is tumbling to, kept so a die rebuilt at a new size shows it again.
  const settled = useRef<number | null>(null)
  const landing = useRef(face)
  landing.current = face
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
    const mat = new THREE.MeshStandardMaterial({ color: numbered ? 0xffffff : TONES.base.color, roughness: TONES.base.roughness, metalness: TONES.base.metalness, flatShading: true })
    // The painted sheets, one a tone, made as they are needed.
    const maps = new Map<Tone, THREE.CanvasTexture>()
    const mapOf = (t: Tone) => {
      let map = maps.get(t)
      if (!map) {
        map = new THREE.CanvasTexture(sheet(t))
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = 4
        maps.set(t, map)
      }
      return map
    }
    if (numbered) {
      const uv = new Float32Array(120)
      for (let f = 0; f < 20; f++) {
        for (const [k, [u, v]] of CORNERS.entries()) {
          uv[(f * 3 + k) * 2] = ((f % 5) + u) / 5
          uv[(f * 3 + k) * 2 + 1] = 1 - (Math.floor(f / 5) + 1 - v) / 4
        }
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
      mat.map = mapOf("base")
    }
    const die = new THREE.Mesh(geo, mat)
    scene.add(die)
    // Rest on a face: that face square to the camera, its first corner straight up.
    const p = geo.getAttribute("position")
    const restOn = (f: number) => {
      const a = new THREE.Vector3().fromBufferAttribute(p, f * 3)
      const b = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 1)
      const c = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 2)
      const center = a.clone().add(b).add(c).divideScalar(3)
      const toFront = new THREE.Quaternion().setFromUnitVectors(center.clone().normalize(), new THREE.Vector3(0, 0, 1))
      const corner = a.clone().sub(center).applyQuaternion(toFront)
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(corner.x, corner.y)).multiply(toFront)
    }
    const tilted = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5)
    die.quaternion.copy(numbered ? (settled.current ? restOn(settled.current - 1) : tilted) : restOn(0))
    renderer.render(scene, camera)
    let raf = 0
    let turn = 0
    start.current = (to) => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(turn)
      settled.current = numbered && to ? to : null
      const rest = restOn(numbered && to ? to - 1 : 0)
      const from = die.quaternion.clone()
      const spun = new THREE.Quaternion()
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const turns = Math.PI * 2 * (2 + Math.random())
      const t0 = performance.now()
      const frame = () => {
        const t = Math.min(1, (performance.now() - t0) / (seconds * 1000))
        // A numbered die slows more gently, so its face cannot be read until it lands.
        spun.setFromAxisAngle(axis, turns * (1 - t) ** (numbered ? 2 : 3)).multiply(rest)
        // The tumble takes over from wherever the die was turned, so it never jumps.
        die.quaternion.copy(from).slerp(spun, Math.min(1, t / 0.12))
        die.position.y = Math.sin(t * Math.PI) * 0.15
        renderer.render(scene, camera)
        if (t < 1) raf = requestAnimationFrame(frame)
      }
      frame()
    }
    show.current = (to) => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(turn)
      settled.current = to
      die.quaternion.copy(restOn(to - 1))
      die.position.y = 0
      renderer.render(scene, camera)
    }
    // Waiting to be rolled, the die turns slowly and rises and falls a little.
    drift.current = (on) => {
      cancelAnimationFrame(turn)
      if (!on || still()) return
      const about = new THREE.Vector3(0.3, 1, 0.15).normalize()
      const t0 = performance.now()
      const frame = () => {
        const t = (performance.now() - t0) / 1000
        die.quaternion.setFromAxisAngle(about, t * 0.7).multiply(tilted)
        die.position.y = Math.sin(t * 1.6) * 0.04
        renderer.render(scene, camera)
        turn = requestAnimationFrame(frame)
      }
      frame()
    }
    let fade = 0
    recolor.current = (next) => {
      cancelAnimationFrame(fade)
      const to = TONES[next ?? "base"]
      // A numbered die's colour is in its sheet, which changes at once. The shine and the glow follow.
      if (numbered) mat.map = mapOf(next ?? "base")
      const from = { color: mat.color.clone(), emissive: mat.emissive.clone(), glow: mat.emissiveIntensity, metalness: mat.metalness, roughness: mat.roughness }
      const target = { color: new THREE.Color(numbered ? 0xffffff : to.color), emissive: new THREE.Color(to.emissive) }
      const metalness = numbered ? Math.min(to.metalness, 0.4) : to.metalness
      const t0 = performance.now()
      const frame = () => {
        const t = Math.min(1, (performance.now() - t0) / 500)
        const e = t * t * (3 - 2 * t)
        mat.color.lerpColors(from.color, target.color, e)
        mat.emissive.lerpColors(from.emissive, target.emissive, e)
        mat.emissiveIntensity = from.glow + (to.glow - from.glow) * e
        mat.metalness = from.metalness + (metalness - from.metalness) * e
        mat.roughness = from.roughness + (to.roughness - from.roughness) * e
        renderer.render(scene, camera)
        if (t < 1) fade = requestAnimationFrame(frame)
      }
      frame()
    }
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(turn)
      cancelAnimationFrame(fade)
      start.current = null
      recolor.current = null
      show.current = null
      drift.current = null
      for (const map of maps.values()) map.dispose()
      geo.dispose()
      mat.dispose()
      // Each roll in the narration is a new die, and a browser keeps only so many WebGL contexts: this one goes now.
      renderer.forceContextLoss()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [size, seconds, numbered])
  // With reduced motion there is no tumble: the die shows its face at once.
  useEffect(() => {
    if (face && still()) show.current?.(face)
  }, [face, size, seconds, numbered])
  useEffect(() => {
    if (face && landed) show.current?.(face)
  }, [landed, face, size, seconds, numbered])
  useEffect(() => {
    if (roll > 0) start.current?.(landing.current)
  }, [roll])
  useEffect(() => {
    recolor.current?.(tone)
  }, [tone, size, seconds, numbered])
  useEffect(() => {
    drift.current?.(idle)
  }, [idle, size, seconds, numbered])
  return <div ref={host} className={className} style={{ width: size, height: size }} />
}
