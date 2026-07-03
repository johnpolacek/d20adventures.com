// Mapview standard piece set — top-down battle-map SVG, one renderer per catalog id.
// Code-drawn v1; an OpenPencil art pass can replace these piece-by-piece (same registry
// keys, same footprints) as a pure visual upgrade. See wiki/plans/mapview.md.
//
// Every renderer draws into a w×h px box (already cell-multiplied by the map renderer)
// and must be deterministic: variation comes from a seeded PRNG keyed on the placed
// piece id, never Math.random, so server and client render identically.

import type { ReactNode } from "react"
import { PIECE_ART, type PieceArt } from "./pieces-art"

export interface PieceRenderProps {
  /** Stable placed-piece id; used as the variation seed. */
  seed: string
  /** Box size in px (footprint × cellSize). */
  w: number
  h: number
}

// --- deterministic variation -------------------------------------------------

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

function jitter(rng: () => number, amount: number) {
  return (rng() - 0.5) * 2 * amount
}

const shadow = (cx: number, cy: number, rx: number, ry: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#1a140c" opacity={0.25} />

// --- natural -------------------------------------------------------------------

// A tree piece renders as a small grove: one crown per ~cell of footprint, so a 2x2
// or 3x3 tree reads as several individual trees rather than one scaled blob.
interface Crown {
  cx: number
  cy: number
  cr: number
  t: number
}

function treeCrowns(seed: string, w: number, h: number): { rng: () => number; crowns: Crown[] } {
  const rng = makeRng(seed)
  const cols = Math.max(1, Math.round(w / 46))
  const rows = Math.max(1, Math.round(h / 46))
  const cw = w / cols
  const ch = h / rows
  const crowns: Crown[] = []
  const multi = cols * rows > 1
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (multi && rng() < 0.15) continue // organic gaps in a cluster
      crowns.push({
        cx: (gx + 0.5) * cw + jitter(rng, cw * 0.16),
        cy: (gy + 0.5) * ch + jitter(rng, ch * 0.16),
        cr: Math.min(cw, ch) * (0.52 + rng() * 0.12),
        t: rng(),
      })
    }
  }
  if (crowns.length === 0) crowns.push({ cx: w / 2, cy: h / 2, cr: Math.min(w, h) * 0.5, t: rng() })
  crowns.sort((a, b) => a.cy - b.cy) // paint back-to-front
  return { rng, crowns }
}

function OakCrown({ cx, cy, cr, t, rng }: Crown & { rng: () => number }) {
  const lobes = 5 + Math.floor(t * 3)
  const dark = t > 0.5 ? "#2c471f" : "#314e23"
  const mid = t > 0.5 ? "#3d5c2b" : "#436230"
  return (
    <g>
      {shadow(cx + cr * 0.16, cy + cr * 0.22, cr * 1.02, cr * 0.82)}
      {/* bumpy canopy edge */}
      {Array.from({ length: lobes }, (_, i) => {
        const a = (i / lobes) * Math.PI * 2 + jitter(rng, 0.3)
        const d = cr * (0.62 + rng() * 0.14)
        return <circle key={i} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d} r={cr * (0.38 + rng() * 0.12)} fill={dark} />
      })}
      <circle cx={cx} cy={cy} r={cr * 0.86} fill={mid} />
      <circle cx={cx - cr * 0.22} cy={cy - cr * 0.24} r={cr * 0.5} fill="#547a3a" opacity={0.9} />
      <circle cx={cx - cr * 0.34} cy={cy - cr * 0.36} r={cr * 0.24} fill="#6b9a4c" opacity={0.85} />
      <circle cx={cx + cr * 0.05} cy={cy + cr * 0.05} r={Math.max(1, cr * 0.1)} fill="#241a10" opacity={0.55} />
    </g>
  )
}

function PineCrown({ cx, cy, cr, t, rng }: Crown & { rng: () => number }) {
  const spikes = 9
  const inner = 0.66 + t * 0.06
  const star = (radius: number, twist: number, ratio: number) =>
    Array.from({ length: spikes * 2 }, (_, i) => {
      const a = (i / (spikes * 2)) * Math.PI * 2 + twist
      const d = i % 2 === 0 ? radius : radius * ratio
      return `${cx + Math.cos(a) * d},${cy + Math.sin(a) * d}`
    }).join(" ")
  const dark = t > 0.5 ? "#24401d" : "#284621"
  return (
    <g>
      {shadow(cx + cr * 0.14, cy + cr * 0.2, cr * 0.94, cr * 0.78)}
      <polygon points={star(cr, jitter(rng, 0.2), inner)} fill={dark} />
      <polygon points={star(cr * 0.74, 0.34, inner + 0.04)} fill="#335530" />
      {/* radial branches */}
      {Array.from({ length: spikes }, (_, i) => {
        const a = (i / spikes) * Math.PI * 2 + jitter(rng, 0.1)
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * cr * 0.88} y2={cy + Math.sin(a) * cr * 0.88} stroke="#1d3417" strokeWidth={Math.max(0.6, cr * 0.05)} opacity={0.6} />
      })}
      <circle cx={cx - cr * 0.14} cy={cy - cr * 0.14} r={cr * 0.34} fill="#43663a" opacity={0.75} />
      <circle cx={cx} cy={cy} r={Math.max(1, cr * 0.12)} fill="#1a2f14" />
    </g>
  )
}

