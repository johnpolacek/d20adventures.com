"use client"

// An encounter's floor from above, in feet: north up, x to the right, y down. Solids by height, the named places, and
// a token for every character with a position, which slides when the engine moves them.

import { memo, useEffect, useId, useMemo, useRef, useState } from "react"
import { cn, getImageUrl } from "@/lib/utils"
import { findCurrentActor, isDown } from "@/lib/utils/turn-actors"
import { between, type FloorPlace, type FloorSolid, type FloorToken, type FloorView, initials, isTall, rectDegrees, scaleFeet, titleCase, type ViewBox, viewBoxFor } from "./view"

const COLORS = {
  frame: "#241f18",
  ground: "#2c261e",
  tall: "#0d0b08",
  tallEdge: "#4a3f30",
  low: "#5e4e3a",
  lowEdge: "#8a7355",
  place: "#d9c9a3",
  outline: "#141009",
  label: "#f0e6cf",
  active: "#fbbf24",
  pc: { fill: "#2c4a72", ring: "#7fa8d9" },
  npc: { fill: "#6e2f2a", ring: "#d98b7f" },
} as const

const DISPLAY_FONT = "var(--font-display), ui-serif, Georgia, serif"
const SANS_FONT = "ui-sans-serif, system-ui, sans-serif"

// The static layer: hundreds of solids, drawn once per floor and never again when a token moves.
const SolidsLayer = memo(function SolidsLayer({ solids }: { solids: readonly FloorSolid[] }) {
  const ordered = [...solids.filter((solid) => !isTall(solid)), ...solids.filter(isTall)]
  return (
    <g>
      {ordered.map((solid, index) => {
        const tall = isTall(solid)
        const paint = { fill: tall ? COLORS.tall : COLORS.low, stroke: tall ? COLORS.tallEdge : COLORS.lowEdge, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const }
        return solid.kind === "circle" ? (
          <circle key={index} cx={solid.x} cy={solid.y} r={solid.radius} {...paint} />
        ) : (
          <rect
            key={index}
            x={-solid.halfWidth}
            y={-solid.halfDepth}
            width={solid.halfWidth * 2}
            height={solid.halfDepth * 2}
            transform={`translate(${solid.x} ${solid.y}) rotate(${rectDegrees(solid.turn)})`}
            {...paint}
          />
        )
      })}
    </g>
  )
})

// A place's name as the plan shows it: its leading article dropped, and cut short where it runs long.
const placeName = (label: string) => {
  const name = titleCase(label.replace(/^the\s+/i, ""))
  return name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name
}

