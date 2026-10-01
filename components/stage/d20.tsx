"use client"

// The d20's outline, as a real one looks: the silhouette of a true icosahedron seen slightly from above and to one
// side (tilted 20° toward the viewer, turned 22° and rolled 8° from face-on, through a 30° lens), with the corners
// rounded the way tumbled dice are. Face-on, a d20 is a plain regular hexagon and reads as any die; this angle is the
// one in photographs. The fill is the stage's warm brown with the "buried" stone grain.

import { useId } from "react"

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
