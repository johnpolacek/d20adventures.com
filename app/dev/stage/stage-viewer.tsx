"use client"

// Client half of /dev/stage: builds the set with the Stage runtime and shows a dense HUD for shots, tiers, the
// quality switches and render stats. three.js loads inside the effect, so nothing WebGL touches the server bundle.

import type { Flags, PropKind, Stage, StageStats, TierName } from "@d20/stage"
import { compose, type Moment, planTakes } from "@d20/stage/director"
import { useEffect, useRef, useState } from "react"
import { Button } from "@d20/ui/button"
import { Tip } from "@d20/ui/tooltip"

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

// The director's takes, played on the staging's first two cast members (a acts, b is acted on), with the effect or the
// fall the moment would bring, so the impact and the move can be judged as they play.
type Play = "slash" | "bolt" | "burst" | "fall" | null
const TAKES: { key: string; moment: (a: string, b: string, s: Stage) => Moment; play: Play }[] = [
  { key: "establish", moment: (a, b) => ({ kind: "establish", party: [a, b] }), play: null },
  { key: "calm", moment: (a, b) => ({ kind: "line", speaker: a, listener: b, tone: "calm" }), play: null },
  { key: "reply", moment: (a, b) => ({ kind: "line", speaker: b, listener: a, tone: "calm" }), play: null },
  { key: "tense", moment: (a, b) => ({ kind: "line", speaker: a, listener: b, tone: "tense" }), play: null },
  { key: "hushed", moment: (a, b) => ({ kind: "line", speaker: a, listener: b, tone: "hushed" }), play: null },
  { key: "shout", moment: (a, b) => ({ kind: "line", speaker: a, listener: b, tone: "loud" }), play: null },
  { key: "windup", moment: (a, b) => ({ kind: "windup", actor: a, target: b, outcome: "hit" }), play: null },
  { key: "hit", moment: (a, b) => ({ kind: "strike", actor: a, target: b, outcome: "hit" }), play: "slash" },
  { key: "crit windup", moment: (a, b) => ({ kind: "windup", actor: a, target: b, outcome: "crit" }), play: null },
  { key: "crit", moment: (a, b) => ({ kind: "strike", actor: a, target: b, outcome: "crit" }), play: "slash" },
  { key: "miss", moment: (a, b) => ({ kind: "strike", actor: a, target: b, outcome: "miss" }), play: null },
  { key: "fumble", moment: (a, b) => ({ kind: "strike", actor: a, target: b, outcome: "fumble" }), play: null },
  { key: "bolt", moment: (a, b) => ({ kind: "spell", actor: a, target: b, outcome: "hit" }), play: "bolt" },
  { key: "burst", moment: (a) => ({ kind: "spell", actor: a, area: true, outcome: "hit" }), play: "burst" },
  { key: "kill", moment: (a, b) => ({ kind: "kill", victim: b, killer: a }), play: "fall" },
  { key: "death save", moment: (a) => ({ kind: "deathSave", hero: a, success: false }), play: null },
  { key: "nat 20", moment: (a) => ({ kind: "check", actor: a, success: true, natural: 20 }), play: null },
  { key: "heal", moment: (a, b) => ({ kind: "heal", actor: a, target: b }), play: null },
  {
    key: "monster",
    moment: (a, b, s) => {
      const c = s.castAt(b)
      return { kind: "entrance", who: b, monster: true, from: [c.x + Math.sin(c.ry) * 8, c.z + Math.cos(c.ry) * 8], home: [c.x, c.z] }
    },
    play: null,
  },
]
let takeCount = 0
function playTake(stage: Stage, t: (typeof TAKES)[number]) {
  const [a, b] = stage.cast.filter((c) => stage.isOnStage(c.id)).map((c) => c.id)
  if (!a || !b) return
  for (const id of [a, b]) if (stage.isDown(id)) stage.setDown(id, false, true)
  const [plan] = planTakes([t.moment(a, b, stage)], `dev:${takeCount++}`)
  const take = plan && compose(plan, { cast: stage.cast.filter((c) => stage.isOnStage(c.id)), clear: (from, at) => !stage.reach(from.id, at, 4).short })
  if (!take) return
  stage.shot(take.shot, { instant: take.cut, follow: take.follow, duration: take.duration, ease: take.ease, move: take.move, impact: take.impact, take: take.label })
  void stage.shotSettled().then(() => {
    if (t.play === "slash" || t.play === "bolt") void stage.effect(t.play, a, b, t.play === "bolt" ? "lightning" : undefined)
    if (t.play === "burst") void stage.effect("burst", a, undefined, "fire")
    if (t.play === "fall") {
      void stage.effect("slash", a, b)
      setTimeout(() => stage.setDown(b, true), 900)
    }
  })
}

