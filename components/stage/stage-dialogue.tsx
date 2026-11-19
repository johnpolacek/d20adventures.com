"use client"

// Dialogue on the stage: bands of paint anchored above whoever speaks, their ends washing out into the set and their
// colours taken from it, and a framed portrait plate that slides in on the speaker's side of the screen for named characters.

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export type Anchor = () => { x: number; y: number; visible: boolean; distance: number; ppm?: number } | null
// The set behind the bubbles, drawn small (Stage.thumbnail), so a band can take its colours from what it covers.
export type Backdrop = () => { image: ImageData; rect: DOMRect } | null
// A bubble shows only while its speaker reads as a person on screen (a wide shot hides it rather than shrinking it to
// unreadable), and scales a little with them, never below a readable size.
const SPEAKER_MIN_PX = 70
const bubbleScale = (speakerPx: number) => Math.min(1, 0.92 + (speakerPx - SPEAKER_MIN_PX) / 600)
// The band at the top of the screen that holds the turn order and the name under it. A bubble with no room above its
// speaker below that band sits beside their face instead, so it never runs under the portraits.
const SAFE_TOP = { wide: 150, compact: 96 }
// A bubble waits for the camera: pinned to a speaker, it would be dragged across the screen by every move and cut.
// It is hidden while the camera is on its way or its speaker slides faster than this, and fades in once both have
// been still a moment. A slow drift is under the speed, and the bubble rides it.
const MOVING_PX_PER_SECOND = 40
const STILL_MS = 120
const FADE_IN_MS = 300
const FADE_OUT_MS = 120
// A bubble is a band of paint: straight top and bottom with fine rules, ends that wash out into the set. The wash takes
// `fade` px at each end, and the words keep `room` px of solid paint clear of it.
const WASH = { wide: { fade: 80, room: 12 }, compact: { fade: 44, room: 8 } }
const PLAIN = { band: "#120d1c", accent: "#fcd34d", text: "#f4ecdc" }
export interface Bubble {
  key: number
  anchor: Anchor
  text: string
  named: boolean
}

type Side = "" | "l" | "r"

