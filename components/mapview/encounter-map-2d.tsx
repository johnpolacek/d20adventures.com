// Mapview read-only renderer — square grid v1. Static scene backdrop: fixed piece,
// party-slot, and NPC placements; no interaction, no positional game state.
// See wiki/plans/mapview.md.

import { getPieceDefinition } from "@/lib/mapview/piece-catalog"
import { cn, getTextureImageUrl } from "@/lib/utils"
import type { Encounter2DMap, GroundType } from "@/types/encounter-map-2d"
import { getPieceRenderer } from "./pieces"

const GROUND_STYLES: Record<GroundType, { base: string; speckleA: string; speckleB: string; grid: string }> = {
  grass: { base: "#5c7042", speckleA: "#52633a", speckleB: "#6a7f4c", grid: "#3d4a2c" },
  dirt: { base: "#8a7355", speckleA: "#7c674c", speckleB: "#98805f", grid: "#5e4e3a" },
  stone: { base: "#8c8272", speckleA: "#7d7466", speckleB: "#9a9080", grid: "#5c554a" },
  sand: { base: "#c2a878", speckleA: "#b39a6c", speckleB: "#d0b788", grid: "#8a7550" },
  cave: { base: "#4a4a52", speckleA: "#40404a", speckleB: "#56565e", grid: "#2e2e36" },
  wood: { base: "#8a6a48", speckleA: "#7c5f40", speckleB: "#987650", grid: "#5e4630" },
  snow: { base: "#d8dde2", speckleA: "#c8cfd6", speckleB: "#e8ecf0", grid: "#9aa4ae" },
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeRng(seed: string) {
  let state = hashSeed(seed) || 1
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}

function GroundTexture({ map }: { map: Encounter2DMap }) {
  const { columns, rows, cellSize, ground } = map.board
  const style = GROUND_STYLES[ground]
  const rng = makeRng(`ground-${ground}-${columns}x${rows}`)
  const speckles = Array.from({ length: columns * rows }, (_, i) => ({
    x: rng() * columns * cellSize,
    y: rng() * rows * cellSize,
    r: cellSize * (0.04 + rng() * 0.12),
    tone: i % 2 === 0 ? style.speckleA : style.speckleB,
    opacity: 0.3 + rng() * 0.4,
  }))
  return (
    <g>
      <rect x={0} y={0} width={columns * cellSize} height={rows * cellSize} fill={style.base} />
      {speckles.map((s, i) => (
        <ellipse key={i} cx={s.x} cy={s.y} rx={s.r * 1.6} ry={s.r} fill={s.tone} opacity={s.opacity} />
      ))}
    </g>
  )
}

function GridLines({ map }: { map: Encounter2DMap }) {
  const { columns, rows, cellSize, gridOpacity, ground } = map.board
  const stroke = GROUND_STYLES[ground].grid
  return (
    <g opacity={gridOpacity} stroke={stroke} strokeWidth={1}>
      {Array.from({ length: columns + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i * cellSize} y1={0} x2={i * cellSize} y2={rows * cellSize} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * cellSize} x2={columns * cellSize} y2={i * cellSize} />
      ))}
    </g>
  )
}

export interface MapTokenIdentity {
  name: string
  image?: string
}