function TreeOak({ seed, w, h }: PieceRenderProps) {
  const { rng, crowns } = treeCrowns(seed, w, h)
  return (
    <g>
      {crowns.map((crown, i) => (
        <OakCrown key={i} {...crown} rng={rng} />
      ))}
    </g>
  )
}

function TreePine({ seed, w, h }: PieceRenderProps) {
  const { rng, crowns } = treeCrowns(seed, w, h)
  return (
    <g>
      {crowns.map((crown, i) => (
        <PineCrown key={i} {...crown} rng={rng} />
      ))}
    </g>
  )
}

function Boulder({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.4
  const pts = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + jitter(rng, 0.2)
    const dist = r * (0.8 + rng() * 0.25)
    return `${cx + Math.cos(angle) * dist},${cy + Math.sin(angle) * dist}`
  }).join(" ")
  return (
    <g>
      {shadow(cx + r * 0.18, cy + r * 0.22, r * 1.05, r * 0.85)}
      <polygon points={pts} fill="#6e6a60" stroke="#4a463e" strokeWidth={1.5} />
      <polygon points={pts} fill="none" stroke="#8a857a" strokeWidth={1} opacity={0.6} transform={`translate(${-r * 0.08} ${-r * 0.1}) scale(0.82)`} style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <path d={`M ${cx - r * 0.3} ${cy - r * 0.1} L ${cx + r * 0.1} ${cy + r * 0.25}`} stroke="#4a463e" strokeWidth={1} opacity={0.7} />
    </g>
  )
}

function RockCluster({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const count = 4 + Math.floor(rng() * 3)
  const rocks = Array.from({ length: count }, () => ({
    x: w * (0.18 + rng() * 0.64),
    y: h * (0.22 + rng() * 0.56),
    r: Math.min(w, h) * (0.1 + rng() * 0.12),
  }))
  return (
    <g>
      {rocks.map((rock, i) => (
        <g key={i}>
          {shadow(rock.x + rock.r * 0.2, rock.y + rock.r * 0.25, rock.r * 1.1, rock.r * 0.9)}
          <circle cx={rock.x} cy={rock.y} r={rock.r} fill="#75705f" stroke="#4a463e" strokeWidth={1} />
          <circle cx={rock.x - rock.r * 0.25} cy={rock.y - rock.r * 0.25} r={rock.r * 0.45} fill="#8a857a" opacity={0.7} />
        </g>
      ))}
    </g>
  )
}

function Bush({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.38
  const blobs = Array.from({ length: 5 }, () => ({
    x: cx + jitter(rng, r * 0.5),
    y: cy + jitter(rng, r * 0.4),
    r: r * (0.4 + rng() * 0.25),
  }))
  return (
    <g>
      {shadow(cx, cy + r * 0.25, r, r * 0.7)}
      {blobs.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={i % 2 === 0 ? "#55703c" : "#647f47"} />
      ))}
      <circle cx={cx - r * 0.2} cy={cy - r * 0.2} r={r * 0.35} fill="#75914f" opacity={0.8} />
    </g>
  )
}

function Pond({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const rx = w * 0.44
  const ry = h * 0.4
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    const dx = rx * (0.85 + rng() * 0.15)
    const dy = ry * (0.85 + rng() * 0.15)
    return `${cx + Math.cos(angle) * dx},${cy + Math.sin(angle) * dy}`
  })
  const path = `M ${pts.join(" L ")} Z`
  return (
    <g>
      <path d={path} fill="#8c7f5f" opacity={0.9} transform={`translate(0 1.5) scale(1.04)`} style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <path d={path} fill="#3e6478" />
      <path d={path} fill="#4d7a8c" transform="scale(0.82)" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <path d={path} fill="#5d8f9e" transform="scale(0.55)" style={{ transformOrigin: `${cx}px ${cy}px` }} opacity={0.85} />
      <path d={`M ${cx - rx * 0.4} ${cy - ry * 0.25} q ${rx * 0.2} ${-ry * 0.12} ${rx * 0.45} 0`} stroke="#bcd6da" strokeWidth={1.2} fill="none" opacity={0.7} />
    </g>
  )
}

