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
//   &figure=<castId>:<file>[:yaw[:clip]]  /stage-lab/<file>.glb, a rigged 3D figure, in place of that standee. Several, joined by commas.
//                                    `@garlan` or `@garlan/lod2` for <file> is a figure from the asset library (asset-library/characters).
//                                    A figure from rig.py plays the written clips: Idle, Walk or Hit. __lab.figures[castId].play(name) changes it.
//   &shade=0.4                       a soft patch of shade on the ground under every crowd member
//   &figenv=0.55                     how brightly a figure reflects its own lit room: 0 leaves it to the stage's sky
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
//   &look=wide|play                  the set's isometric look and one of its shots (looks.ts), in place of the switches below
//   &iso=az,el,dist,fov              a room as a lit cut-away seen from high and far (iso.ts), with &room, &top and &isolight.
//                                    Out of doors, &isobox=x0,z0,x1,z1[,top] is the ground to keep, and &isohide=type,type leaves parts out.

import type { Stage, TierName } from "@d20/stage"
import { useEffect, useRef, useState } from "react"
import { iso, isoSet } from "../../asset-library/iso"
import { withLook } from "../../asset-library/looks"
import { addBackdrop, addFigure, addSplat, animateStandee, cameraOf, castRings, crowdShade, drift, pano, projectPaintings } from "./lab"

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
  // &panel=0 starts with the panel put away, as h does: for a page that frames this one.
  const [hidden, setHidden] = useState(params.panel === "0")

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
      // &look=<shot>: the set's isometric look (looks.ts), under whatever else the address gives.
      const { params: q, look } = withLook(params, staging.set)
      if (look?.cast) staging.cast = [...(staging.cast ?? []), ...(look.cast as NonNullable<typeof staging.cast>)]
      // &cards=1: each cast member's repainted card, where one has been made. The spec takes page blobs, not /stage-lab paths.
      if (q.cards) {
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
      if (q.project || q.splat || q.plain) delete set.painted
      if (q.iso) isoSet(set)
      for (const [name, change] of Object.entries(look?.materials ?? {})) {
        const materials = (set as { materials?: Record<string, object> }).materials
        if (materials?.[name]) Object.assign(materials[name], change)
      }
      // &isobox: the scattered crowd keeps to the kept ground. Each scatter's area is cut to it, and thinned to match.
      const ground = q.iso ? q.isobox?.split(",").map(Number) : undefined
      if (ground && ground.length >= 4) {
        const crowd = (set as { crowd?: { groups?: { type: string; area?: number[]; count?: number }[] } }).crowd
        for (const g of crowd?.groups ?? []) {
          if (g.type !== "scatter" || !g.area || !g.count) continue
          const [a0, b0, a1, b1] = g.area
          const cut = [Math.max(a0, ground[0]), Math.max(b0, ground[1]), Math.min(a1, ground[2]), Math.min(b1, ground[3])]
          const share = (Math.max(0, cut[2] - cut[0]) * Math.max(0, cut[3] - cut[1])) / Math.max(1e-6, (a1 - a0) * (b1 - b0))
          g.area = share > 0 ? cut : [ground[0], ground[1], ground[0] + 0.01, ground[1] + 0.01]
          g.count = Math.round(g.count * share)
        }
        // A scatter left with nobody is taken out: the set's spec wants at least one person in each.
        if (crowd?.groups) crowd.groups = crowd.groups.filter((g) => g.type !== "scatter" || (g.count ?? 0) >= 1)
      }
      // &isohide=type,type: parts of the set left out of the cut-away, as a ceiling is.
      if (q.isohide) {
        const hide = q.isohide.split(",")
        set.objects = set.objects.filter((o) => !hide.includes(o.type))
      }
      // The engine now draws the set's own backdrop: the spike's replaces it.
      if (q.backdrop) {
        set.objects = set.objects.filter((o) => o.type !== "mountain")
        set.backdrops = []
      }
      const tier = TIERS.includes(q.tier as TierName) ? (q.tier as TierName) : "balanced"
      // &crowd=1: the crowd's repainted atlas, /stage-lab/crowd, in place of the setting's own.
      const crowdLibrary = q.crowd
        ? async () => {
            const base = "/stage-lab/crowd"
            return {
              meta: await (await fetch(`${base}/atlas.json`)).json(),
              front: { rgb: `${base}/front-rgb.webp`, alpha: `${base}/front-a.webp` },
              back: { rgb: `${base}/back-rgb.webp`, alpha: `${base}/back-a.webp` },
            }
          }
        : undefined
      // From high and far the whole crowd is past the distance where cards give way to pegs, so every one is a card.
      const flags = q.iso ? { cardRadius: 500, ...(q.bloom ? { bloom: q.bloom === "on" } : {}), ...(q.brush ? { brush: Number(q.brush) } : {}) } : undefined
      st = await createStage({ container, set, staging, tier, flags, motion: q.motion !== "0", onProgress: setStatus, crowdLibrary })
      if (cancelled) return st.dispose()
      const lab: Record<string, unknown> = {
        camera: () => cameraOf(st as Stage),
        pano: (pos: [number, number, number], kind: "color" | "depth", width?: number) => pano(st as Stage, pos, kind, width),
      }
      if (q.backdrop)
        lab.backdrop = await addBackdrop(st, {
          url: `/stage-lab/${q.backdrop}`,
          arc: num(q.arc) ?? 130,
          yaw: num(q.yaw),
          bottom: num(q.bottom),
          top: num(q.top),
          gain: num(q.gain),
          sat: num(q.sat),
          haze: num(q.haze),
        })
      if (q.project) {
        // One name, or several joined by commas: each is a painting and the camera it was painted for.
        // &clear=1 adds each painting's cloth-free twin, /stage-lab/<name>-clear.png, where one has been made.
        const list = await Promise.all(
          q.project.split(",").map(async (name) => ({
            url: `/stage-lab/${name}.png`,
            cam: await (await fetch(`/stage-lab/${name}.json`)).json(),
            clear: q.clear && (await fetch(`/stage-lab/${name}-clear.png`, { method: "HEAD" })).ok ? `/stage-lab/${name}-clear.png` : undefined,
          }))
        )
        lab.project = await projectPaintings(st, list, {
          fade: num(q.fade),
          gain: num(q.pgain),
          sat: num(q.psat),
          shadows: num(q.shadows),
          fill: num(q.fill),
          bare: num(q.bare),
          clearing: !!q.clear,
          cloth: q.cloth !== "off",
        })
      }
      if (q.splat) lab.splat = await addSplat(st, `/stage-lab/${q.splat}`, { gain: num(q.sgain), yaw: num(q.syaw), scale: num(q.sscale) })
      if (q.animate) {
        const a = await animateStandee(st, q.animate, `/stage-lab/${q.clip ?? `${q.animate}-idle`}`)
        stops.push(a.stop)
        lab.video = a.video
      }
      // &paint=0: no brush filter over the frame, for photoreal art.
      if (q.paint === "0") Object.defineProperty((st as unknown as { pipeline: { paint: object } }).pipeline.paint, "strength", { get: () => 0, set: () => {} })
      if (q.cast === "off") {
        st.standees.group.visible = false
        st.crowd.group.visible = false
        // Flames and smoke stay live over a painting, so a plate leaves them out.
        st.effects.group.visible = false
      }
      const w = window as unknown as { __stage?: Stage; __lab?: unknown }
      w.__stage = st
      w.__lab = lab
      // &figure=<castId>:<file>[:yaw]: /stage-lab/<file>.glb, a rigged 3D figure, in place of that cast member's standee.
      for (const one of q.figure?.split(",") ?? []) {
        const [castId, file, yaw, clip] = one.split(":")
        // `@garlan` or `@garlan/lod2` is a figure from the asset library. Anything else is a file in /stage-lab.
        const url = file.startsWith("@") ? `/dev/assets/file/characters/${file.slice(1).split("/")[0]}/${file.split("/")[1] ?? "lod0"}.glb` : `/stage-lab/${file}.glb`
        // A figure that is not there yet, or will not load, leaves its card standing.
        const f = await addFigure(st, url, castId, { yaw: num(yaw), clip, env: num(q.figenv) }).catch((error) => {
          console.warn(`[lab] no figure for ${castId}: ${error instanceof Error ? error.message : error}`)
          return null
        })
        if (!f) continue
        stops.push(f.stop)
        lab.figure = { triangles: f.triangles, clips: f.clips }
        lab.figures = { ...(lab.figures as object), [castId]: { play: f.play, pose: f.pose, clips: f.clips, triangles: f.triangles } }
      }
      // &dummy=x,z: a person-sized solid at that spot, standing in for a 3D character, to see its shadow on the paint.
      const dummy = q.dummy?.split(",").map(Number)
      if (dummy?.length === 2) {
        const THREE = await import("three")
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.2, 6, 16), new THREE.MeshStandardMaterial({ color: "#8a8478", roughness: 0.8 }))
        body.position.set(dummy[0], 0.88, dummy[1])
        body.castShadow = body.receiveShadow = true
        st.scene.add(body)
      }
      // &view=x,y,z,tx,ty,tz[,fov]: a free viewpoint, shown on load and kept as __lab.view for capture.ts --view.
      const view = q.view?.split(",").map(Number)
      if (view && view.length >= 6) {
        lab.view = { position: view.slice(0, 3), target: view.slice(3, 6), fov: view[6] ?? 60, label: "View" }
        st.shot(lab.view as Parameters<Stage["shot"]>[0], { instant: true })
      }
      if (q.shot) st.shot(q.shot, { instant: true })
      // &iso=azimuth,elevation,distance,fov: the room cut open and seen from outside. Kept as __lab.view, as &view is.
      if (q.iso) {
        const [azimuth = 45, elevation = 35, distance = 40, fov = 24] = q.iso.split(",").map(Number)
        const [gain, ambient, key] = (q.isolight ?? "").split(",").map((v) => num(v))
        lab.view = iso(st, {
          azimuth,
          elevation,
          distance,
          fov,
          room: num(q.room),
          top: num(q.top),
          at: q.isoat?.split(",").map(Number),
          box: q.isobox?.split(",").map(Number),
          gain,
          ambient,
          key,
          sky: q.isosky ? `#${q.isosky.replace("#", "")}` : undefined,
          lamps: q.isolamps?.split(";").map((l) => l.split(",").map(Number)),
        })
        st.shot(lab.view as Parameters<Stage["shot"]>[0], { instant: true })
      }
      // &shade=0.4: a soft patch of shade under every crowd member, that dark.
      if (num(q.shade)) stops.push(crowdShade(st, num(q.shade)).stop)
      // &rings=id,id or &rings=party: a ring on the ground under each cast member, gold under the named ones.
      if (q.rings) {
        const party = (staging as { shots?: Record<string, { subjects?: string[] }> }).shots?.party?.subjects ?? []
        stops.push(castRings(st, q.rings === "party" ? party : q.rings.split(",")).stop)
      }
      // &drift=<metres>[,<seconds>]: the camera sways that far about where it stands. Needs motion on.
      const sway = q.drift?.split(",").map(Number)
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
