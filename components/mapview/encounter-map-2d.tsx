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

// Ground, grid, clip, and lighting all cover the padded inner area (the 16:9 region
// inside the frame), not just the board — so the terrain runs edge-to-edge even when
// the board's cell ratio isn't exactly 16:9.
interface InnerArea {
  x: number
  y: number
  w: number
  h: number
}

function GroundTexture({ map, inner }: { map: Encounter2DMap; inner: InnerArea }) {
  const { columns, rows, cellSize, ground } = map.board
  const style = GROUND_STYLES[ground]
  const rng = makeRng(`ground-${ground}-${columns}x${rows}`)
  const count = Math.ceil((inner.w * inner.h) / (cellSize * cellSize))
  const speckles = Array.from({ length: count }, (_, i) => ({
    x: inner.x + rng() * inner.w,
    y: inner.y + rng() * inner.h,
    r: cellSize * (0.04 + rng() * 0.12),
    tone: i % 2 === 0 ? style.speckleA : style.speckleB,
    opacity: 0.3 + rng() * 0.4,
  }))
  return (
    <g>
      <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill={style.base} />
      {speckles.map((s, i) => (
        <ellipse key={i} cx={s.x} cy={s.y} rx={s.r * 1.6} ry={s.r} fill={s.tone} opacity={s.opacity} />
      ))}
    </g>
  )
}

function GridLines({ map, inner }: { map: Encounter2DMap; inner: InnerArea }) {
  const { columns, rows, cellSize, gridOpacity, ground } = map.board
  const stroke = GROUND_STYLES[ground].grid
  const extraX = Math.ceil(-inner.x / cellSize)
  const extraY = Math.ceil(-inner.y / cellSize)
  return (
    <g opacity={gridOpacity} stroke={stroke} strokeWidth={1}>
      {Array.from({ length: columns + 1 + extraX * 2 }, (_, i) => (
        <line key={`v${i}`} x1={(i - extraX) * cellSize} y1={inner.y} x2={(i - extraX) * cellSize} y2={inner.y + inner.h} />
      ))}
      {Array.from({ length: rows + 1 + extraY * 2 }, (_, i) => (
        <line key={`h${i}`} x1={inner.x} y1={(i - extraY) * cellSize} x2={inner.x + inner.w} y2={(i - extraY) * cellSize} />
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

// Trails render as one connected, winding path network. Trail pieces contribute
// axis-aligned centerlines; endpoints are merged into a graph (nearby endpoints
// join, hanging ends bridge to the nearest segment), chains are extracted and
// subdivided with gentle seeded wander, and drawn with midpoint smoothing so
// corners round naturally — no nubs, no circuit-board right angles.
interface TrailPoint {
  x: number
  y: number
}

function nearestPointOnSegment(px: number, py: number, a: TrailPoint, b: TrailPoint): { x: number; y: number; t: number; dist: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSq))
  const x = a.x + t * dx
  const y = a.y + t * dy
  return { x, y, t, dist: Math.hypot(px - x, py - y) }
}

function buildTrailChains(map: Encounter2DMap): TrailPoint[][] {
  const { cellSize } = map.board
  const trails = map.pieces.filter((piece) => piece.pieceId === "trail")
  if (trails.length === 0) return []

  // Graph: nodes merged within tolerance, one edge per trail centerline.
  const nodes: TrailPoint[] = []
  const edges: Array<[number, number]> = []
  const mergeTol = cellSize * 1.6

  const addNode = (p: TrailPoint) => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= mergeTol) {
        nodes[i] = { x: (nodes[i].x + p.x) / 2, y: (nodes[i].y + p.y) / 2 }
        return i
      }
    }
    nodes.push({ ...p })
    return nodes.length - 1
  }

  for (const piece of trails) {
    const w = (piece.width ?? 3) * cellSize
    const h = (piece.height ?? 1) * cellSize
    const x = piece.x * cellSize
    const y = piece.y * cellSize
    const [p1, p2] =
      w >= h
        ? [
            { x, y: y + h / 2 },
            { x: x + w, y: y + h / 2 },
          ]
        : [
            { x: x + w / 2, y },
            { x: x + w / 2, y: y + h },
          ]
    const a = addNode(p1)
    const b = addNode(p2)
    if (a !== b) edges.push([a, b])
  }

  const degree = () => {
    const d = new Map<number, number>()
    for (const [a, b] of edges) {
      d.set(a, (d.get(a) ?? 0) + 1)
      d.set(b, (d.get(b) ?? 0) + 1)
    }
    return d
  }

  // Bridge hanging endpoints (degree 1) to the nearest other segment: split that
  // edge at the projection and connect — handles T-junctions and near-miss gaps.
  const maxGap = cellSize * 3
  let deg = degree()
  for (let n = 0; n < nodes.length; n++) {
    if ((deg.get(n) ?? 0) !== 1) continue
    let best: { edge: number; x: number; y: number; t: number; dist: number } | null = null
    edges.forEach(([a, b], ei) => {
      if (a === n || b === n) return
      const hit = nearestPointOnSegment(nodes[n].x, nodes[n].y, nodes[a], nodes[b])
      if (!best || hit.dist < best.dist) best = { edge: ei, ...hit }
    })
    const hit = best as { edge: number; x: number; y: number; t: number; dist: number } | null
    if (!hit || hit.dist > maxGap || hit.dist < 1) continue
    const [a, b] = edges[hit.edge]
    if (hit.t < 0.1) {
      edges.push([n, a])
    } else if (hit.t > 0.9) {
      edges.push([n, b])
    } else {
      nodes.push({ x: hit.x, y: hit.y })
      const m = nodes.length - 1
      edges[hit.edge] = [a, m]
      edges.push([m, b], [n, m])
    }
    deg = degree()
  }

  // Extract chains: walk from junction/end nodes through degree-2 nodes.
  const adjacency = new Map<number, Array<{ to: number; edge: number }>>()
  edges.forEach(([a, b], ei) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, edge: ei }])
    adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, edge: ei }])
  })
  const visited = new Set<number>()
  const chains: TrailPoint[][] = []
  const walk = (start: number, first: { to: number; edge: number }) => {
    const chain = [nodes[start]]
    visited.add(first.edge)
    let prev = start
    let current = first.to
    chain.push(nodes[current])
    while ((adjacency.get(current)?.length ?? 0) === 2) {
      const next = (adjacency.get(current) ?? []).find((step) => !visited.has(step.edge))
      if (!next) break
      visited.add(next.edge)
      prev = current
      current = next.to
      chain.push(nodes[current])
    }
    void prev
    return chain
  }
  for (const [n, steps] of adjacency) {
    if (steps.length === 2) continue
    for (const step of steps) {
      if (!visited.has(step.edge)) chains.push(walk(n, step))
    }
  }
  // Pure loops (all degree 2) — start anywhere.
  edges.forEach((edge, ei) => {
    if (!visited.has(ei)) chains.push(walk(edge[0], { to: edge[1], edge: ei }))
  })
  return chains
}

