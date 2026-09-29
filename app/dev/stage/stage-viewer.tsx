"use client"

// Client half of /dev/stage: builds the set with the Stage runtime and shows a dense HUD for shots, tiers, the
// quality switches and render stats. three.js loads inside the effect, so nothing WebGL touches the server bundle.

import { useEffect, useRef, useState } from "react"
import type { Flags, Stage, StageStats, TierName } from "@/lib/stage"

interface Props {
  setKey: string
  stagingKey: string | null
  params: Record<string, string | undefined>
  sets: string[]
  stagings: string[]
}
interface Speaker {
  id: string
  name: string
  role: string
  portrait?: string
}

const TIERS: TierName[] = ["mobile", "balanced", "high", "ultra"]
const pill = (on: boolean) => `rounded border px-1.5 py-0.5 ${on ? "border-[#f2c97a] bg-[#f2c97a33] text-[#f2c97a]" : "border-[#e6c89640] text-[#e9dcc3b0] hover:border-[#f2c97a99]"}`

function flagsFrom(p: Props["params"]): Partial<Flags> {
  const f: Partial<Flags> = {}
  if (p.crowd === "procedural" || p.crowd === "cards" || p.crowd === "hybrid") f.crowd = p.crowd
  if (p.aa === "off" || p.aa === "fxaa" || p.aa === "msaa") f.aa = p.aa
  if (p.ao === "on" || p.ao === "off") f.ao = p.ao === "on"
  if (p.bloom === "on" || p.bloom === "off") f.bloom = p.bloom === "on"
  if (p.paint === "uniform" || p.paint === "depth") f.paint = p.paint
  if (p.dpr && Number(p.dpr) > 0) f.dpr = Number(p.dpr)
  if (p.cardr && Number(p.cardr) > 0) f.cardRadius = Number(p.cardr)
  if (p.brush && Number(p.brush) >= 0) f.brush = Number(p.brush)
  return f
}