// The wash: a band-sized SVG mask, a horizontal fade broken up by cloudy noise so the ends bloom like watercolour.
// Drawn at the band's real size, so the texture never stretches. Beside a face, the end toward the speaker stays solid.
function washMask(w: number, h: number, fade: number, side: Side, seed: number) {
  const f = Math.min(fade, w * 0.3) / w
  const stop = (o: number, a = 1) => `<stop offset="${o.toFixed(4)}" stop-color="#fff" stop-opacity="${a}"/>`
  const stops = side === "r" ? stop(0) + stop(1 - f) + stop(1, 0) : side === "l" ? stop(0, 0) + stop(f) + stop(1) : stop(0, 0) + stop(f) + stop(1 - f) + stop(1, 0)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" x2="1">${stops}</linearGradient><filter id="f" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.024" numOctaves="4" seed="${seed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.6 0 0 0 -0.3" result="a"/><feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="0" k2="2" k3="1.2" k4="-1.2"/></filter></defs><rect width="${w}" height="${h}" fill="url(#g)" filter="url(#f)"/></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const css = (h: number, s: number, l: number) => `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// The band's colours, read from the set: the paint is a darker shade of what it covers, and the rules take the hue of
// the brightest, most coloured parts of the view (a fire gives peach, sunlit leaves a pale green).
function palette(backdrop: ReturnType<Backdrop>, box: DOMRect) {
  if (!backdrop) return PLAIN
  const { image, rect } = backdrop
  const { data, width, height } = image
  const sx = width / rect.width
  const sy = height / rect.height
  const x0 = clamp(Math.floor((box.left - rect.left) * sx), 0, width - 1)
  const x1 = clamp(Math.ceil((box.right - rect.left) * sx), x0 + 1, width)
  const y0 = clamp(Math.floor((box.top - rect.top) * sy), 0, height - 1)
  const y1 = clamp(Math.ceil((box.bottom - rect.top) * sy), y0 + 1, height)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n++
    }
  if (!n) return PLAIN
  const [h, s, l] = hsl(r / n, g / n, b / n)
  const vivid: [number, number, number][] = []
  for (let i = 0; i < data.length; i += 4) {
    const [hh, ss, ll] = hsl(data[i], data[i + 1], data[i + 2])
    vivid.push([ss * ll * (1 - Math.abs(ll - 0.6)), hh, ss])
  }
  vivid.sort((a, c) => c[0] - a[0])
  const top = vivid.slice(0, Math.max(8, Math.floor(vivid.length * 0.04)))
  let ax = 0
  let ay = 0
  let as = 0
  for (const [, hh, ss] of top) {
    ax += Math.cos((hh * Math.PI) / 180)
    ay += Math.sin((hh * Math.PI) / 180)
    as += ss
  }
  const ah = ((Math.atan2(ay, ax) * 180) / Math.PI + 360) % 360
  return {
    band: css(h, clamp(s * 0.85, 0.14, 0.42), clamp(l * 0.5, 0.035, 0.12)),
    accent: css(ah, clamp(as / top.length, 0.45, 0.8), 0.72),
    text: css(h, 0.3, 0.94),
  }
}

function BubbleView({ bubble, compact, moving, backdrop }: { bubble: Bubble; compact: boolean; moving?: () => boolean; backdrop?: Backdrop }) {
  const ref = useRef<HTMLDivElement>(null)
  const paint = useRef<HTMLSpanElement>(null)
  const cameraMoving = useRef(moving)
  cameraMoving.current = moving
  const behind = useRef(backdrop)
  behind.current = backdrop
  // Hosts may hand a fresh bubble object every render. Following it through a ref keeps the loop (and its fade) running,
  // so a re-render does not hide the bubble and fade it in again.
  const current = useRef(bubble)
  current.current = bubble
  const layout = useRef(compact)
  layout.current = compact
  useEffect(() => {
    let raf = 0
    let last: { x: number; y: number; at: number } | null = null
    let still: number | null = null
    let shown = false
    let masked = ""
    const wash = () => {
      const el = ref.current
      const band = paint.current
      if (!el || !band) return
      const side = (el.dataset.side ?? "") as Side
      const key = `${band.offsetWidth}x${band.offsetHeight}${side}`
      if (key === masked || !band.offsetWidth) return
      masked = key
      const m = washMask(band.offsetWidth, band.offsetHeight, (layout.current ? WASH.compact : WASH.wide).fade, side, (current.current.key % 97) + 3)
      band.style.maskImage = m
      band.style.webkitMaskImage = m
    }
    const follow = () => {
      raf = requestAnimationFrame(follow)
      const p = current.current.anchor()
      const el = ref.current
      if (!p || !el) return
      const now = performance.now()
      const speed = last && now > last.at ? (Math.hypot(p.x - last.x, p.y - last.y) / (now - last.at)) * 1000 : 0
      last = { x: p.x, y: p.y, at: now }
      if (cameraMoving.current?.() || speed > MOVING_PX_PER_SECOND) still = null
      else still ??= now
      const speakerPx = (p.ppm ?? 1600 / p.distance) * 1.7
      const seen = p.visible && speakerPx >= SPEAKER_MIN_PX
      const on = seen && still !== null && now - still >= STILL_MS
      el.style.transitionDuration = `${on ? FADE_IN_MS : FADE_OUT_MS}ms`
      el.style.opacity = on ? "1" : "0"
      if (!on) shown = false
      if (!seen) return
      const scale = bubbleScale(speakerPx)
      const h = el.offsetHeight * scale
      const w = el.offsetWidth * scale
      const safe = layout.current ? SAFE_TOP.compact : SAFE_TOP.wide
      if (p.y - 8 - h >= safe) {
        el.dataset.side = ""
        el.style.transformOrigin = "bottom center"
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, calc(-100% - 12px)) scale(${scale.toFixed(3)})`
      } else {
        // Beside the face, clear of the head however large the shot draws it, its solid end toward the speaker.
        const room = el.parentElement?.clientWidth ?? window.innerWidth
        const ppm = p.ppm ?? 1600 / p.distance
        const gap = Math.max(32, ppm * 0.2)
        const right = p.x + gap + w < room - 16
        const face = p.y + ppm * 0.22
        const top = Math.max(safe, face - h * 0.5)
        el.dataset.side = right ? "r" : "l"
        el.style.transformOrigin = right ? "top left" : "top right"
        const x = right ? p.x + gap : p.x - gap - el.offsetWidth
        el.style.transform = `translate(${x.toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale.toFixed(3)})`
      }
      wash()
      // The colours are read once, as the bubble comes in, from the set where it now sits.
      if (on && !shown) {
        shown = true
        const c = palette(behind.current?.() ?? null, el.getBoundingClientRect())
        el.style.setProperty("--band", c.band)
        el.style.setProperty("--accent", c.accent)
        el.style.setProperty("--ink", c.text)
      }
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [bubble.key])
  const { fade, room } = compact ? WASH.compact : WASH.wide
  return (
    <div
      ref={ref}
      style={{ ["--pad" as string]: `${fade + room}px` }}
      className={cn(
        "group absolute top-0 left-0 isolate w-max origin-bottom text-center font-serif text-(--ink) italic opacity-0 transition-opacity [text-shadow:0_1px_2px_#0009] [text-wrap:balance] [--accent:#fcd34d] [--band:#120d1c] [--ink:#f4ecdc]",
        "px-(--pad) data-[side=l]:pr-[22px] data-[side=l]:text-right data-[side=r]:pl-[22px] data-[side=r]:text-left",
        compact ? "max-w-[300px] py-2 text-[14px] leading-[1.32]" : "max-w-[500px] pt-[15px] pb-4 text-[18px] leading-[1.34]"
      )}
    >
      <span ref={paint} aria-hidden="true" className="absolute inset-0 -z-10 bg-(--band) opacity-[.94] [mask-size:100%_100%]" />
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent)_30%,var(--accent)_70%,transparent)] group-data-[side=l]:bg-[linear-gradient(270deg,var(--accent),var(--accent)_60%,transparent)] group-data-[side=r]:bg-[linear-gradient(90deg,var(--accent),var(--accent)_60%,transparent)]",
          bubble.named ? "opacity-[.62]" : "opacity-[.36]"
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent)_30%,var(--accent)_70%,transparent)] group-data-[side=l]:bg-[linear-gradient(270deg,var(--accent),var(--accent)_60%,transparent)] group-data-[side=r]:bg-[linear-gradient(90deg,var(--accent),var(--accent)_60%,transparent)]",
          bubble.named ? "opacity-[.62]" : "opacity-[.36]"
        )}
      />
      {bubble.text}
      <span
        aria-hidden="true"
        className="absolute bottom-[-5px] left-[calc(50%-5px)] size-[9px] rotate-45 border border-[color-mix(in_srgb,var(--accent)_62%,transparent)] bg-(--band) group-data-[side=l]:hidden group-data-[side=r]:hidden"
      />
    </div>
  )
}

