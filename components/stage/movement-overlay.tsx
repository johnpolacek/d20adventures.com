"use client"

// Movement on your turn, drawn crisp over the painted stage: a ring on the ground for how far the character can still
// walk, and, under the pointer, the path they would take with its length (red past an obstacle or out of reach).

import { type RefObject, useEffect, useRef } from "react"
import * as THREE from "three"
import type { Stage } from "@/lib/stage"

const ringPath = (stage: Stage, x: number, z: number, r: number, n = 72) => {
  let d = ""
  let pen = false
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const p = stage.projectPoint(new THREE.Vector3(x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r))
    if (p.behind) {
      pen = false
      continue
    }
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    pen = true
  }
  return d
}

export function MovementOverlay({ stage, actorId, remaining, hover }: { stage: Stage; actorId: string; remaining: number; hover: RefObject<{ x: number; z: number } | null> }) {
  const ring = useRef<SVGPathElement>(null)
  const reach = useRef<SVGPathElement>(null)
  const beyond = useRef<SVGPathElement>(null)
  const target = useRef<SVGPathElement>(null)
  const label = useRef<SVGTextElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const a = stage.castAt(actorId)
      ring.current?.setAttribute("d", remaining > 0.3 ? ringPath(stage, a.x, a.z, remaining) : "")
      const h = hover.current
      if (!h || remaining <= 0.3) {
        for (const el of [reach.current, beyond.current, target.current]) el?.setAttribute("d", "")
        label.current?.setAttribute("opacity", "0")
        return
      }
      const r = stage.reach(actorId, h, remaining)
      const p0 = stage.projectPoint(new THREE.Vector3(a.x, 0.03, a.z))
      const p1 = stage.projectPoint(new THREE.Vector3(r.x, 0.03, r.z))
      const p2 = stage.projectPoint(new THREE.Vector3(h.x, 0.03, h.z))
      reach.current?.setAttribute("d", `M${p0.x},${p0.y}L${p1.x},${p1.y}`)
      beyond.current?.setAttribute("d", r.short ? `M${p1.x},${p1.y}L${p2.x},${p2.y}` : "")
      target.current?.setAttribute("d", ringPath(stage, r.x, r.z, 0.35, 24))
      if (label.current) {
        label.current.setAttribute("x", String(p1.x))
        label.current.setAttribute("y", String(p1.y - 18))
        label.current.setAttribute("opacity", "1")
        label.current.textContent = `${r.distance.toFixed(1)} m`
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [stage, actorId, remaining, hover])
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true">
      <defs>
        <filter id="move-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path ref={ring} fill="none" stroke="#e3b67c" strokeWidth="1.6" strokeDasharray="7 5" opacity=".85" filter="url(#move-glow)" />
      <path ref={reach} fill="none" stroke="#f3d6a6" strokeWidth="2.4" strokeLinecap="round" filter="url(#move-glow)" />
      <path ref={beyond} fill="none" stroke="#d0704f" strokeWidth="2" strokeDasharray="4 4" opacity=".9" />
      <path ref={target} fill="#e3b67c33" stroke="#f3d6a6" strokeWidth="1.6" />
      <text ref={label} textAnchor="middle" className="fill-stage-parchment font-serif text-[13px]" style={{ paintOrder: "stroke", stroke: "#1c1410", strokeWidth: 4 }} opacity="0" />
    </svg>
  )
}
