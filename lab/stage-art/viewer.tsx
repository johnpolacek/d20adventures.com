"use client"

// The stage art lab: a staging with the spikes switched on by query.
//   ?staging=the-midnight-summons/meeting-at-the-stones&tier=balanced&motion=0
//   &backdrop=<file in /stage-lab>   (a) painted far backdrop, the set's mountains removed
//   &project=<name>[,<name>]         (b) /stage-lab/<name>.png projected from the camera in /stage-lab/<name>.json
//   &shadows=0.5                     (b) figures' sun shadows darken the paint by this much
//   &fade=0                          (b) show stretched paint on surfaces the projector saw edge-on
//   &animate=<castId>                (c) /stage-lab/<castId>-idle.mp4 on that cast member's card
//   &clip=<name>                     (c) another clip, /stage-lab/<name>.mp4 (thalbern-h3-idle)
//   &cast=off                        hide cast, crowd and effects (for plates)
//   &paint=0                         no brush filter over the frame
//   &view=x,y,z,tx,ty,tz[,fov]       a free viewpoint
//   &figure=<castId>:<file>[:yaw]    /stage-lab/<file>.glb, a rigged 3D figure, in place of that standee
//   &cards=1                        /stage-lab/cards/<castId>-front.webp and -back.webp in place of each standee's art
//   &fill=1                         (b) paint runs on over surfaces no painting saw, in place of the bare set
//   &bare=1                         (b) those surfaces in flat magenta
//   &clear=1                        (b) what stood behind loose cloth takes /stage-lab/<name>-clear.png, or no paint
//   &cloth=off                      (b) flags, banners and awnings taken down, for that painting's plate
//   &drift=0.15[,8]                 the camera sways that many metres about its point, over that many seconds
//   &crowd=1                        the crowd's repainted cards, from /stage-lab/crowd
//   &plain=1                        a painted set as built, without its paintings, for a new painting's plate
//   &dummy=x,z                       a person-sized solid there, to see a 3D figure's shadow
//   &splat=<name>                    /stage-lab/<name>.spz, a Marble splat world, in place of the built set (&sgain, &syaw, &sscale)