// The named places, each a dot with its name above. A name is left out where it would lie over a token or over a
// name already drawn, nearest the middle of the view first: in a crowded saloon the tokens matter more.
function PlacesLayer({ places, unit, view, taken }: { places: readonly FloorPlace[]; unit: number; view: ViewBox; taken: readonly { x: number; y: number }[] }) {
  const size = 10 * unit
  const centre = { x: view.x + view.w / 2, y: view.y + view.h / 2 }
  type Box = { x0: number; x1: number; y0: number; y1: number }
  const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  // A token with the distance written under it.
  const boxes: Box[] = taken.map((at) => ({ x0: at.x - 16 * unit, x1: at.x + 16 * unit, y0: at.y - 14 * unit, y1: at.y + 26 * unit }))
  const named = new Set<string>()
  for (const place of [...places].sort((a, b) => between(a.at, centre) - between(b.at, centre))) {
    const half = (placeName(place.label).length * 6.2 * unit) / 2
    const box: Box = { x0: place.at.x - half, x1: place.at.x + half, y0: place.at.y - 15 * unit, y1: place.at.y - 1 * unit }
    if (box.x0 < view.x || box.x1 > view.x + view.w || box.y0 < view.y || boxes.some((other) => overlaps(box, other))) continue
    boxes.push(box)
    named.add(place.id)
  }
  return (
    <g style={{ pointerEvents: "none" }}>
      {places.map((place) => (
        <g key={place.id}>
          <circle cx={place.at.x} cy={place.at.y} r={1.6 * unit} fill={COLORS.place} opacity={0.7} />
          {named.has(place.id) && (
            <text
              x={place.at.x}
              y={place.at.y - 3.5 * unit}
              textAnchor="middle"
              fontSize={size}
              fontFamily={DISPLAY_FONT}
              fill={COLORS.place}
              stroke={COLORS.outline}
              strokeWidth={3 * unit}
              strokeLinejoin="round"
              paintOrder="stroke"
              opacity={0.85}
            >
              {placeName(place.label)}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

function ScaleBar({ view, unit }: { view: ViewBox; unit: number }) {
  const feet = scaleFeet(view.w)
  const x = view.x + 12 * unit
  const y = view.y + view.h - 12 * unit
  const tick = 4 * unit
  const steps = feet >= 20 ? 4 : feet / 5
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={y - tick / 2} width={feet} height={tick} fill={COLORS.outline} opacity={0.6} />
      {Array.from({ length: steps }, (_, index) => (
        <rect key={index} x={x + (feet / steps) * index} y={y - tick / 4} width={feet / steps} height={tick / 2} fill={index % 2 ? COLORS.outline : COLORS.label} />
      ))}
      <text x={x} y={y - tick} fontSize={10 * unit} fontFamily={SANS_FONT} fontWeight={600} fill={COLORS.label} stroke={COLORS.outline} strokeWidth={3 * unit} paintOrder="stroke">
        {feet} ft
      </text>
    </g>
  )
}

function Token({ token, at, active, feet, unit, clipId }: { token: FloorToken; at: { x: number; y: number }; active: boolean; feet?: number; unit: number; clipId: string }) {
  const r = Math.max(2.5, 10 * unit)
  const colors = token.type === "pc" ? COLORS.pc : COLORS.npc
  const image = token.image ? getImageUrl(token.image) : undefined
  const down = isDown(token)
  return (
    <g style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: "transform 700ms ease-in-out, opacity 300ms" }} opacity={down ? 0.4 : 1}>
      <title>{token.name}</title>
      {active && <circle r={r + 4 * unit} fill="none" stroke={COLORS.active} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
      <circle r={r} fill={colors.fill} />
      {image ? (
        <>
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <image href={image} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
        </>
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8} fontWeight={700} fontFamily={SANS_FONT} fill={COLORS.label} style={{ userSelect: "none" }}>
          {initials(token.name)}
        </text>
      )}
      <circle r={r} fill="none" stroke={active ? COLORS.active : colors.ring} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {feet !== undefined && (
        <text
          y={r + 11 * unit}
          textAnchor="middle"
          fontSize={10 * unit}
          fontWeight={600}
          fontFamily={SANS_FONT}
          fill={COLORS.label}
          stroke={COLORS.outline}
          strokeWidth={3 * unit}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {feet} ft
        </text>
      )}
    </g>
  )
}

// The CSS size the plan is drawn at, so labels and tokens keep a readable size in pixels at any zoom.
function useDrawnSize(ref: React.RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState({ w: 360, h: 202.5 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

export function FloorPlan({
  floor,
  characters,
  activeId,
  fit = false,
  className,
}: {
  floor: FloorView
  characters: readonly FloorToken[]
  /** The character whose turn it is. Absent, it is worked out from the characters' initiative and turn state. */
  activeId?: string
  /** Fill the parent's height as well as its width, as the expanded view does. */
  fit?: boolean
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const drawn = useDrawnSize(svgRef)

  const tokens = characters.filter((character): character is FloorToken & { position: { x: number; y: number } } => Boolean(character.position) && !character.fled)
  const active = activeId ?? findCurrentActor(characters as (FloorToken & { initiative?: number })[])?.id
  const activeToken = tokens.find((token) => token.id === active)

  const pointsKey = tokens.map((token) => `${token.position.x},${token.position.y}`).join(";")
  const view = useMemo(
    () =>
      viewBoxFor(
        tokens.map((token) => token.position),
        floor.places.map((place) => place.at)
      ),
    [pointsKey, floor.places]
  )
  // Feet per CSS pixel, as preserveAspectRatio "meet" draws the view.
  const unit = Math.max(view.w / drawn.w, view.h / drawn.h)

  return (
    <div className={cn(fit ? "flex h-full w-full items-center justify-center" : "aspect-[16/9] w-full", className)}>
      <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={floor.location || floor.title}>
        <clipPath id={`${uid}-view`}>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} />
        </clipPath>
        <g clipPath={`url(#${uid}-view)`}>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={COLORS.ground} />
          <SolidsLayer solids={floor.solids} />
          <PlacesLayer places={floor.places} unit={unit} view={view} taken={tokens.map((token) => token.position)} />
          {/* A stable order: moving a node in the DOM would cut its slide short. */}
          {tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              at={token.position}
              active={token.id === active}
              feet={activeToken && token.id !== active ? Math.round(between(activeToken.position, token.position)) : undefined}
              unit={unit}
              clipId={`${uid}-${token.id.replace(/[^a-zA-Z0-9_-]/g, "")}`}
            />
          ))}
          <ScaleBar view={view} unit={unit} />
        </g>
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="none" stroke={COLORS.frame} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}
