"use client"

// The city map: the whole city and the land round it, a district up close, or a small view of where the party is.
// Drawn from the setting's map file, showing only the places the party has reached, joined by the trail between them.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { type Box, boxAround, type CityMap, centroid, districtBox, frameBox, type MapShape, type Point, placeAt, placeName } from "@/lib/citymap"
import { cn } from "@/lib/utils"
import { eyebrow, Pill, panel } from "./hud"

const INK = "#2b1a10"
// The pale edge round every label, so it reads over the painting.
const HALO = "#f4ead2"
const TRAIL = "#b8862e"
const HERE = "#a3261f"
const BELOW = "#6d3fa0"
const GROUND = { low: "#d9cfb8", middle: "#cfc3a6", high: "#c2b28e" }

// Map units per screen pixel below which the view counts as up close: every place is named and districts show their own painting.
const CLOSE = 1.2

const points = (p: Point[] = []) => p.map((q) => q.join(",")).join(" ")

// The map in a box of map units. Text and lines keep their size on screen whatever the zoom. Zoomed out, only where
// the party is now is named. Without `names`, only districts and forests are.
export function CityMapView({
  map,
  trail,
  box,
  fill,
  onDistrict,
  className,
  names = true,
}: {
  map: CityMap
  trail: string[]
  box: Box
  fill?: boolean
  onDistrict?: (id: string) => void
  className?: string
  names?: boolean
}) {
  const ref = useRef<SVGSVGElement>(null)
  const shown = useTween(box)
  const [size, setSize] = useState({ width: 300, height: 300 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth || 300, height: el.clientHeight || 300 })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // Map units per screen pixel. A sliced box fills the view and a met one fits inside it.
  const across = shown[2] / size.width
  const down = shown[3] / size.height
  const u = fill ? Math.min(across, down) : Math.max(across, down)
  const here = trail[trail.length - 1]
  const visited = new Set(trail)
  const landmarks = map.landmarks.filter((l) => visited.has(l.id))
  const byId = Object.fromEntries(map.landmarks.map((l) => [l.id, l]))
  const tunnels = map.tunnels.flatMap((t) =>
    t.path
      .slice(1)
      .map((id, i) => [t.path[i], id])
      .filter(([a, b]) => visited.has(a) && visited.has(b))
  )
  const steps = trail.map((id) => placeAt(map, id)).filter((p): p is Point => p !== null)
  const herePoint = placeAt(map, here)
  const clip = useId()
  const art = map.art
  const painted = Boolean(art?.outer)
  const shape = (s: MapShape, fillColor: string) => <polygon key={s.id} points={points(s.polygon)} fill={fillColor} />
  return (
    <svg
      ref={ref}
      viewBox={shown.join(" ")}
      preserveAspectRatio={fill ? "xMidYMid slice" : "xMidYMid meet"}
      className={cn("block h-full w-full", className)}
      role="img"
      aria-label={`Map of ${map.name}`}
    >
      <defs>
        <pattern id="city-map-trees" width={22 * u} height={20 * u} patternUnits="userSpaceOnUse">
          <circle cx={6 * u} cy={6 * u} r={5 * u} fill="#6f8f55" />
          <circle cx={17 * u} cy={15 * u} r={5 * u} fill="#64844b" />
        </pattern>
      </defs>
      <rect x={map.frame.x - 2000} y={map.frame.y - 2000} width={map.frame.width + 4000} height={map.frame.height + 4000} fill="#e3dcc2" />
      {art?.outer && <image href={art.outer.src} x={art.outer.box[0]} y={art.outer.box[1]} width={art.outer.box[2]} height={art.outer.box[3]} preserveAspectRatio="none" />}
      {/* Up close, each district's own painting, cut to its outline. */}
      {art &&
        u < CLOSE &&
        map.districts.map((d) => {
          const a = art.districts[d.id]
          return (
            a && (
              <g key={d.id}>
                <clipPath id={`${clip}-${d.id}`}>
                  <polygon points={points(d.artClip ?? d.polygon)} />
                </clipPath>
                <image href={a.src} x={a.box[0]} y={a.box[1]} width={a.box[2]} height={a.box[3]} preserveAspectRatio="none" clipPath={`url(#${clip}-${d.id})`} />
              </g>
            )
          )
        })}
      {!painted && (
        <>
          {map.forests.map((f) => (
            <g key={f.id}>
              {shape(f, "#86a56a")}
              <polygon points={points(f.polygon)} fill="url(#city-map-trees)" opacity={0.7} />
            </g>
          ))}
          {map.water.map((w) => shape(w, "#8fb3c4"))}
          {map.districts.map((d) => (
            <polygon
              key={d.id}
              points={points(d.polygon)}
              fill={GROUND[d.elevation]}
              stroke="#a89470"
              strokeWidth={1.2 * u}
              className={cn(onDistrict && "cursor-pointer transition-[filter] hover:brightness-105")}
              onClick={onDistrict && (() => onDistrict(d.id))}
            />
          ))}
          {map.rivers.map((r) => (
            <polyline key={r.id} points={points(r.path)} fill="none" stroke="#8fb3c4" strokeWidth={r.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {map.walls.map((w) => (
            <polyline key={w.id} points={points(w.path)} fill="none" stroke="#5b4a35" strokeWidth={Math.max(4, 3 * u)} strokeLinejoin="round" />
          ))}
          {map.roads.map((r) => (
            <polyline key={r.id} points={points(r.path)} fill="none" stroke="#9a7b52" strokeWidth={2.5 * u} strokeDasharray={`${8 * u} ${4 * u}`} />
          ))}
        </>
      )}
      {/* Over the painting, districts are only there to be picked. */}
      {painted &&
        onDistrict &&
        map.districts.map((d) => (
          <polygon
            key={d.id}
            points={points(d.polygon)}
            fill="transparent"
            stroke="#f3e2b8"
            strokeWidth={2 * u}
            className="cursor-pointer [stroke-opacity:0] hover:[stroke-opacity:.9]"
            onClick={() => onDistrict(d.id)}
          />
        ))}
      {tunnels.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} stroke={BELOW} strokeWidth={2.5 * u} strokeDasharray={`${4 * u} ${4 * u}`} />
      ))}
      {steps.length > 1 && <polyline points={points(steps)} fill="none" stroke={TRAIL} strokeWidth={2 * u} strokeDasharray={`${2 * u} ${5 * u}`} strokeLinecap="round" opacity={0.55} />}
      {map.districts.map((d) => {
        const [x, y] = d.labelAt ?? centroid(d.polygon)
        // A name cut off at the edge reads as a misspelling, so one that would not fit is left out. Georgia averages
        // about 0.55 of its size per letter.
        const half = (d.name.length * 0.55 * (u < CLOSE ? 16 : 12) * u) / 2
        if (x - half < shown[0] || x + half > shown[0] + shown[2]) return null
        return (
          <text
            key={d.id}
            x={x}
            y={y}
            textAnchor="middle"
            fill={INK}
            fontSize={(u < CLOSE ? 16 : 12) * u}
            fontWeight={700}
            fontFamily="Georgia, serif"
            letterSpacing={0.5 * u}
            paintOrder="stroke"
            stroke={HALO}
            strokeWidth={4 * u}
            strokeLinejoin="round"
            pointerEvents="none"
          >
            {d.name}
          </text>
        )
      })}
      {map.forests.map((f) => {
        const [x, y] = f.labelAt ?? centroid(f.polygon ?? [])
        return (
          <text
            key={f.id}
            x={x}
            y={y}
            textAnchor="middle"
            fill="#2f4a22"
            fontSize={16 * u}
            fontStyle="italic"
            fontWeight={700}
            fontFamily="Georgia, serif"
            paintOrder="stroke"
            stroke="#eef2dd"
            strokeWidth={4 * u}
            strokeLinejoin="round"
            pointerEvents="none"
          >
            {f.name}
          </text>
        )
      })}
      {landmarks.map((l) => {
        const color = l.below ? BELOW : l.id === here ? HERE : "#7a3d22"
        const [dx, dy, anchor] = { left: [-9, 5, "end"], above: [0, -11, "middle"], below: [0, 19, "middle"], right: [9, 5, "start"] }[l.label ?? "right"] as [
          number,
          number,
          "start" | "middle" | "end",
        ]
        return (
          <g key={l.id}>
            <circle cx={l.x} cy={l.y} r={4.5 * u} fill={l.below ? "#fff" : color} stroke={color} strokeWidth={2 * u} />
            {names && (u < CLOSE || l.id === here) && (
              <text
                x={l.x + dx * u}
                y={l.y + dy * u}
                textAnchor={anchor}
                fill={l.below || l.id === here ? color : INK}
                fontSize={13 * u}
                fontWeight={l.id === here ? 700 : 600}
                fontFamily="Georgia, serif"
                paintOrder="stroke"
                stroke={HALO}
                strokeWidth={4 * u}
                strokeLinejoin="round"
                pointerEvents="none"
              >
                {l.name}
              </text>
            )}
          </g>
        )
      })}
      {herePoint && (
        <circle cx={herePoint[0]} cy={herePoint[1]} r={7 * u} fill="none" stroke={HERE} strokeWidth={2 * u}>
          <animate attributeName="r" values={`${7 * u};${16 * u}`} dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

// The small view over the stage: the streets round where the party is. Opens the full map.
export function CityMapInset({ map, trail, onOpen, className }: { map: CityMap; trail: string[]; onOpen: () => void; className?: string }) {
  const here = placeAt(map, trail[trail.length - 1])
  const box = useMemo(() => (here ? boxAround(map, here, 640, 1.4) : frameBox(map)), [map, here?.[0], here?.[1]])
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the map"
      className={cn(panel, "block h-[180px] w-[252px] overflow-hidden p-0 transition-[border-color] hover:border-stage-gold", className)}
    >
      <CityMapView map={map} trail={trail} box={box} fill names={false} />
    </button>
  )
}

// The full map: the city and the land round it, or one district up close.
export function CityMapPanel({ map, trail, compact, onClose }: { map: CityMap; trail: string[]; compact?: boolean; onClose: () => void }) {
  const [view, setView] = useState<string>("all")
  const here = trail[trail.length - 1]
  const hereDistrict = map.landmarks.find((l) => l.id === here)?.district ?? map.districts.find((d) => d.id === here)?.id
  const district = map.districts.find((d) => d.id === view)
  // A painted map is square: the view is a painting's own box, in a square frame.
  const art = district ? map.art?.districts[district.id] : map.art?.outer
  const box = art?.box ?? (district ? districtBox(district) : frameBox(map))
  return (
    <section className={cn(panel, "absolute z-40 flex flex-col", compact ? "inset-3" : "inset-x-10 top-24 bottom-6")} aria-label="Map">
      <header className="flex flex-wrap items-center gap-2 border-b border-stage-line/20 px-5 py-3">
        <div className="mr-3">
          <div className={eyebrow}>Map</div>
          <h2 className="font-serif text-xl">{district?.name ?? map.name}</h2>
          <p className="text-xs text-stage-muted">You are at {placeName(map, here)}</p>
        </div>
        <Pill active={view === "all"} onClick={() => setView("all")}>
          {map.name}
        </Pill>
        {map.districts.map((d) => (
          <Pill key={d.id} active={view === d.id} onClick={() => setView(d.id)}>
            {d.name}
            {d.id === hereDistrict ? " ·" : ""}
          </Pill>
        ))}
        <Pill className="ml-auto" onClick={onClose}>
          Close
        </Pill>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-3">
        <div className={cn("relative h-full max-w-full overflow-hidden rounded-sm", art ? "aspect-square" : "w-full")}>
          <CityMapView map={map} trail={trail} box={box} onDistrict={view === "all" ? setView : undefined} />
        </div>
      </div>
    </section>
  )
}

// Eases the view box to a new one.
function useTween(target: Box, ms = 450) {
  const [box, setBox] = useState(target)
  const from = useRef(target)
  const key = target.join(",")
  useEffect(() => {
    const start = from.current
    const began = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ms)
      const e = 1 - (1 - t) ** 3
      const next = start.map((v, i) => v + (target[i] - v) * e) as Box
      from.current = next
      setBox(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [key])
  return box
}