import type { Stage, TierName } from "@d20/stage"
import { useEffect, useRef, useState } from "react"
import { addBackdrop, addFigure, addSplat, animateStandee, cameraOf, drift, pano, projectPaintings } from "./lab"

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
      const staging = structuredClone(await STAGINGS[stagingKey]()) as { set: string; cast?: { id: string; art?: { front: string; back?: string } }[] }
      // &cards=1: each cast member's repainted card, where one has been made. The spec takes page blobs, not /stage-lab paths.
      if (params.cards) {
        const blob = async (url: string) => {
          const res = await fetch(url)
          return res.ok ? URL.createObjectURL(await res.blob()) : null
        }
        await Promise.all(
          (staging.cast ?? []).map(async (c) => {
            const [front, back] = await Promise.all([blob(`/stage-lab/cards/${c.id}-front.webp`), blob(`/stage-lab/cards/${c.id}-back.webp`)])
            if (c.art && front) c.art = { ...c.art, front, back: back ?? undefined }
          })
        )
      }
      const set = structuredClone(await SETS[staging.set]()) as { objects: { type: string }[]; backdrops?: unknown[]; painted?: unknown }
      // A set the engine paints itself is shown as built for the lab's own projection, a splat, or a plate (&plain=1).
      if (params.project || params.splat || params.plain) delete set.painted
      // The engine now draws the set's own backdrop: the spike's replaces it.
      if (params.backdrop) {
        set.objects = set.objects.filter((o) => o.type !== "mountain")
        set.backdrops = []
      }
      const tier = TIERS.includes(params.tier as TierName) ? (params.tier as TierName) : "balanced"
      // &crowd=1: the crowd's repainted atlas, /stage-lab/crowd, in place of the setting's own.
      const crowdLibrary = params.crowd
        ? async () => {
            const base = "/stage-lab/crowd"
            return {
              meta: await (await fetch(`${base}/atlas.json`)).json(),
              front: { rgb: `${base}/front-rgb.webp`, alpha: `${base}/front-a.webp` },
              back: { rgb: `${base}/back-rgb.webp`, alpha: `${base}/back-a.webp` },
            }
          }
        : undefined
      st = await createStage({ container, set, staging, tier, motion: params.motion !== "0", onProgress: setStatus, crowdLibrary })
      if (cancelled) return st.dispose()
      const lab: Record<string, unknown> = {
        camera: () => cameraOf(st as Stage),
        pano: (pos: [number, number, number], kind: "color" | "depth", width?: number) => pano(st as Stage, pos, kind, width),
      }
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
        // One name, or several joined by commas: each is a painting and the camera it was painted for.
        // &clear=1 adds each painting's cloth-free twin, /stage-lab/<name>-clear.png, where one has been made.
        const list = await Promise.all(
          params.project.split(",").map(async (name) => ({
            url: `/stage-lab/${name}.png`,
            cam: await (await fetch(`/stage-lab/${name}.json`)).json(),
            clear: params.clear && (await fetch(`/stage-lab/${name}-clear.png`, { method: "HEAD" })).ok ? `/stage-lab/${name}-clear.png` : undefined,
          }))
        )
        lab.project = await projectPaintings(st, list, {
          fade: num(params.fade),
          gain: num(params.pgain),
          sat: num(params.psat),
          shadows: num(params.shadows),
          fill: num(params.fill),
          bare: num(params.bare),
          clearing: !!params.clear,
          cloth: params.cloth !== "off",
        })
      }
      if (params.splat) lab.splat = await addSplat(st, `/stage-lab/${params.splat}`, { gain: num(params.sgain), yaw: num(params.syaw), scale: num(params.sscale) })
      if (params.animate) {
        const a = await animateStandee(st, params.animate, `/stage-lab/${params.clip ?? `${params.animate}-idle`}`)
        stops.push(a.stop)
        lab.video = a.video
      }
      // &paint=0: no brush filter over the frame, for photoreal art.
      if (params.paint === "0") Object.defineProperty((st as unknown as { pipeline: { paint: object } }).pipeline.paint, "strength", { get: () => 0, set: () => {} })
      if (params.cast === "off") {
        st.standees.group.visible = false
        st.crowd.group.visible = false
        // Flames and smoke stay live over a painting, so a plate leaves them out.
        st.effects.group.visible = false
      }
      const w = window as unknown as { __stage?: Stage; __lab?: unknown }
      w.__stage = st
      w.__lab = lab
      // &figure=<castId>:<file>[:yaw]: /stage-lab/<file>.glb, a rigged 3D figure, in place of that cast member's standee.
      if (params.figure) {
        const [castId, file, yaw] = params.figure.split(":")
        const f = await addFigure(st, `/stage-lab/${file}.glb`, castId, { yaw: num(yaw) })
        stops.push(f.stop)
        lab.figure = { triangles: f.triangles, clips: f.clips }
      }
      // &dummy=x,z: a person-sized solid at that spot, standing in for a 3D character, to see its shadow on the paint.
      const dummy = params.dummy?.split(",").map(Number)
      if (dummy?.length === 2) {
        const THREE = await import("three")
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.2, 6, 16), new THREE.MeshStandardMaterial({ color: "#8a8478", roughness: 0.8 }))
        body.position.set(dummy[0], 0.88, dummy[1])
        body.castShadow = body.receiveShadow = true
        st.scene.add(body)
      }
      // &view=x,y,z,tx,ty,tz[,fov]: a free viewpoint, shown on load and kept as __lab.view for capture.ts --view.
      const view = params.view?.split(",").map(Number)
      if (view && view.length >= 6) {
        lab.view = { position: view.slice(0, 3), target: view.slice(3, 6), fov: view[6] ?? 60, label: "View" }
        st.shot(lab.view as Parameters<Stage["shot"]>[0], { instant: true })
      }
      if (params.shot) st.shot(params.shot, { instant: true })
      // &drift=<metres>[,<seconds>]: the camera sways that far about where it stands. Needs motion on.
      const sway = params.drift?.split(",").map(Number)
      if (sway?.[0]) stops.push(drift(st, sway[0], sway[1] || 8).stop)
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