function Token({ id, x, y, cellSize, fill, ring, text, identity }: { id: string; x: number; y: number; cellSize: number; fill: string; ring: string; text: string; identity?: MapTokenIdentity }) {
  const cx = (x + 0.5) * cellSize
  const cy = (y + 0.5) * cellSize
  const r = cellSize * 0.46
  const name = identity?.name
  const imageUrl = identity?.image ? getTextureImageUrl(identity.image) : null
  const clipId = `mv-clip-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <g className="mv-token" style={{ cursor: name ? "pointer" : undefined }}>
      {name ? <title>{name}</title> : null}
      <ellipse cx={cx + r * 0.12} cy={cy + r * 0.18} rx={r * 1.05} ry={r * 0.9} fill="#1a140c" opacity={0.4} />
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      {imageUrl ? (
        <>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          <image href={imageUrl} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
        </>
      ) : (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#f4efe4" fontSize={r * 0.9} fontWeight={700} fontFamily="ui-sans-serif, system-ui" style={{ userSelect: "none" }}>
          {text}
        </text>
      )}
      {/* 1px border (device pixels, constant regardless of map scale) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {name && (
        <g className="mv-token-name" style={{ pointerEvents: "none" }}>
          <rect
            x={cx - name.length * cellSize * 0.11 - cellSize * 0.12}
            y={cy + r + cellSize * 0.08}
            width={name.length * cellSize * 0.22 + cellSize * 0.24}
            height={cellSize * 0.42}
            rx={cellSize * 0.1}
            fill="#1a140c"
            opacity={0.85}
          />
          <text x={cx} y={cy + r + cellSize * 0.38} textAnchor="middle" fill="#f0e6cf" fontSize={cellSize * 0.3} fontWeight={600} fontFamily="ui-sans-serif, system-ui">
            {name}
          </text>
        </g>
      )}
    </g>
  )
}

function npcInitials(npcId: string) {
  const parts = npcId.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}

// Trails render as one connected network rather than per-piece art: each trail piece
// contributes an axis-aligned centerline, and endpoints within reach of another
// segment get a connector stroke bridging the gap. This guarantees a continuous
// path even when the generation model places segments that almost-but-don't touch.
interface TrailSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

function nearestPointOnSegment(px: number, py: number, seg: TrailSegment): { x: number; y: number; dist: number } {
  const dx = seg.x2 - seg.x1
  const dy = seg.y2 - seg.y1
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lengthSq))
  const x = seg.x1 + t * dx
  const y = seg.y1 + t * dy
  return { x, y, dist: Math.hypot(px - x, py - y) }
}

function wobblyPath(seg: TrailSegment, rng: () => number, amp: number): string {
  const midX = (seg.x1 + seg.x2) / 2 + (rng() - 0.5) * 2 * amp
  const midY = (seg.y1 + seg.y2) / 2 + (rng() - 0.5) * 2 * amp
  return `M ${seg.x1} ${seg.y1} Q ${midX} ${midY} ${seg.x2} ${seg.y2}`
}

function TrailNetwork({ map }: { map: Encounter2DMap }) {
  const { cellSize } = map.board
  const trails = map.pieces.filter((piece) => piece.pieceId === "trail")
  if (trails.length === 0) return null

  const segments: TrailSegment[] = trails.map((piece) => {
    const w = (piece.width ?? 3) * cellSize
    const h = (piece.height ?? 1) * cellSize
    const x = piece.x * cellSize
    const y = piece.y * cellSize
    // centerline along the long axis
    return w >= h ? { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2 } : { x1: x + w / 2, y1: y, x2: x + w / 2, y2: y + h }
  })

  // Bridge each endpoint to the nearest point on another segment when the gap is
  // small enough to read as "the same path".
  const maxGap = cellSize * 3
  const connectors: TrailSegment[] = []
  const seen = new Set<string>()
  segments.forEach((seg, i) => {
    for (const [px, py] of [
      [seg.x1, seg.y1],
      [seg.x2, seg.y2],
    ] as const) {
      let best: { x: number; y: number; dist: number } | null = null
      segments.forEach((other, j) => {
        if (i === j) return
        const candidate = nearestPointOnSegment(px, py, other)
        if (!best || candidate.dist < best.dist) best = candidate
      })
      const hit = best as { x: number; y: number; dist: number } | null
      if (hit && hit.dist > 1 && hit.dist <= maxGap) {
        const key = [Math.round(px), Math.round(py), Math.round(hit.x), Math.round(hit.y)].sort((a, b) => a - b).join(",")
        if (!seen.has(key)) {
          seen.add(key)
          connectors.push({ x1: px, y1: py, x2: hit.x, y2: hit.y })
        }
      }
    }
  })

  const rng = makeRng(`trail-network-${trails.length}-${Math.round(segments[0].x1)}`)
  const d = [...segments, ...connectors].map((seg) => wobblyPath(seg, rng, cellSize * 0.12)).join(" ")
  const dirt: Array<{ cx: number; cy: number; rx: number; ry: number }> = []
  for (const seg of segments) {
    const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
    const count = Math.max(2, Math.round(length / (cellSize * 1.5)))
    for (let i = 0; i < count; i++) {
      const t = rng()
      dirt.push({
        cx: seg.x1 + (seg.x2 - seg.x1) * t + (rng() - 0.5) * cellSize * 0.2,
        cy: seg.y1 + (seg.y2 - seg.y1) * t + (rng() - 0.5) * cellSize * 0.2,
        rx: cellSize * (0.03 + rng() * 0.02),
        ry: cellSize * 0.05,
      })
    }
  }

  return (
    <g>
      <path d={d} fill="none" stroke="#4f3f2c" strokeWidth={cellSize * 0.52} strokeLinecap="round" opacity={0.9} />
      <path d={d} fill="none" stroke="#8a7355" strokeWidth={cellSize * 0.4} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#a08a66" strokeWidth={cellSize * 0.16} strokeLinecap="round" strokeDasharray={`${cellSize * 0.18} ${cellSize * 0.15}`} opacity={0.6} />
      {dirt.map((spot, i) => (
        <ellipse key={i} cx={spot.cx} cy={spot.cy} rx={spot.rx} ry={spot.ry} fill="#3f3226" opacity={0.7} />
      ))}
    </g>
  )
}

export interface MapTokens {
  /** PC identities in party-slot order (slotIndex i -> party[i]). */
  party?: MapTokenIdentity[]
  /** NPC identities keyed by the plan's npc id. */
  npcs?: Record<string, MapTokenIdentity>
}

const LIGHTING_OVERLAYS = {
  day: null,
  dusk: { color: "#2a1e33", opacity: 0.28 },
  night: { color: "#0a1224", opacity: 0.48 },
} as const

export function EncounterMap2D({ map, className, tokens, fit = false }: { map: Encounter2DMap; className?: string; tokens?: MapTokens; fit?: boolean }) {
  const { columns, rows, cellSize } = map.board
  const width = columns * cellSize
  const height = rows * cellSize
  const frame = cellSize * 0.35

  // Pad the frame so the rendered map is exactly 16:9 regardless of board dims
  // (normalization keeps boards near 16:9, so this padding stays small).
  const totalW = width + frame * 2
  const totalH = height + frame * 2
  const padX = totalW / totalH < 16 / 9 ? ((totalH * 16) / 9 - totalW) / 2 : 0
  const padY = totalW / totalH > 16 / 9 ? ((totalW * 9) / 16 - totalH) / 2 : 0
  const viewX = -frame - padX
  const viewY = -frame - padY
  const viewW = totalW + padX * 2
  const viewH = totalH + padY * 2

  return (
    <div className={cn(fit ? "flex h-full w-full items-center justify-center" : "overflow-hidden rounded-lg border-2 border-[#3a3128] bg-[#241f18] shadow-xl", className)}>
      <svg
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("block", fit ? "h-full w-full" : "h-auto w-full")}
        role="img"
        aria-label={map.summary || "Encounter battle map"}
      >
        <style>{`.mv-token .mv-token-name{opacity:0;transition:opacity .15s}.mv-token:hover .mv-token-name{opacity:1}`}</style>
        {/* parchment frame */}
        <rect x={viewX} y={viewY} width={viewW} height={viewH} fill="#241f18" />
        <rect x={viewX + frame * 0.5} y={viewY + frame * 0.5} width={viewW - frame} height={viewH - frame} fill="none" stroke="#4a3f30" strokeWidth={2} />

        {/* Clip the board content to its bounds so oversized art (tree canopies at the
            edges, etc.) never spills past the frame. */}
        <clipPath id="mv-board-clip">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
        <g clipPath="url(#mv-board-clip)">
          <GroundTexture map={map} />
          <GridLines map={map} />

          {/* walls */}
          {map.walls.map((wall) => {
            const stroke = wall.material === "wood" ? "#7d5531" : wall.material === "cliff" ? "#4a463e" : "#6e6a60"
            return (
              <g key={wall.id}>
                <line
                  x1={wall.x1 * cellSize}
                  y1={wall.y1 * cellSize + 2}
                  x2={wall.x2 * cellSize}
                  y2={wall.y2 * cellSize + 2}
                  stroke="#1a140c"
                  strokeWidth={cellSize * 0.28}
                  strokeLinecap="round"
                  opacity={0.3}
                />
                <line x1={wall.x1 * cellSize} y1={wall.y1 * cellSize} x2={wall.x2 * cellSize} y2={wall.y2 * cellSize} stroke={stroke} strokeWidth={cellSize * 0.26} strokeLinecap="round" />
                <line
                  x1={wall.x1 * cellSize}
                  y1={wall.y1 * cellSize}
                  x2={wall.x2 * cellSize}
                  y2={wall.y2 * cellSize}
                  stroke="#ffffff"
                  strokeWidth={cellSize * 0.08}
                  strokeLinecap="round"
                  opacity={0.15}
                />
              </g>
            )
          })}

          {/* trails first (under other pieces), joined into one continuous network */}
          <TrailNetwork map={map} />

          {/* pieces */}
          {map.pieces.map((piece) => {
            if (piece.pieceId === "trail") return null
            const def = getPieceDefinition(piece.pieceId)
            const Renderer = getPieceRenderer(piece.pieceId)
            if (!def || !Renderer) return null
            const wCells = piece.width ?? def.footprint.width
            const hCells = piece.height ?? def.footprint.height
            const w = wCells * cellSize
            const h = hCells * cellSize
            // Rotation preserves the placed w×h grid footprint: quarter turns draw the
            // art for the swapped box and rotate it into place.
            const quarter = ((piece.rotation % 360) + 360) % 360
            const swapped = quarter === 90 || quarter === 270
            const artW = swapped ? h : w
            const artH = swapped ? w : h
            const rotate = quarter === 90 ? `translate(${w} 0) rotate(90)` : quarter === 180 ? `rotate(180 ${w / 2} ${h / 2})` : quarter === 270 ? `translate(0 ${h}) rotate(-90)` : ""
            return (
              <g key={piece.id} transform={`translate(${piece.x * cellSize} ${piece.y * cellSize}) ${rotate}`.trim()}>
                {piece.label ? <title>{piece.label}</title> : null}
                <Renderer seed={piece.id} w={artW} h={artH} />
              </g>
            )
          })}

          {/* lighting overlay: darkens the scene, sits under labels/tokens so they stay readable */}
          {LIGHTING_OVERLAYS[map.board.lighting] && (
            <>
              <rect x={0} y={0} width={width} height={height} fill={LIGHTING_OVERLAYS[map.board.lighting]?.color} opacity={LIGHTING_OVERLAYS[map.board.lighting]?.opacity} />
              <rect x={0} y={0} width={width} height={height} fill="url(#mv-vignette)" />
              <radialGradient id="mv-vignette" cx="0.5" cy="0.45" r="0.75">
                <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
                <stop offset="1" stopColor="#000008" stopOpacity={map.board.lighting === "night" ? 0.55 : 0.3} />
              </radialGradient>
            </>
          )}
        </g>

        {/* Zones are placement hints only (spawn/focus) — not drawn. Narrative cues
            surface through labels instead of dashed boxes. */}

        {/* labels — display font (Cinzel) with a dark outline for legibility over art */}
        {map.labels.map((label) => {
          const fontSize = cellSize * 0.4
          // Labels are center-anchored, so clamp the center x/y by the estimated text
          // half-width/height plus a margin — a center near an edge would otherwise
          // spill the label off the board (e.g. "Deep Woods" hanging off the left).
          const halfW = Math.min(width / 2 - cellSize * 0.4, (label.text.length * fontSize * 0.62) / 2)
          const cx = Math.min(Math.max(label.x * cellSize, halfW + cellSize * 0.4), width - halfW - cellSize * 0.4)
          const cy = Math.min(Math.max(label.y * cellSize, fontSize), height - fontSize * 0.5)
          return (
            <g key={label.id}>
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                fill="#141009"
                fontSize={fontSize}
                fontFamily="var(--font-display), ui-serif, Georgia, serif"
                opacity={0.75}
                stroke="#141009"
                strokeWidth={cellSize * 0.07}
                strokeLinejoin="round"
              >
                {label.text}
              </text>
              <text x={cx} y={cy} textAnchor="middle" fill="#f2e8ce" fontSize={fontSize} fontFamily="var(--font-display), ui-serif, Georgia, serif">
                {label.text}
              </text>
            </g>
          )
        })}

        {/* party + NPC tokens */}
        {map.partySlots.map((slot) => (
          <Token
            key={slot.id}
            id={slot.id}
            x={slot.x}
            y={slot.y}
            cellSize={cellSize}
            fill="#2c4a72"
            ring="#7fa8d9"
            text={`${slot.slotIndex + 1}`}
            identity={tokens?.party?.[slot.slotIndex] ?? { name: `Party slot ${slot.slotIndex + 1}` }}
          />
        ))}
        {map.npcStarts.map((npc) => (
          <Token
            key={npc.id}
            id={npc.id}
            x={npc.x}
            y={npc.y}
            cellSize={cellSize}
            fill="#6e2f2a"
            ring="#d98b7f"
            text={npcInitials(npc.npcId)}
            identity={tokens?.npcs?.[npc.npcId] ?? { name: npcInitials(npc.npcId) === "?" ? npc.npcId : npc.npcId.replace(/[-_]/g, " ") }}
          />
        ))}
      </svg>
    </div>
  )
}