export function StageViewer({ setKey, stagingKey, params, sets, stagings }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const [status, setStatus] = useState("Loading")
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState("")
  const [shots, setShots] = useState<[string, string | undefined][]>([])
  const [stats, setStats] = useState<StageStats | null>(null)
  const [hidden, setHidden] = useState(false)
  const [speaker, setSpeaker] = useState<Speaker | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let stage: Stage | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      const [{ createStage }, { SETS, STAGINGS }] = await Promise.all([import("@/lib/stage"), import("@/lib/stage/sets")])
      const staging = stagingKey ? await STAGINGS[stagingKey]?.() : null
      const stagedSet = staging && typeof staging === "object" && "set" in staging ? String((staging as { set: string }).set) : null
      const key = params.set ? setKey : stagedSet && SETS[stagedSet] ? stagedSet : setKey
      const set = await SETS[key]()
      if (cancelled) return
      const tier = TIERS.includes(params.tier as TierName) ? (params.tier as TierName) : "auto"
      stage = await createStage({ container, set, staging: stagedSet === key ? staging : null, tier, flags: flagsFrom(params), motion: params.motion !== "0", onProgress: setStatus })
      if (cancelled) {
        stage.dispose()
        return
      }
      stageRef.current = stage
      if (params.shot) stage.shot(params.shot, { instant: true })
      ;(window as unknown as { __stage?: Stage }).__stage = stage
      setTitle(stage.set.title)
      setShots(Object.entries(stage.shots).map(([k, s]) => [k, s.label]))
      await stage.firstFrame
      setReady(true)
      interval = setInterval(() => setStats(stage?.stats() ?? null), 500)
    })().catch((error) => {
      console.error(error)
      setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`)
      ;(window as unknown as { __stageError?: string }).__stageError = String(error instanceof Error ? error.message : error)
    })
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      stage?.dispose()
      stageRef.current = null
      ;(window as unknown as { __stage?: Stage }).__stage = undefined
    }
  }, [setKey, stagingKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.("input,textarea,select")) return
      if (e.key === "h" || e.key === "H") setHidden((h) => !h)
      if (e.key === "Escape") setSpeaker(null)
      const i = Number(e.key) - 1
      if (i >= 0 && i < shots.length) stageRef.current?.shot(shots[i][0])
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [shots])

  // The speaker's bubble follows their head.
  useEffect(() => {
    if (!speaker) return
    let raf = 0
    const follow = () => {
      raf = requestAnimationFrame(follow)
      const p = stageRef.current?.project(speaker.id)
      const el = bubbleRef.current
      if (!p || !el) return
      el.style.opacity = p.visible ? "1" : "0"
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${Math.min(1, Math.max(0.6, 16 / p.distance)).toFixed(3)})`
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [speaker])

  const stage = stageRef.current
  const set = (fn: (s: Stage) => void) => {
    if (stageRef.current) fn(stageRef.current)
    setStats(stageRef.current?.stats() ?? null)
  }
  const onPointer = (() => {
    let down: [number, number] | null = null
    return {
      onPointerDown: (e: React.PointerEvent) => {
        down = [e.clientX, e.clientY]
      },
      onPointerUp: (e: React.PointerEvent) => {
        const s = stageRef.current
        if (!s || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const id = s.pick(e.clientX - r.left, e.clientY - r.top)
        const c = id ? s.cast.find((m) => m.id === id) : null
        setSpeaker(c ? { id: c.id, name: c.name, role: c.role, portrait: c.art.portrait } : null)
      },
    }
  })()

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
      <div ref={containerRef} className="absolute inset-0" {...onPointer} />
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d0b09]">
          <div className="text-2xl tracking-[0.18em] text-[#f2c97a]">{(title || setKey).toUpperCase()}</div>
          <div className="mt-3 text-sm opacity-70">{status}</div>
        </div>
      )}
      {speaker && (
        <>
          <div
            ref={bubbleRef}
            className="pointer-events-none absolute top-0 left-0 z-20 max-w-[260px] rounded-lg border border-[#e6c89660] bg-[#f4ead6] px-3 py-1.5 text-[13px] text-[#2a1f14] shadow-lg"
          >
            {speaker.name}
          </div>
          <div className="absolute right-4 bottom-4 z-20 flex w-[340px] items-center gap-3 rounded-md border border-[#e6c89640] bg-[#0e0a06d0] p-2 backdrop-blur-sm">
            {/* biome-ignore lint/performance/noImgElement: dev-only viewer showing a local fixture */}
            {speaker.portrait && <img src={speaker.portrait} alt="" className="h-20 w-20 rounded object-cover object-top" />}
            <div className="text-xs">
              <div className="text-[15px] text-[#f2c97a]">{speaker.name}</div>
              <div className="opacity-70">{speaker.role}</div>
            </div>
          </div>
        </>
      )}
      {ready && !hidden && stage && (
        <div className="absolute top-3 left-3 z-20 max-w-[520px] space-y-1.5 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-2 text-[11px] leading-snug backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] tracking-[0.06em] text-[#f2c97a]">{title}</span>
            <span className="opacity-60">{stagingKey ?? setKey}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {shots.map(([k, label], i) => (
              <button key={k} className={pill(stats?.shot === k)} title={label} onClick={() => set((s) => s.shot(k))}>
                {i + 1} {k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-10 opacity-60">tier</span>
            {TIERS.map((t) => (
              <button key={t} className={pill(stats?.tier === t)} onClick={() => set((s) => s.setTier(t))}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-10 opacity-60">crowd</span>
            {(["procedural", "cards", "hybrid"] as const).map((m) => (
              <button key={m} className={pill(stage.flags.crowd === m)} onClick={() => set((s) => s.setFlags({ crowd: m }))}>
                {m}
              </button>
            ))}
            <span className="ml-2 w-6 opacity-60">aa</span>
            {(["off", "fxaa", "msaa"] as const).map((m) => (
              <button key={m} className={pill(stats?.aa === m)} onClick={() => set((s) => s.setFlags({ aa: m }))}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-10 opacity-60">paint</span>
            {(["uniform", "depth"] as const).map((m) => (
              <button key={m} className={pill(stage.flags.paint === m)} onClick={() => set((s) => s.setFlags({ paint: m }))}>
                {m}
              </button>
            ))}
            <button className={pill(stage.flags.brush > 0.01)} onClick={() => set((s) => s.setFlags({ brush: s.flags.brush > 0.01 ? 0 : 1 }))}>
              brush
            </button>
            <button className={pill(!!stats?.ao)} onClick={() => set((s) => s.setFlags({ ao: !s.pipeline.gtao.enabled }))}>
              ao
            </button>
            <button className={pill(!!stats?.bloom)} onClick={() => set((s) => s.setFlags({ bloom: !s.pipeline.bloom.enabled }))}>
              bloom
            </button>
            <button className={pill(stage.motion)} onClick={() => set((s) => (s.motion = !s.motion))}>
              motion
            </button>
            <button
              className={pill(false)}
              onClick={async () => {
                const blob = await stageRef.current?.capture()
                if (!blob) return
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = `stage-${stats?.shot ?? "view"}.png`
                a.click()
                setTimeout(() => URL.revokeObjectURL(a.href), 2000)
              }}
            >
              capture
            </button>
          </div>
          {stats && (
            <div className="font-mono text-[10px] opacity-75">
              {stats.fps} fps · {stats.calls} calls · {(stats.triangles / 1e6).toFixed(2)}M tris · {stats.people} people / {stats.cards} cards · dpr {stats.dpr} · paint {stats.paintHeight}px ·{" "}
              {stats.programs} programs
            </div>
          )}
          <div className="flex flex-wrap gap-2 opacity-60">
            {sets.map((k) => (
              <a key={k} href={`/dev/stage?set=${k}&staging=none`} className={k === setKey && !stagingKey ? "underline" : ""}>
                {k}
              </a>
            ))}
            {stagings.map((k) => (
              <a key={k} href={`/dev/stage?staging=${k}`} className={k === stagingKey ? "underline" : ""}>
                {k}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
