// Mapview read-only renderer — square grid v1. Static scene backdrop: fixed piece,
// party-slot, and NPC placements; no interaction, no positional game state.
// See wiki/plans/mapview.md.

import { getPieceDefinition } from "@/lib/mapview/piece-catalog"
import { cn } from "@/lib/utils"
import type { Encounter2DMap, GroundType } from "@/types/encounter-map-2d"
import { PIECE_RENDERERS } from "./pieces"

const GROUND_STYLES: Record<GroundType, { base: string; speckleA: string; speckleB: string; grid: string }> = {
  grass: { base: "#5c7042", speckleA: "#52633a", speckleB: "#6a7f4c", grid: "#3d4a2c" },
  dirt: { base: "#8a7355", speckleA: "#7c674c", speckleB: "#98805f", grid: "#5e4e3a" },
  stone: { base: "#8c8272", speckleA: "#7d7466", speckleB: "#9a9080", grid: "#5c554a" },
  sand: { base: "#c2a878", speckleA: "#b39a6c", speckleB: "#d0b788", grid: "#8a7550" },
  cave: { base: "#4a4a52", speckleA: "#40404a", speckleB: "#56565e", grid: "#2e2e36" },
  wood: { base: "#8a6a48", speckleA: "#7c5f40", speckleB: "#987650", grid: "#5e4630" },
  snow: { base: "#d8dde2", speckleA: "#c8cfd6", speckleB: "#e8ecf0", grid: "#9aa4ae" },
}

const ZONE_STYLES = {
  spawn: { fill: "#5b8fc9", label: "Spawn" },
  objective: { fill: "#c9a84c", label: "Objective" },
  interest: { fill: "#8a68b8", label: "Interest" },
} as const

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

function Token({ x, y, cellSize, fill, ring, text, title }: { x: number; y: number; cellSize: number; fill: string; ring: string; text: string; title?: string }) {
  const cx = (x + 0.5) * cellSize
  const cy = (y + 0.5) * cellSize
  const r = cellSize * 0.38
  return (
    <g>
      {title ? <title>{title}</title> : null}
      <ellipse cx={cx + r * 0.12} cy={cy + r * 0.18} rx={r * 1.05} ry={r * 0.9} fill="#1a140c" opacity={0.35} />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={ring} strokeWidth={Math.max(2, cellSize * 0.05)} />
      <circle cx={cx} cy={cy} r={r * 0.78} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.35} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#f4efe4" fontSize={r * 0.9} fontWeight={700} fontFamily="ui-sans-serif, system-ui" style={{ userSelect: "none" }}>
        {text}
      </text>
    </g>
  )
}

function npcInitials(npcId: string) {
  const parts = npcId.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}

export function EncounterMap2D({ map, className, showZones = true }: { map: Encounter2DMap; className?: string; showZones?: boolean }) {
  const { columns, rows, cellSize } = map.board
  const width = columns * cellSize
  const height = rows * cellSize
  const frame = cellSize * 0.35

  return (
    <div className={cn("overflow-hidden rounded-lg border-2 border-[#3a3128] bg-[#241f18] shadow-xl", className)}>
      <svg viewBox={`${-frame} ${-frame} ${width + frame * 2} ${height + frame * 2}`} className="block h-auto w-full" role="img" aria-label={map.summary || "Encounter battle map"}>
        {/* parchment frame */}
        <rect x={-frame} y={-frame} width={width + frame * 2} height={height + frame * 2} fill="#241f18" />
        <rect x={-frame * 0.5} y={-frame * 0.5} width={width + frame} height={height + frame} fill="none" stroke="#4a3f30" strokeWidth={2} />

        <GroundTexture map={map} />
        <GridLines map={map} />

        {/* zones under pieces: subtle tinted regions */}
        {showZones &&
          map.zones.map((zone) => {
            const style = ZONE_STYLES[zone.kind]
            return (
              <g key={zone.id}>
                <rect x={zone.x * cellSize} y={zone.y * cellSize} width={zone.width * cellSize} height={zone.height * cellSize} fill={style.fill} opacity={0.12} rx={cellSize * 0.15} />
                <rect
                  x={zone.x * cellSize}
                  y={zone.y * cellSize}
                  width={zone.width * cellSize}
                  height={zone.height * cellSize}
                  fill="none"
                  stroke={style.fill}
                  strokeWidth={1.5}
                  strokeDasharray={`${cellSize * 0.18} ${cellSize * 0.12}`}
                  opacity={0.55}
                  rx={cellSize * 0.15}
                />
                <text
                  x={(zone.x + zone.width / 2) * cellSize}
                  y={zone.y > 0 ? zone.y * cellSize - cellSize * 0.15 : (zone.y + zone.height) * cellSize + cellSize * 0.4}
                  textAnchor="middle"
                  fill={style.fill}
                  fontSize={cellSize * 0.32}
                  fontWeight={600}
                  fontFamily="ui-sans-serif, system-ui"
                  opacity={0.85}
                >
                  {zone.label || style.label}
                </text>
              </g>
            )
          })}

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

        {/* pieces */}
        {map.pieces.map((piece) => {
          const def = getPieceDefinition(piece.pieceId)
          const Renderer = PIECE_RENDERERS[piece.pieceId]
          if (!def || !Renderer) return null
          const wCells = piece.width ?? def.footprint.width
          const hCells = piece.height ?? def.footprint.height
          const w = wCells * cellSize
          const h = hCells * cellSize
          const rotate = piece.rotation ? `rotate(${piece.rotation} ${w / 2} ${h / 2})` : ""
          return (
            <g key={piece.id} transform={`translate(${piece.x * cellSize} ${piece.y * cellSize}) ${rotate}`}>
              {piece.label ? <title>{piece.label}</title> : null}
              <Renderer seed={piece.id} w={w} h={h} />
            </g>
          )
        })}

        {/* labels */}
        {map.labels.map((label) => (
          <g key={label.id}>
            <text
              x={label.x * cellSize}
              y={label.y * cellSize}
              textAnchor="middle"
              fill="#241f18"
              fontSize={cellSize * 0.42}
              fontWeight={700}
              fontFamily="ui-serif, Georgia, serif"
              opacity={0.5}
              stroke="#241f18"
              strokeWidth={3}
              strokeLinejoin="round"
            >
              {label.text}
            </text>
            <text x={label.x * cellSize} y={label.y * cellSize} textAnchor="middle" fill="#f0e6cf" fontSize={cellSize * 0.42} fontWeight={700} fontFamily="ui-serif, Georgia, serif">
              {label.text}
            </text>
          </g>
        ))}

        {/* party + NPC tokens */}
        {map.partySlots.map((slot) => (
          <Token key={slot.id} x={slot.x} y={slot.y} cellSize={cellSize} fill="#2c4a72" ring="#7fa8d9" text={`${slot.slotIndex + 1}`} title={`Party slot ${slot.slotIndex + 1}`} />
        ))}
        {map.npcStarts.map((npc) => (
          <Token key={npc.id} x={npc.x} y={npc.y} cellSize={cellSize} fill="#6e2f2a" ring="#d98b7f" text={npcInitials(npc.npcId)} title={npc.npcId} />
        ))}
      </svg>
    </div>
  )
}