function Marsh({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const tufts = Array.from({ length: 7 }, () => ({ x: w * (0.12 + rng() * 0.76), y: h * (0.15 + rng() * 0.7), s: Math.min(w, h) * (0.05 + rng() * 0.05) }))
  const pools = Array.from({ length: 3 }, () => ({ x: w * (0.2 + rng() * 0.6), y: h * (0.25 + rng() * 0.5), rx: w * (0.1 + rng() * 0.12), ry: h * (0.06 + rng() * 0.08) }))
  return (
    <g>
      <rect x={w * 0.04} y={h * 0.06} width={w * 0.92} height={h * 0.88} rx={Math.min(w, h) * 0.2} fill="#4d5738" opacity={0.75} />
      {pools.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="#42606a" opacity={0.9} />
      ))}
      {tufts.map((t, i) => (
        <path key={i} d={`M ${t.x - t.s} ${t.y} q ${t.s * 0.5} ${-t.s * 2} ${t.s} 0 q ${t.s * 0.5} ${-t.s * 1.6} ${t.s} 0`} stroke="#6e7f4a" strokeWidth={1.4} fill="none" />
      ))}
    </g>
  )
}

// --- structures ------------------------------------------------------------------

function StoneWall({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const courses = Math.max(2, Math.round(h / 14))
  const stones: ReactNode[] = []
  for (let row = 0; row < courses; row++) {
    let x = 0
    const y = (row / courses) * h
    const rowH = h / courses
    while (x < w) {
      const stoneW = Math.min(w - x, rowH * (1.2 + rng() * 1.2))
      stones.push(<rect key={`${row}-${x.toFixed(0)}`} x={x + 0.8} y={y + 0.8} width={stoneW - 1.6} height={rowH - 1.6} rx={1.5} fill={rng() > 0.5 ? "#7a756a" : "#6e6a60"} />)
      x += stoneW
    }
  }
  return (
    <g>
      <rect x={1} y={2.5} width={w - 2} height={h - 2} rx={2} fill="#1a140c" opacity={0.3} />
      <rect x={0} y={0} width={w} height={h - 1.5} rx={2} fill="#57534a" />
      {stones}
    </g>
  )
}

function RuinedWall({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const segments = 3 + Math.floor(rng() * 2)
  return (
    <g>
      {Array.from({ length: segments }, (_, i) => {
        const segW = (w / segments) * (0.55 + rng() * 0.4)
        const segH = h * (0.5 + rng() * 0.5)
        const x = (i / segments) * w + jitter(rng, w * 0.03)
        const y = h - segH
        return (
          <g key={i}>
            <rect x={x + 1} y={y + 2} width={segW} height={segH - 2} fill="#1a140c" opacity={0.25} />
            <rect x={x} y={y} width={segW} height={segH} rx={1.5} fill="#6e6a60" stroke="#4a463e" strokeWidth={1} />
            <line x1={x + segW * 0.3} y1={y + segH * 0.4} x2={x + segW * 0.7} y2={y + segH * 0.4} stroke="#4a463e" strokeWidth={0.8} opacity={0.7} />
          </g>
        )
      })}
      {Array.from({ length: 4 }, (_, i) => (
        <circle key={`d-${i}`} cx={w * (0.15 + rng() * 0.7)} cy={h * (0.75 + rng() * 0.2)} r={Math.min(w, h) * 0.05} fill="#75705f" />
      ))}
    </g>
  )
}

function BuildingHut({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const inset = Math.min(w, h) * 0.08
  const ridgeY = h / 2 + jitter(rng, h * 0.04)
  return (
    <g>
      <rect x={inset + 2} y={inset + 3} width={w - inset * 2} height={h - inset * 2} rx={2} fill="#1a140c" opacity={0.3} />
      <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={2} fill="#8a5f3c" stroke="#5e402a" strokeWidth={1.5} />
      {/* roof planes seen from above */}
      <polygon points={`${inset},${inset} ${w - inset},${inset} ${w - inset * 1.6},${ridgeY} ${inset * 1.6},${ridgeY}`} fill="#a1713f" />
      <polygon points={`${inset},${h - inset} ${w - inset},${h - inset} ${w - inset * 1.6},${ridgeY} ${inset * 1.6},${ridgeY}`} fill="#7d5531" />
      <line x1={inset * 1.6} y1={ridgeY} x2={w - inset * 1.6} y2={ridgeY} stroke="#5e402a" strokeWidth={2} />
      {Array.from({ length: 5 }, (_, i) => (
        <line
          key={i}
          x1={inset + ((w - inset * 2) / 5) * (i + 0.5)}
          y1={inset + 2}
          x2={inset * 1.6 + ((w - inset * 3.2) / 5) * (i + 0.5)}
          y2={ridgeY - 1}
          stroke="#5e402a"
          strokeWidth={0.8}
          opacity={0.5}
        />
      ))}
    </g>
  )
}

function Tent({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const inset = Math.min(w, h) * 0.12
  const tone = rng() > 0.5 ? "#9c8a66" : "#8f7d5c"
  return (
    <g>
      {shadow(cx + 2, h / 2 + 3, w * 0.42, h * 0.36)}
      <polygon points={`${cx},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`} fill={tone} stroke="#6b5c40" strokeWidth={1.5} />
      <line x1={cx} y1={inset} x2={cx} y2={h - inset} stroke="#6b5c40" strokeWidth={1.5} />
      <polygon points={`${cx},${h * 0.55} ${cx + w * 0.08},${h - inset} ${cx - w * 0.08},${h - inset}`} fill="#4a3d29" />
    </g>
  )
}

function Gate({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  const towerW = w * 0.22
  const doorW = w - towerW * 2
  return (
    <g>
      <rect x={2} y={3} width={w - 3} height={h - 3} fill="#1a140c" opacity={0.25} />
      {/* flanking towers */}
      <rect x={0} y={0} width={towerW} height={h} rx={2} fill="#6e6a60" stroke="#4a463e" strokeWidth={1.5} />
      <rect x={w - towerW} y={0} width={towerW} height={h} rx={2} fill="#6e6a60" stroke="#4a463e" strokeWidth={1.5} />
      <circle cx={towerW / 2} cy={h / 2} r={towerW * 0.28} fill="#57534a" />
      <circle cx={w - towerW / 2} cy={h / 2} r={towerW * 0.28} fill="#57534a" />
      {/* threshold + doors */}
      <rect x={towerW} y={h * 0.25} width={doorW} height={h * 0.5} fill="#8c8272" />
      <rect x={towerW} y={h * 0.3} width={doorW / 2 - 1} height={h * 0.4} fill="#7d5531" stroke="#5e402a" strokeWidth={1.2} />
      <rect x={w / 2 + 1} y={h * 0.3} width={doorW / 2 - 1} height={h * 0.4} fill="#7d5531" stroke="#5e402a" strokeWidth={1.2} />
      <line x1={towerW + doorW * 0.25} y1={h * 0.32} x2={towerW + doorW * 0.25} y2={h * 0.68} stroke="#5e402a" strokeWidth={0.8} opacity={0.6} />
      <line x1={w - towerW - doorW * 0.25} y1={h * 0.32} x2={w - towerW - doorW * 0.25} y2={h * 0.68} stroke="#5e402a" strokeWidth={0.8} opacity={0.6} />
    </g>
  )
}

function Bridge({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const planks = Math.max(4, Math.round(w / 12))
  return (
    <g>
      <rect x={0} y={h * 0.12} width={w} height={h * 0.76} rx={2} fill="#7d5531" />
      {Array.from({ length: planks }, (_, i) => (
        <line key={i} x1={(w / planks) * (i + jitter(rng, 0.06) + 0.5)} y1={h * 0.14} x2={(w / planks) * (i + 0.5)} y2={h * 0.86} stroke="#5e402a" strokeWidth={1.2} opacity={0.8} />
      ))}
      <rect x={0} y={h * 0.06} width={w} height={h * 0.09} rx={1.5} fill="#8a5f3c" stroke="#5e402a" strokeWidth={0.8} />
      <rect x={0} y={h * 0.85} width={w} height={h * 0.09} rx={1.5} fill="#8a5f3c" stroke="#5e402a" strokeWidth={0.8} />
    </g>
  )
}

function Well({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.36
  return (
    <g>
      {shadow(cx + r * 0.15, cy + r * 0.2, r * 1.15, r * 0.95)}
      <circle cx={cx} cy={cy} r={r} fill="#6e6a60" stroke="#4a463e" strokeWidth={1.5} />
      {Array.from({ length: 8 }, (_, i) => {
        const a1 = (i / 8) * Math.PI * 2
        return <line key={i} x1={cx + Math.cos(a1) * r * 0.72} y1={cy + Math.sin(a1) * r * 0.72} x2={cx + Math.cos(a1) * r} y2={cy + Math.sin(a1) * r} stroke="#4a463e" strokeWidth={1} />
      })}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#22303a" />
      <circle cx={cx - r * 0.18} cy={cy - r * 0.18} r={r * 0.16} fill="#33454f" />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#7d5531" strokeWidth={2.5} />
    </g>
  )
}

function Statue({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.38
  return (
    <g>
      {shadow(cx + r * 0.15, cy + r * 0.2, r * 1.1, r * 0.9)}
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={2} fill="#8c8272" stroke="#5c554a" strokeWidth={1.2} />
      <rect x={cx - r * 0.72} y={cy - r * 0.72} width={r * 1.44} height={r * 1.44} rx={1.5} fill="#9c937f" />
      <circle cx={cx} cy={cy - r * 0.18} r={r * 0.28} fill="#b0a68e" stroke="#5c554a" strokeWidth={1} />
      <ellipse cx={cx} cy={cy + r * 0.28} rx={r * 0.42} ry={r * 0.3} fill="#b0a68e" stroke="#5c554a" strokeWidth={1} />
    </g>
  )
}

function Altar({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  return (
    <g>
      <rect x={2} y={3} width={w - 3} height={h - 4} fill="#1a140c" opacity={0.25} />
      <rect x={w * 0.05} y={h * 0.1} width={w * 0.9} height={h * 0.8} rx={2} fill="#8c8272" stroke="#5c554a" strokeWidth={1.5} />
      <rect x={w * 0.14} y={h * 0.22} width={w * 0.72} height={h * 0.56} rx={1.5} fill="#9c937f" />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.14} fill="#c9a84c" stroke="#8a6f2c" strokeWidth={1} />
      <line x1={w * 0.2} y1={h / 2} x2={w * 0.38} y2={h / 2} stroke="#5c554a" strokeWidth={1} />
      <line x1={w * 0.62} y1={h / 2} x2={w * 0.8} y2={h / 2} stroke="#5c554a" strokeWidth={1} />
    </g>
  )
}

function Pillar({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.3
  return (
    <g>
      {shadow(cx + r * 0.2, cy + r * 0.25, r * 1.2, r)}
      <rect x={cx - r * 1.1} y={cy - r * 1.1} width={r * 2.2} height={r * 2.2} rx={2} fill="#8c8272" stroke="#5c554a" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r} fill="#a89d86" stroke="#5c554a" strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#b8ac93" />
    </g>
  )
}

function Fence({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const posts = Math.max(3, Math.round(w / 16))
  const midY = h / 2
  return (
    <g>
      <line x1={2} y1={midY - h * 0.08} x2={w - 2} y2={midY - h * 0.08} stroke="#7d5531" strokeWidth={2.5} />
      <line x1={2} y1={midY + h * 0.12} x2={w - 2} y2={midY + h * 0.12} stroke="#6b4a2c" strokeWidth={2.5} />
      {Array.from({ length: posts }, (_, i) => {
        const x = (w / (posts - 1)) * i + jitter(rng, 1)
        return <circle key={i} cx={x} cy={midY} r={Math.min(3.5, h * 0.14)} fill="#5e402a" />
      })}
    </g>
  )
}

// --- dressing ------------------------------------------------------------------

function CrateStack({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const big = Math.min(w, h) * 0.52
  const small = big * 0.66
  const angle = jitter(rng, 14)
  return (
    <g>
      <rect x={w * 0.12 + 1.5} y={h * 0.18 + 2} width={big} height={big} fill="#1a140c" opacity={0.25} transform={`rotate(${angle} ${w / 2} ${h / 2})`} />
      <g transform={`rotate(${angle} ${w / 2} ${h / 2})`}>
        <rect x={w * 0.12} y={h * 0.18} width={big} height={big} rx={1.5} fill="#8a6a42" stroke="#5e4527" strokeWidth={1.2} />
        <line x1={w * 0.12} y1={h * 0.18} x2={w * 0.12 + big} y2={h * 0.18 + big} stroke="#5e4527" strokeWidth={0.8} opacity={0.6} />
        <line x1={w * 0.12 + big} y1={h * 0.18} x2={w * 0.12} y2={h * 0.18 + big} stroke="#5e4527" strokeWidth={0.8} opacity={0.6} />
      </g>
      <rect
        x={w * 0.5}
        y={h * 0.5}
        width={small}
        height={small}
        rx={1.5}
        fill="#9c7a4e"
        stroke="#5e4527"
        strokeWidth={1.2}
        transform={`rotate(${jitter(rng, 18)} ${w * 0.5 + small / 2} ${h * 0.5 + small / 2})`}
      />
    </g>
  )
}

function Barrels({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const r = Math.min(w, h) * 0.2
  const spots = [
    { x: w * 0.32, y: h * 0.36 },
    { x: w * 0.62, y: h * 0.42 },
    { x: w * 0.45, y: h * 0.68 },
  ]
  return (
    <g>
      {spots.map((s, i) => {
        const rr = r * (0.85 + rng() * 0.3)
        return (
          <g key={i}>
            {shadow(s.x + rr * 0.2, s.y + rr * 0.25, rr * 1.1, rr * 0.9)}
            <circle cx={s.x} cy={s.y} r={rr} fill="#8a6a42" stroke="#5e4527" strokeWidth={1.2} />
            <circle cx={s.x} cy={s.y} r={rr * 0.6} fill="none" stroke="#5e4527" strokeWidth={0.8} opacity={0.8} />
            <circle cx={s.x} cy={s.y} r={rr * 0.15} fill="#5e4527" />
          </g>
        )
      })}
    </g>
  )
}

function Campfire({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.36
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + jitter(rng, 0.2)
        return <circle key={i} cx={cx + Math.cos(angle) * r} cy={cy + Math.sin(angle) * r} r={r * 0.22} fill="#6e6a60" stroke="#4a463e" strokeWidth={0.8} />
      })}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#3a2a1a" />
      <polygon points={`${cx},${cy - r * 0.5} ${cx + r * 0.32},${cy + r * 0.25} ${cx - r * 0.32},${cy + r * 0.25}`} fill="#d97a2a" />
      <polygon points={`${cx},${cy - r * 0.28} ${cx + r * 0.18},${cy + r * 0.2} ${cx - r * 0.18},${cy + r * 0.2}`} fill="#f0b13c" />
    </g>
  )
}

function Wagon({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  void rng
  return (
    <g>
      <rect x={w * 0.1 + 1.5} y={h * 0.2 + 2} width={w * 0.8} height={h * 0.6} rx={3} fill="#1a140c" opacity={0.25} />
      <circle cx={w * 0.22} cy={h * 0.18} r={h * 0.12} fill="#4a3a24" />
      <circle cx={w * 0.22} cy={h * 0.82} r={h * 0.12} fill="#4a3a24" />
      <circle cx={w * 0.78} cy={h * 0.18} r={h * 0.12} fill="#4a3a24" />
      <circle cx={w * 0.78} cy={h * 0.82} r={h * 0.12} fill="#4a3a24" />
      <rect x={w * 0.1} y={h * 0.2} width={w * 0.8} height={h * 0.6} rx={3} fill="#8a6a42" stroke="#5e4527" strokeWidth={1.5} />
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1={w * (0.22 + i * 0.19)} y1={h * 0.22} x2={w * (0.22 + i * 0.19)} y2={h * 0.78} stroke="#5e4527" strokeWidth={0.8} opacity={0.6} />
      ))}
      <rect x={w * 0.14} y={h * 0.3} width={w * 0.2} height={h * 0.4} rx={1.5} fill="#9c8a66" opacity={0.9} />
    </g>
  )
}

function Rubble({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const bits = Array.from({ length: 10 }, () => ({
    x: w * (0.1 + rng() * 0.8),
    y: h * (0.12 + rng() * 0.76),
    r: Math.min(w, h) * (0.04 + rng() * 0.08),
    tone: rng() > 0.5 ? "#75705f" : "#8c8272",
    rot: rng() * 90,
  }))
  return (
    <g>
      <ellipse cx={w / 2} cy={h / 2} rx={w * 0.42} ry={h * 0.38} fill="#57534a" opacity={0.35} />
      {bits.map((b, i) =>
        i % 3 === 0 ? (
          <rect key={i} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 1.4} fill={b.tone} transform={`rotate(${b.rot} ${b.x} ${b.y})`} stroke="#4a463e" strokeWidth={0.6} />
        ) : (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.tone} stroke="#4a463e" strokeWidth={0.6} />
        )
      )}
    </g>
  )
}

function Chest({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const angle = jitter(rng, 10)
  const cw = w * 0.6
  const ch = h * 0.45
  const x = (w - cw) / 2
  const y = (h - ch) / 2
  return (
    <g transform={`rotate(${angle} ${w / 2} ${h / 2})`}>
      <rect x={x + 1.5} y={y + 2} width={cw} height={ch} rx={2} fill="#1a140c" opacity={0.3} />
      <rect x={x} y={y} width={cw} height={ch} rx={2} fill="#8a5f3c" stroke="#5e402a" strokeWidth={1.5} />
      <line x1={x} y1={y + ch * 0.45} x2={x + cw} y2={y + ch * 0.45} stroke="#5e402a" strokeWidth={1.2} />
      <rect x={x + cw * 0.42} y={y + ch * 0.3} width={cw * 0.16} height={ch * 0.36} rx={1} fill="#c9a84c" stroke="#8a6f2c" strokeWidth={0.8} />
      <line x1={x + cw * 0.16} y1={y + 1} x2={x + cw * 0.16} y2={y + ch - 1} stroke="#5e402a" strokeWidth={1} opacity={0.7} />
      <line x1={x + cw * 0.84} y1={y + 1} x2={x + cw * 0.84} y2={y + ch - 1} stroke="#5e402a" strokeWidth={1} opacity={0.7} />
    </g>
  )
}

function MarketStall({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const stripe = rng() > 0.5 ? "#a34a3a" : "#3a5a7a"
  const stripes = Math.max(4, Math.round(w / 12))
  return (
    <g>
      <rect x={2} y={3} width={w - 3} height={h - 4} fill="#1a140c" opacity={0.25} />
      <rect x={0} y={0} width={w} height={h} rx={2} fill="#e8dcc2" stroke="#8a7a5c" strokeWidth={1.2} />
      {Array.from({ length: stripes }, (_, i) => (i % 2 === 0 ? <rect key={i} x={(w / stripes) * i} y={0} width={w / stripes} height={h} fill={stripe} opacity={0.85} /> : null))}
      <rect x={w * 0.1} y={h * 0.3} width={w * 0.8} height={h * 0.4} rx={1.5} fill="#8a6a42" opacity={0.9} stroke="#5e4527" strokeWidth={0.8} />
    </g>
  )
}

// --- hazards -------------------------------------------------------------------

function Pit({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    const dx = w * 0.42 * (0.85 + rng() * 0.15)
    const dy = h * 0.4 * (0.85 + rng() * 0.15)
    return `${cx + Math.cos(angle) * dx},${cy + Math.sin(angle) * dy}`
  })
  const path = `M ${pts.join(" L ")} Z`
  return (
    <g>
      <path d={path} fill="#57534a" transform="scale(1.06)" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <path d={path} fill="#26211a" />
      <path d={path} fill="#120f0a" transform="scale(0.7)" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <path d={path} fill="#000000" transform="scale(0.4)" style={{ transformOrigin: `${cx}px ${cy}px` }} />
    </g>
  )
}

function Spikes({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const count = 6 + Math.floor(rng() * 3)
  return (
    <g>
      <ellipse cx={w / 2} cy={h / 2} rx={w * 0.4} ry={h * 0.36} fill="#3a3428" opacity={0.5} />
      {Array.from({ length: count }, (_, i) => {
        const x = w * (0.18 + rng() * 0.64)
        const y = h * (0.2 + rng() * 0.6)
        const s = Math.min(w, h) * (0.08 + rng() * 0.05)
        return (
          <g key={i}>
            <polygon points={`${x},${y - s * 1.6} ${x + s * 0.6},${y + s * 0.4} ${x - s * 0.6},${y + s * 0.4}`} fill="#b8ac93" stroke="#6b5c40" strokeWidth={0.8} />
            <circle cx={x} cy={y + s * 0.5} r={s * 0.35} fill="#6b5c40" />
          </g>
        )
      })}
    </g>
  )
}

function Trail({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  // Draw along the long axis so tall boxes read as vertical runs without rotation.
  const vertical = h > w
  const length = vertical ? h : w
  const breadth = vertical ? w : h
  const mid = breadth / 2
  const amp = breadth * 0.12
  const points = Array.from({ length: 7 }, (_, i) => ({ a: (length / 6) * i, b: i === 0 || i === 6 ? mid : mid + jitter(rng, amp) }))
  const coord = (p: { a: number; b: number }) => (vertical ? `${p.b} ${p.a}` : `${p.a} ${p.b}`)
  const mids = points.slice(1).map((p, i) => ({ a: (points[i].a + p.a) / 2 + jitter(rng, length * 0.015), b: (points[i].b + p.b) / 2 + jitter(rng, amp * 0.5) }))
  const d = `M ${coord(points[0])} ${points
    .slice(1)
    .map((p, i) => `Q ${coord(mids[i])} ${coord(p)}`)
    .join(" ")}`
  return (
    <g>
      <path d={d} fill="none" stroke="#4a3d2c" strokeWidth={breadth * 0.4} strokeLinecap="butt" opacity={0.75} />
      <path d={d} fill="none" stroke="#71603f" strokeWidth={breadth * 0.28} strokeLinecap="butt" opacity={0.9} />
      <path d={d} fill="none" stroke="#8a7a52" strokeWidth={breadth * 0.1} strokeLinecap="butt" strokeDasharray={`${length * 0.05} ${length * 0.04}`} opacity={0.55} />
    </g>
  )
}

function Monolith({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const cx = w / 2
  const cy = h / 2
  const rw = w * 0.42
  const rh = h * 0.56
  const angle = jitter(rng, 12)
  const pts = [
    [cx - rw / 2 + jitter(rng, 2), cy - rh / 2 + jitter(rng, 2)],
    [cx + rw / 2 + jitter(rng, 2), cy - rh / 2 + jitter(rng, 3)],
    [cx + rw / 2 + jitter(rng, 3), cy + rh / 2 + jitter(rng, 2)],
    [cx - rw / 2 + jitter(rng, 2), cy + rh / 2 + jitter(rng, 2)],
  ]
    .map((p) => p.join(","))
    .join(" ")
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`}>
      {shadow(cx + rw * 0.25, cy + rh * 0.25, rw * 0.9, rh * 0.6)}
      <ellipse cx={cx} cy={cy + rh * 0.32} rx={rw * 0.75} ry={rh * 0.3} fill="#57534a" opacity={0.7} />
      <polygon points={pts} fill="#7d7871" stroke="#3f3b33" strokeWidth={1.8} />
      <polygon
        points={pts}
        fill="none"
        stroke="#9a948a"
        strokeWidth={1}
        opacity={0.55}
        transform={`translate(${-rw * 0.06} ${-rh * 0.06}) scale(0.85)`}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <line x1={cx - rw * 0.2} y1={cy - rh * 0.25} x2={cx + rw * 0.1} y2={cy + rh * 0.15} stroke="#4a463e" strokeWidth={1} opacity={0.7} />
      <ellipse cx={cx - rw * 0.28} cy={cy + rh * 0.2} rx={rw * 0.18} ry={rh * 0.1} fill="#55703c" opacity={0.6} />
    </g>
  )
}

function River({ seed, w, h }: PieceRenderProps) {
  const rng = makeRng(seed)
  const horizontal = w >= h
  const mid = horizontal ? h / 2 : w / 2
  const amp = (horizontal ? h : w) * 0.1
  const points = Array.from({ length: 7 }, (_, i) => {
    const t = (i / 6) * (horizontal ? w : h)
    const off = mid + (i === 0 || i === 6 ? 0 : jitter(rng, amp))
    return horizontal ? { x: t, y: off } : { x: off, y: t }
  })
  const d = `M ${points[0].x} ${points[0].y} ${points
    .slice(1)
    .map((p, i) => `Q ${(points[i].x + p.x) / 2} ${(points[i].y + p.y) / 2} ${p.x} ${p.y}`)
    .join(" ")}`
  const bw = horizontal ? h : w
  return (
    <g>
      <path d={d} fill="none" stroke="#57503f" strokeWidth={bw * 0.95} strokeLinecap="round" opacity={0.8} />
      <path d={d} fill="none" stroke="#2e4a58" strokeWidth={bw * 0.8} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#3e6478" strokeWidth={bw * 0.5} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#8fb3c2" strokeWidth={bw * 0.06} strokeLinecap="round" strokeDasharray={`${w * 0.1} ${w * 0.12}`} opacity={0.55} />
    </g>
  )
}

// --- registry ---------------------------------------------------------------------

// OpenPencil-designed art (design/mapview-pieces.op → scripts/mapview-pieces-compile.ts)
// takes precedence; code-drawn renderers below are the fallback for pieces without art.
function ArtPieceRenderer(art: PieceArt) {
  return function ArtPiece({ w, h }: PieceRenderProps) {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: markup is build-time compiled from the committed design/mapview-pieces.op, never user input
    return <g transform={`scale(${w / art.width} ${h / art.height})`} dangerouslySetInnerHTML={{ __html: art.markup }} />
  }
}

export const PIECE_RENDERERS: Record<string, (props: PieceRenderProps) => ReactNode> = {
  "tree-oak": TreeOak,
  "tree-pine": TreePine,
  boulder: Boulder,
  "rock-cluster": RockCluster,
  bush: Bush,
  pond: Pond,
  marsh: Marsh,
  "stone-wall": StoneWall,
  "ruined-wall": RuinedWall,
  "building-hut": BuildingHut,
  tent: Tent,
  gate: Gate,
  bridge: Bridge,
  well: Well,
  statue: Statue,
  altar: Altar,
  pillar: Pillar,
  fence: Fence,
  "crate-stack": CrateStack,
  barrels: Barrels,
  campfire: Campfire,
  wagon: Wagon,
  rubble: Rubble,
  chest: Chest,
  "market-stall": MarketStall,
  pit: Pit,
  spikes: Spikes,
  trail: Trail,
  monolith: Monolith,
  river: River,
}

export function getPieceRenderer(pieceId: string): ((props: PieceRenderProps) => ReactNode) | undefined {
  const art = PIECE_ART[pieceId]
  if (art) return ArtPieceRenderer(art)
  return PIECE_RENDERERS[pieceId]
}