// An object handed from one cast member to another, picked beside the button: the staging's first two unless chosen.
// &prop=<kind> picks the object, scrollcase if not.
function handOff(stage: Stage, from: string, to: string) {
  const [a, b] = stage.cast.filter((c) => stage.isOnStage(c.id) && !stage.isDown(c.id)).map((c) => c.id)
  const giver = from || a
  const receiver = to || b
  if (!giver || !receiver || giver === receiver) return
  void stage.prop((new URLSearchParams(location.search).get("prop") ?? "scrollcase") as PropKind, giver, receiver)
}

function flagsFrom(p: Props["params"]): Partial<Flags> {
  const f: Partial<Flags> = {}
  if (p.crowd === "procedural" || p.crowd === "cards" || p.crowd === "hybrid") f.crowd = p.crowd
  if (p.aa === "off" || p.aa === "fxaa" || p.aa === "msaa") f.aa = p.aa
  if (p.ao === "on" || p.ao === "off") f.ao = p.ao === "on"
  if (p.bloom === "on" || p.bloom === "off") f.bloom = p.bloom === "on"
  if (p.dof === "on" || p.dof === "off") f.dof = p.dof === "on"
  if (p.paint === "uniform" || p.paint === "depth") f.paint = p.paint
  if (p.dpr && Number(p.dpr) > 0) f.dpr = Number(p.dpr)
  if (p.cardr && Number(p.cardr) > 0) f.cardRadius = Number(p.cardr)
  if (p.brush && Number(p.brush) >= 0) f.brush = Number(p.brush)
  if (p.figures === "on" || p.figures === "off") f.figures = p.figures === "on"
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
  // &panel=0 starts with the panel put away, as h does: for a page that frames this one.
  const [hidden, setHidden] = useState(params.panel === "0")
  // Everything below the shot buttons sits in a collapsed section; whether it was left open is remembered per browser.
  const [more, setMore] = useState(false)
  useEffect(() => {
    try {
      setMore(localStorage.getItem("stage-viewer-more") === "1")
    } catch {}
  }, [])
  const [speaker, setSpeaker] = useState<Speaker | null>(null)
  // Who hands the object over and who takes it, for the hand-off button.
  const [giver, setGiver] = useState("")
  const [receiver, setReceiver] = useState("")
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let stage: Stage | null = null
    let undress: (() => void) | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      const [{ createStage }, { SETS, STAGINGS }] = await Promise.all([import("@d20/stage"), import("@d20/stage/sets")])
      const loaded = stagingKey ? await STAGINGS[stagingKey]?.() : null
      // &painted=0: the set as built, under the brush filter, where a staging would show its paintings.
      const staging = loaded && params.painted === "0" ? { ...(loaded as object), painted: false } : loaded
      const stagedSet = staging && typeof staging === "object" && "set" in staging ? String((staging as { set: string }).set) : null
      const key = params.set ? setKey : stagedSet && SETS[stagedSet] ? stagedSet : setKey
      const set = await SETS[key]()
      if (cancelled) return
      const tier = TIERS.includes(params.tier as TierName) ? (params.tier as TierName) : "auto"
      // &look=play: the game's own stage in the set's played look, as components/stage/use-stage.ts builds it.
      const { builtPlay, playedLook } = await import("@/asset-library/play")
      const look = params.look === "play" && stagedSet === key ? playedLook(key) : null
      const built = look ? await builtPlay(set, staging, look) : null
      stage = await createStage({
        container,
        set: built?.set ?? set,
        staging: built?.staging ?? (stagedSet === key ? staging : null),
        tier,
        flags: { ...built?.flags, ...flagsFrom(params) },
        motion: params.motion !== "0",
        onProgress: setStatus,
      })
      if (cancelled) {
        stage.dispose()
        return
      }
      if (built) undress = await built.dress(stage)
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
      undress?.()
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
    <div className="fixed inset-0 z-screen overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
      <div ref={containerRef} className="absolute inset-0" {...onPointer} />
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d0b09]">
          <div className="text-2xl tracking-label text-[#f2c97a]">{(title || setKey).toUpperCase()}</div>
          <div className="mt-3 text-sm opacity-70">{status}</div>
        </div>
      )}
      {speaker && (
        <>
          <div
            ref={bubbleRef}
            className="pointer-events-none absolute top-0 left-0 z-20 max-w-[260px] rounded-lg border border-[#e6c89660] bg-[#f4ead6] px-3 py-1.5 text-xs text-[#2a1f14] shadow-lg"
          >
            {speaker.name}
          </div>
          <div className="absolute right-4 bottom-4 z-20 flex w-[340px] items-center gap-3 rounded-md border border-[#e6c89640] bg-[#0e0a06d0] p-2 backdrop-blur-sm">
            {speaker.portrait && <img src={speaker.portrait} alt="" className="h-20 w-20 rounded object-cover object-top" />}
            <div className="text-xs">
              <div className="text-sm text-[#f2c97a]">{speaker.name}</div>
              <div className="opacity-70">{speaker.role}</div>
            </div>
          </div>
        </>
      )}
      {ready && !hidden && stage && (
        <div className="absolute top-3 left-3 z-20 max-w-[520px] space-y-1.5 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-2 text-3xs leading-snug backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-sm tracking-wide text-[#f2c97a]">{title}</span>
            <span className="opacity-60">{stagingKey ?? setKey}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {shots.map(([k, label], i) => (
              <Tip key={k} label={label}>
                <Button variant="plain" className={pill(stats?.shot === k)} onClick={() => set((s) => s.shot(k))}>
                  {i + 1} {k}
                </Button>
              </Tip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {TAKES.map((t) => (
              <Button variant="plain" key={t.key} className={pill(false)} onClick={() => set((s) => playTake(s, t))}>
                {t.key}
              </Button>
            ))}
            <Button variant="plain" className={pill(false)} onClick={() => set((s) => handOff(s, giver, receiver))}>
              hand-off
            </Button>
            {(
              [
                [giver, setGiver, "from"],
                [receiver, setReceiver, "to"],
              ] as const
            ).map(([value, choose, label]) => (
              <select key={label} value={value} onChange={(e) => choose(e.target.value)} className="rounded border border-[#e6c89640] bg-[#0e0a06] px-1 text-[#e9dcc3]">
                <option value="">{label}</option>
                {stage.cast
                  .filter((c) => stage.isOnStage(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            ))}
            {stats?.take && <span className="self-center opacity-60">{stats.take}</span>}
          </div>
          <details
            open={more}
            onToggle={(e) => {
              const open = e.currentTarget.open
              setMore(open)
              try {
                localStorage.setItem("stage-viewer-more", open ? "1" : "0")
              } catch {}
            }}
          >
            <summary className="cursor-pointer opacity-60 select-none">More</summary>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 opacity-60">tier</span>
                {TIERS.map((t) => (
                  <Button variant="plain" key={t} className={pill(stats?.tier === t)} onClick={() => set((s) => s.setTier(t))}>
                    {t}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 opacity-60">crowd</span>
                {(["procedural", "cards", "hybrid"] as const).map((m) => (
                  <Button variant="plain" key={m} className={pill(stage.flags.crowd === m)} onClick={() => set((s) => s.setFlags({ crowd: m }))}>
                    {m}
                  </Button>
                ))}
                <span className="ml-2 w-6 opacity-60">aa</span>
                {(["off", "fxaa", "msaa"] as const).map((m) => (
                  <Button variant="plain" key={m} className={pill(stats?.aa === m)} onClick={() => set((s) => s.setFlags({ aa: m }))}>
                    {m}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 opacity-60">paint</span>
                {(["uniform", "depth"] as const).map((m) => (
                  <Button variant="plain" key={m} className={pill(stage.flags.paint === m)} onClick={() => set((s) => s.setFlags({ paint: m }))}>
                    {m}
                  </Button>
                ))}
                <Button variant="plain" className={pill(stage.flags.brush > 0.01)} onClick={() => set((s) => s.setFlags({ brush: s.flags.brush > 0.01 ? 0 : 1 }))}>
                  brush
                </Button>
                <Button variant="plain" className={pill(!!stats?.ao)} onClick={() => set((s) => s.setFlags({ ao: !s.pipeline.gtao.enabled }))}>
                  ao
                </Button>
                <Button variant="plain" className={pill(!!stats?.bloom)} onClick={() => set((s) => s.setFlags({ bloom: !s.pipeline.bloom.enabled }))}>
                  bloom
                </Button>
                <Button variant="plain" className={pill(!!stats?.dof)} onClick={() => set((s) => s.setFlags({ dof: !s.pipeline.focus.enabled }))}>
                  dof
                </Button>
                <Button variant="plain" className={pill(stage.flags.figures)} onClick={() => set((s) => s.setFlags({ figures: !s.flags.figures }))}>
                  figures
                </Button>
                <Button variant="plain" className={pill(stage.motion)} onClick={() => set((s) => (s.motion = !s.motion))}>
                  motion
                </Button>
                <Button
                  variant="plain"
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
                </Button>
              </div>
              {stats && (
                <div className="font-mono text-4xs opacity-75">
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
          </details>
        </div>
      )}
    </div>
  )
}
