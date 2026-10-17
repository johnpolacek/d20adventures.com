"use client"

// The stage art lab: a staging with the spikes switched on by query.
//   ?staging=the-midnight-summons/meeting-at-the-stones&tier=balanced&motion=0
//   &backdrop=<file in /stage-lab>   (a) painted far backdrop, the set's mountains removed
//   &project=<name>                  (b) /stage-lab/<name>.png projected from the camera in /stage-lab/<name>.json
//   &fade=0                          (b) show stretched paint on surfaces the projector saw edge-on
//   &animate=<castId>                (c) /stage-lab/<castId>-idle.mp4 on that cast member's card
//   &clip=<name>                     (c) another clip, /stage-lab/<name>.mp4 (thalbern-h3-idle)
//   &cast=off                        hide cast and crowd (for plates)

import type { Stage, TierName } from "@d20/stage"
import { useEffect, useRef, useState } from "react"
import { addBackdrop, animateStandee, cameraOf, projectPainting } from "./lab"

type Params = Record<string, string | undefined>
const TIERS: TierName[] = ["mobile", "balanced", "high", "ultra"]
const pill = (on: boolean) => `rounded border px-1.5 py-0.5 ${on ? "border-[#f2c97a] bg-[#f2c97a33] text-[#f2c97a]" : "border-[#e6c89640] text-[#e9dcc3b0] hover:border-[#f2c97a99]"}`
const num = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined)

export function LabViewer({ params }: { params: Params }) {
  const ref = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [status, setStatus] = useState("Loading")
  const [shots, setShots] = useState<[string, string | undefined][]>([])
  const [active, setActive] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    let cancelled = false
    let st: Stage | null = null
    const stops: (() => void)[] = []
    ;(async () => {
      const [{ createStage }, { SETS, STAGINGS }] = await Promise.all([import("@d20/stage"), import("@d20/stage/sets")])
      const stagingKey = params.staging ?? "the-midnight-summons/meeting-at-the-stones"
      const staging = (await STAGINGS[stagingKey]()) as { set: string }
      const set = structuredClone(await SETS[staging.set]()) as { objects: { type: string }[]; backdrop?: unknown }
      // The engine now draws the set's own backdrop: the spike's replaces it.
      if (params.backdrop) {
        set.objects = set.objects.filter((o) => o.type !== "mountain")
        delete set.backdrop
      }
      const tier = TIERS.includes(params.tier as TierName) ? (params.tier as TierName) : "balanced"
      st = await createStage({ container, set, staging, tier, motion: params.motion !== "0", onProgress: setStatus })
      if (cancelled) return st.dispose()
      const lab: Record<string, unknown> = { camera: () => cameraOf(st as Stage) }
      if (params.backdrop)
        lab.backdrop = await addBackdrop(st, {
          url: `/stage-lab/${params.backdrop}`,
          arc: num(params.arc) ?? 130,
          yaw: num(params.yaw),
          bottom: num(params.bottom),
          top: num(params.top),
          gain: num(params.gain),
          sat: num(params.sat),
          haze: num(params.haze),
        })
      if (params.project) {
        const cam = await (await fetch(`/stage-lab/${params.project}.json`)).json()
        lab.project = await projectPainting(st, { url: `/stage-lab/${params.project}.png`, cam, fade: num(params.fade), gain: num(params.pgain), sat: num(params.psat) })
      }
      if (params.animate) {
        const a = await animateStandee(st, params.animate, `/stage-lab/${params.clip ?? `${params.animate}-idle`}`)
        stops.push(a.stop)
        lab.video = a.video
      }
      if (params.cast === "off") {
        st.standees.group.visible = false
        st.crowd.group.visible = false
      }
      const w = window as unknown as { __stage?: Stage; __lab?: unknown }
      w.__stage = st
      w.__lab = lab
      if (params.shot) st.shot(params.shot, { instant: true })
      setShots(Object.entries(st.shots).map(([k, s]) => [k, s.label]))
      setActive(st.activeShot)
      await st.firstFrame
      setStage(st)
    })().catch((error) => {
      console.error(error)
      setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`)
      ;(window as unknown as { __stageError?: string }).__stageError = String(error instanceof Error ? error.message : error)
    })
    return () => {
      cancelled = true
      for (const s of stops) s()
      st?.dispose()
    }
  }, [params])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H") setHidden((h) => !h)
      const i = Number(e.key) - 1
      if (stage && i >= 0 && i < shots.length) {
        stage.shot(shots[i][0])
        setActive(shots[i][0])
      }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [stage, shots])

  const href = (patch: Params) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v)
    return `/dev/stage-lab?${q}`
  }
  const toggles: [string, Params, boolean][] = [
    ["(a) backdrop", { backdrop: params.backdrop ? undefined : "stones-backdrop.webp" }, !!params.backdrop],
    ["(b) projection", { project: params.project ? undefined : "stones-paint-gemini" }, !!params.project],
    ["(c) animated", { animate: params.animate ? undefined : "thalbern" }, !!params.animate],
  ]

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
      <div ref={ref} className="absolute inset-0" />
      {!stage && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm opacity-70">{status}</div>}
      {stage && !hidden && (
        <div className="absolute top-3 left-3 z-20 max-w-[560px] space-y-1.5 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-2 text-[11px] leading-snug backdrop-blur-sm">
          <div className="text-[14px] tracking-[0.06em] text-[#f2c97a]">Stage art lab</div>
          <div className="flex flex-wrap gap-1">
            {shots.map(([k, label], i) => (
              <button
                key={k}
                className={pill(active === k)}
                title={label}
                onClick={() => {
                  stage.shot(k)
                  setActive(k)
                }}
              >
                {i + 1} {k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {toggles.map(([label, patch, on]) => (
              <a key={label} className={pill(on)} href={href(patch)}>
                {label}
              </a>
            ))}
            <a className={pill(params.project !== undefined && params.fade === "0")} href={href({ fade: params.fade === "0" ? undefined : "0" })}>
              stretch
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