// `moving` says whether the camera is on its way to a view (Stage.cameraMoving). `backdrop` hands over the set behind the
// bubbles (Stage.thumbnail), for their colours. Without it they keep a plain dark paint.
export function Bubbles({ bubbles, compact = false, moving, backdrop }: { bubbles: Bubble[]; compact?: boolean; moving?: () => boolean; backdrop?: Backdrop }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-live="polite">
      {bubbles.map((b) => (
        <BubbleView key={b.key} bubble={b} compact={compact} moving={moving} backdrop={backdrop} />
      ))}
    </div>
  )
}

export interface PlateLine {
  key: number
  side: "left" | "right"
  name: string
  role?: string
  portrait?: string
  text: string
}

// A plate is placed on its side of the screen, or docked in a column the caller lays out (above the narration).
export function Plate({ line, compact = false, docked = false }: { line: PlateLine; compact?: boolean; docked?: boolean }) {
  return (
    <div
      key={line.key}
      className={cn(
        "plate-in pointer-events-none z-20 flex items-stretch rounded-[5px] stage-grain border border-stage-brass/60 bg-[#27190ff4] shadow-[0_0_0_3px_#1c1410c0,0_0_0_4px_#c79a5a44,0_18px_44px_#0008,inset_0_1px_0_#f0d6b214,inset_0_0_40px_#0000004d]",
        compact ? "p-1.5" : "p-[11px]",
        docked
          ? "w-full"
          : cn(
              "absolute",
              compact ? "bottom-[54px] w-[min(330px,46vw)]" : "bottom-[122px] w-[min(410px,calc(100%-28px))]",
              line.side === "left" ? (compact ? "left-4" : "left-11") : compact ? "right-4" : "right-10"
            )
      )}
      style={{ ["--plate-from" as string]: line.side === "left" ? "-70px" : "70px" }}
    >
      {line.portrait && (
        <div className={cn("relative flex-none border border-stage-brass bg-stage-ink p-[3px] shadow-[inset_0_0_0_1px_#000a,0_2px_8px_#0006]", compact ? "h-[74px] w-[58px]" : "h-[140px] w-[112px]")}>
          <img src={line.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)_contrast(1.02)_brightness(.98)]" />
          <div className="pointer-events-none absolute inset-[3px] shadow-[inset_0_0_20px_#1c1410aa,inset_0_0_0_1px_#f3d6a622]" />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-col justify-center", compact ? "px-2.5" : "py-1 pr-2.5 pl-4")}>
        <div className={cn("font-serif leading-[1.1] text-[#f3d6a6]", compact ? "text-[15px]" : "text-[21px]")}>{line.name}</div>
        {line.role && !compact && <div className="mt-1 text-[8.5px] tracking-[0.22em] text-stage-gold uppercase">{line.role}</div>}
        <div
          className={cn(
            "border-t border-stage-brass/25 font-serif text-stage-cream italic",
            compact ? "mt-1.5 line-clamp-2 pt-1.5 text-[12px] leading-snug" : "mt-2.5 line-clamp-4 pt-2.5 text-[15px] leading-[1.45]"
          )}
        >
          “{line.text}”
        </div>
      </div>
    </div>
  )
}