function TrailNetwork({ map, inner }: { map: Encounter2DMap; inner: InnerArea }) {
  const { cellSize, columns, rows } = map.board
  const chains = buildTrailChains(map)
  if (chains.length === 0) return null

  // Every open trail end is an entrance/exit: run it out to the nearest frame edge
  // so the path never stops mid-map. The only exception is a trail that ends AT a
  // landmark (hut, gate, altar, ...) — that end stays put.
  const LANDMARKS = new Set(["building-hut", "gate", "altar", "tent", "well", "market-stall", "campfire", "bridge", "statue", "monolith"])
  const landmarkCenters = map.pieces
    .filter((piece) => LANDMARKS.has(piece.pieceId))
    .map((piece) => ({
      x: (piece.x + (piece.width ?? 1) / 2) * cellSize,
      y: (piece.y + (piece.height ?? 1) / 2) * cellSize,
    }))
  const nearLandmark = (p: TrailPoint) => landmarkCenters.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < cellSize * 2.5)
  void columns
  void rows
  for (const chain of chains) {
    for (const at of [0, chain.length - 1] as const) {
      const p = chain[at]
      if (nearLandmark(p)) continue
      const candidates: Array<{ dist: number; pt: TrailPoint }> = [
        { dist: p.x - inner.x, pt: { x: inner.x, y: p.y } },
        { dist: inner.x + inner.w - p.x, pt: { x: inner.x + inner.w, y: p.y } },
        { dist: p.y - inner.y, pt: { x: p.x, y: inner.y } },
        { dist: inner.y + inner.h - p.y, pt: { x: p.x, y: inner.y + inner.h } },
      ]
      const nearest = candidates.sort((a, b) => a.dist - b.dist)[0]
      if (nearest.dist < 1) continue
      if (at === 0) chain.unshift(nearest.pt)
      else chain.push(nearest.pt)
    }
  }

  const rng = makeRng(`trail-${chains.length}-${Math.round(chains[0][0].x)}-${Math.round(chains[0][0].y)}`)

  // Subdivide straight runs and add gentle perpendicular wander; junction nodes stay
  // fixed so branches keep meeting exactly.
  const wobbled = chains.map((chain) => {
    const points: TrailPoint[] = [chain[0]]
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]
      const b = chain[i]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      const steps = Math.max(1, Math.round(length / (cellSize * 1.4)))
      const nx = -(b.y - a.y) / (length || 1)
      const ny = (b.x - a.x) / (length || 1)
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        const amp = (rng() - 0.5) * 2 * cellSize * 0.22
        points.push({ x: a.x + (b.x - a.x) * t + nx * amp, y: a.y + (b.y - a.y) * t + ny * amp })
      }
      points.push(b)
    }
    return points
  })

  // Midpoint smoothing: quadratic curves through midpoints round every corner.
  const d = wobbled
    .map((points) => {
      if (points.length < 2) return ""
      let path = `M ${points[0].x} ${points[0].y}`
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2
        const midY = (points[i].y + points[i + 1].y) / 2
        path += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`
      }
      const last = points[points.length - 1]
      path += ` L ${last.x} ${last.y}`
      return path
    })
    .join(" ")

  const dirt: Array<{ cx: number; cy: number; rx: number; ry: number }> = []
  for (const points of wobbled) {
    for (let i = 0; i < points.length; i += 2) {
      dirt.push({
        cx: points[i].x + (rng() - 0.5) * cellSize * 0.2,
        cy: points[i].y + (rng() - 0.5) * cellSize * 0.2,
        rx: cellSize * (0.03 + rng() * 0.02),
        ry: cellSize * 0.05,
      })
    }
  }

  return (
    <g>
      <path d={d} fill="none" stroke="#4f3f2c" strokeWidth={cellSize * 0.52} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <path d={d} fill="none" stroke="#8a7355" strokeWidth={cellSize * 0.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#a08a66" strokeWidth={cellSize * 0.16} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${cellSize * 0.18} ${cellSize * 0.15}`} opacity={0.6} />
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

  // Pad so the rendered map is exactly 16:9 regardless of board dims. The padding
  // is filled with ground (not parchment) so the terrain runs edge-to-edge; only the
  // thin frame border surrounds it.
  const totalW = width + frame * 2
  const totalH = height + frame * 2
  const padX = totalW / totalH < 16 / 9 ? ((totalH * 16) / 9 - totalW) / 2 : 0
  const padY = totalW / totalH > 16 / 9 ? ((totalW * 9) / 16 - totalH) / 2 : 0
  const viewX = -frame - padX
  const viewY = -frame - padY
  const viewW = totalW + padX * 2
  const viewH = totalH + padY * 2
  const inner = { x: -padX, y: -padY, w: width + padX * 2, h: height + padY * 2 }

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
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} />
        </clipPath>
        <g clipPath="url(#mv-board-clip)">
          <GroundTexture map={map} inner={inner} />
          <GridLines map={map} inner={inner} />

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
          <TrailNetwork map={map} inner={inner} />

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
              <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill={LIGHTING_OVERLAYS[map.board.lighting]?.color} opacity={LIGHTING_OVERLAYS[map.board.lighting]?.opacity} />
              <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="url(#mv-vignette)" />
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
          // Direction labels ("To the ...") get an arrow pointing toward the nearest
          // map edge — where the route leaves the map.
          const isDirection = /^(to|toward|towards)\s/i.test(label.text)
          let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null
          if (isDirection) {
            const dir = [
              { dist: cx - inner.x, dx: -1, dy: 0 },
              { dist: inner.x + inner.w - cx, dx: 1, dy: 0 },
              { dist: cy - inner.y, dx: 0, dy: -1 },
              { dist: inner.y + inner.h - cy, dx: 0, dy: 1 },
            ].sort((a, b) => a.dist - b.dist)[0]
            const len = cellSize * 1.5
            if (dir.dy === 0) {
              const ay = cy + fontSize * 0.9
              arrow = { x1: cx - (dir.dx * len) / 2, y1: ay, x2: cx + (dir.dx * len) / 2, y2: ay }
            } else if (dir.dy < 0) {
              // pointing up: place the arrow above the label so it doesn't cross the text
              const ay = cy - fontSize * 1.2
              arrow = { x1: cx, y1: ay, x2: cx, y2: ay - len * 0.7 }
            } else {
              const ay = cy + fontSize * 0.6
              arrow = { x1: cx, y1: ay, x2: cx, y2: ay + len * 0.7 }
            }
          }
          const head = arrow
            ? (() => {
                const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1)
                const size = cellSize * 0.28
                return `M ${arrow.x2 - size * Math.cos(angle - 0.5)} ${arrow.y2 - size * Math.sin(angle - 0.5)} L ${arrow.x2} ${arrow.y2} L ${arrow.x2 - size * Math.cos(angle + 0.5)} ${arrow.y2 - size * Math.sin(angle + 0.5)}`
              })()
            : null
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
              {arrow && head && (
                <>
                  <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="#141009" strokeWidth={cellSize * 0.16} strokeLinecap="round" opacity={0.75} />
                  <path d={head} fill="none" stroke="#141009" strokeWidth={cellSize * 0.16} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
                  <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="#f2e8ce" strokeWidth={cellSize * 0.07} strokeLinecap="round" />
                  <path d={head} fill="none" stroke="#f2e8ce" strokeWidth={cellSize * 0.07} strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
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
