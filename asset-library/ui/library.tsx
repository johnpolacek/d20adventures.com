"use client"

// The asset library's page, at /settings/<setting>/assets in the workspace and on the site. One bar stays under the
// site's header wherever the visitor is: the library's name, its tabs and a search, then the filters of a grid or
// the way back from an asset. It opens on the places, each under the adventure it belongs to, and the characters
// open on the party. A grid is narrowed by a search or a filter. A card opens the asset itself, in the frame below the bar:
//   - a character with a 3D figure stands in a lit room, at any detail level and in any clip the game plays
//     (asset-library/clips.ts), and one without shows its card;
//   - a place is assembled and live (scene.ts): a variant, with one of its encounters as that encounter opens or
//     empty, as the stage shows it or as an isometric cut-away, with a camera the visitor moves.

import { type Armed, arm } from "@d20/stage/figures/fight"
import { carry, fingered, wield } from "@d20/stage/figures/hold"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { figureClips, isRigged, MOVE_NAMES } from "../clips"
import { holdProps } from "../props"
import { hasIso } from "../scene"
import type { Character, Figure, Library, Picture, Place } from "../types"
import { type Nav, Scene } from "./scene"

// Where a page of the library lives, and where its figures' files are served from.
export interface LibraryConfig {
  home: string
  files: string
}
// And, for a scene, which character's figure stands for a cast id.
const Config = createContext<LibraryConfig & { figures: Record<string, string>; setting: string }>({ home: "/settings/realm-of-myr/assets", files: "/asset-library/characters", figures: {}, setting: "realm-of-myr" })

type Params = Record<string, string | undefined>
type Tab = "characters" | "environments" | "images"
// The tabs in the order they are shown: the library opens on the first.
const TABS = ["environments", "characters", "images"] as const

const pill = (on: boolean) => `rounded border px-1.5 py-0.5 ${on ? "border-[#f2c97a] bg-[#f2c97a33] text-[#f2c97a]" : "border-[#e6c89640] text-[#e9dcc3b0] hover:border-[#f2c97a99]"}`
const PANEL = "space-y-1.5 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-2 text-[11px] leading-snug backdrop-blur-sm"
const count = (n: number) => n.toLocaleString("en-US")
const SMALL = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"])
// Title case, as names read in the game: small words stay small unless they open the name or follow a colon.
const named = (s: string) =>
  s
    .replaceAll("-", " ")
    .split(" ")
    .map((w, i, all) => (i > 0 && !all[i - 1].endsWith(":") && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
const scene = (staging: string) => named(staging.split("/")[1] ?? staging)
// A step of a held clip, in frames a second.
const FRAMES = 30
const scenes = (n: number) => `${n} ${n === 1 ? "Scene" : "Scenes"}`
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
// A day as it is read: "2026-11-19" is "Nov 19, 2026".
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return `${MONTHS[m - 1] ?? ""} ${d}, ${y}`
}
// Who made a figure's model, and who rigged it, from "Hi3D v3.0 on fal, rigged by Hyper3D": a figure rigged in the
// workspace (rig.py, in Blender) names no rigger.
const maker = (f: Figure) => f.source.generator.split(" on ")[0]
const rigger = (f: Figure) => {
  const by = /rigged by (.*)$/.exec(f.source.generator)?.[1]
  return by ? `Rigged by ${named(by)}` : "Rigged in Blender"
}
// Every figure made of a character, the one that stands for them now first. An index published before figures were
// kept together has the one alone.
const versionsOf = (c: Character) => c.versions ?? (c.figure ? [c.figure] : [])
const TAG = "rounded px-1 text-[9px] font-semibold tracking-wide"
// ── A figure in a lit room ──
interface Room {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  figure: THREE.Object3D | null
  mixer: THREE.AnimationMixer | null
  clips: THREE.AnimationClip[]
  action: THREE.AnimationAction | null
  // What the figure holds (props.ts), moved with it each frame.
  carried: { update: (weight?: number) => void; dispose: () => void } | null
  // Its weapons, and its arms put where a fight move needs them (packages/stage/src/figures/fight.ts), as the game does.
  armed: Armed | null
  framed: boolean
}

function discard(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.dispose()
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
  })
}

// `address` is the character it is a figure of, and the figure itself when it is not the one that stands for them now.
function FigureRoom({ figure, address, params }: { figure: Figure; address: { id: string; v?: string }; params: Params }) {
  const config = useContext(Config)
  const host = useRef<HTMLDivElement>(null)
  const room = useRef<Room | null>(null)
  const [lod, setLod] = useState(Math.min(Number(params.lod) || 0, figure.lods.length - 1))
  // The clips its shelf lists, and the fight moves every figure rigged by rig.py plays as well. One rigged elsewhere
  // (pipeline/pilot.ts) carries its own clips and no others.
  const clips = useMemo(
    () => (["meshy", "hyper3d"].includes(figure.rig.weights) ? figure.clips : [...new Set([...figure.clips, ...(figure.clips.length ? MOVE_NAMES : [])])]),
    [figure.clips, figure.rig.weights]
  )
  const [clip, setClip] = useState(params.clip && clips.includes(params.clip) ? params.clip : (clips[0] ?? ""))
  const [turning, setTurning] = useState(params.turn === "1")
  // The moment a clip is held at, in seconds, or null while it plays. The address keeps it: `at=1.2`.
  const [held, setHeld] = useState<number | null>(params.at ? Number(params.at) || 0 : null)
  const holding = useRef(held)
  holding.current = held
  const scrub = useRef<HTMLInputElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const [fps, setFps] = useState(0)
  const [loading, setLoading] = useState(false)

  // The room: made when a figure is opened, and kept while its detail and its clip change.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none"
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#100d0a")
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.55
    const key = new THREE.DirectionalLight("#fff1dc", 2.4)
    key.position.set(2, 4, 3)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 12 })
    key.shadow.normalBias = 0.02
    const rim = new THREE.DirectionalLight("#bfd0ff", 1.6)
    rim.position.set(-2.5, 3, -3)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshStandardMaterial({ color: "#2a231c", roughness: 0.95 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(key, rim, new THREE.HemisphereLight("#dfe6ff", "#2a2018", 0.35), floor)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.52
    controls.minDistance = 0.6
    controls.maxDistance = 12
    const r: Room = { renderer, scene, camera, controls, figure: null, mixer: null, clips: [], action: null, carried: null, armed: null, framed: false }
    room.current = r
    const size = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
    }
    const watch = new ResizeObserver(size)
    watch.observe(el)
    size()
    let raf = 0
    let last = performance.now()
    let frames = 0
    let since = last
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return void (last = now)
      r.mixer?.update(Math.min(0.1, (now - last) / 1000))
      // A staff is let fall as its bearer goes down: the game says how far down, and here the fall's own clip does.
      r.carried?.update(r.action?.getClip().name === "Fall" ? Math.max(0, 1 - r.action.time / 0.5) : 1)
      if (r.action) r.armed?.after(r.action.getClip().name, r.action.time, r.action.getEffectiveWeight())
      if (r.action && scrub.current && clock.current) {
        const long = r.action.getClip().duration
        scrub.current.max = String(long)
        scrub.current.value = String(r.action.time)
        clock.current.textContent = `${r.action.time.toFixed(2)} / ${long.toFixed(2)} s · ${Math.round(r.action.time * FRAMES)}`
      }
      last = now
      controls.update()
      renderer.render(scene, camera)
      if (++frames && now - since > 1000) {
        setFps(Math.round((frames * 1000) / (now - since)))
        frames = 0
        since = now
      }
    }
    raf = requestAnimationFrame(tick)
    // For a capture: the frame is drawn and read in one task, since the canvas keeps nothing between frames.
    const w = window as unknown as { __assets?: unknown }
    w.__assets = {
      room: r,
      capture: () =>
        new Promise<Blob | null>((done) => {
          renderer.render(scene, camera)
          renderer.domElement.toBlob(done, "image/png")
        }),
    }
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
      controls.dispose()
      if (r.figure) discard(r.figure)
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      room.current = null
      w.__assets = undefined
    }
  }, [])

  // The figure: loaded when its detail level changes. The camera and the moment in the clip are kept.
  useEffect(() => {
    const r = room.current
    const file = figure.lods[lod]?.file
    if (!r || !file) return
    let stale = false
    setLoading(true)
    new GLTFLoader()
      .loadAsync(`${config.files}/${figure.id}/${file}`)
      .then((gltf) => {
        if (stale) return discard(gltf.scene)
        const at = r.action?.time ?? holding.current ?? 0
        if (r.figure) {
          r.scene.remove(r.figure)
          discard(r.figure)
        }
        const root = gltf.scene
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return
          o.castShadow = o.receiveShadow = true
          o.frustumCulled = false
        })
        const box = new THREE.Box3().setFromObject(root)
        const tall = box.max.y - box.min.y
        root.position.y = -box.min.y
        r.scene.add(root)
        r.figure = root
        r.mixer = new THREE.AnimationMixer(root)
        r.clips = gltf.animations.length ? gltf.animations : isRigged(root) ? figureClips(root, tall) : []
        // What it holds, stood beside it once its height is known: a staff is taller than its bearer.
        r.carried = isRigged(root) ? holdProps(root, box.min.y) : null
        r.armed?.dispose()
        r.armed = isRigged(root) ? arm(root, MOVE_NAMES, tall) : fingered(root) ? wield(root) : null
        // A staff in a hand with fingers, stood after the weapons are seated: they want the hand as it was modelled.
        if (!isRigged(root) && fingered(root)) r.carried = carry(root, box.min.y)
        r.action = null
        const next = r.clips.find((c) => c.name === clip) ?? r.clips[0]
        if (next) {
          r.action = r.mixer.clipAction(next).play()
          r.action.time = at
          r.action.paused = holding.current !== null
          r.armed?.show(next.name)
        }
        if (!r.framed) {
          r.controls.target.set(0, tall * 0.5, 0)
          r.camera.position.set(tall * 0.8, tall * 0.72, tall * 2.25)
          r.framed = true
        }
        ;(window as unknown as { __assets: { ready?: string } }).__assets.ready = `${figure.id}/${file}`
        setLoading(false)
      })
      .catch((error) => {
        console.error(error)
        setLoading(false)
      })
    return () => {
      stale = true
    }
    // The clip is changed below without loading again.
  }, [figure, lod, config.files])

  useEffect(() => {
    const r = room.current
    const next = r?.clips.find((c) => c.name === clip)
    if (!r?.mixer || !next) return
    const action = r.mixer.clipAction(next).reset().play()
    if (r.action && r.action !== action) r.action.crossFadeTo(action, 0.2, false)
    r.action = action
    r.armed?.show(clip)
    // A held figure stays held, at the start of the clip it is given.
    if (holding.current !== null) {
      action.paused = true
      setHeld(0)
    }
  }, [clip])

  // The clip held at a moment, or let go. A step past either end comes round to the other.
  const hold = useCallback((to: (time: number, long: number) => number) => {
    const action = room.current?.action
    if (!action) return
    const long = action.getClip().duration
    const time = to(action.time, long)
    action.paused = true
    action.time = long ? Math.min(long - 1e-4, ((time % long) + long) % long) : 0
    setHeld(Math.round(action.time * 1000) / 1000)
  }, [])
  const toggle = useCallback(() => {
    const action = room.current?.action
    if (!action) return
    if (!action.paused) return hold((time) => time)
    action.paused = false
    setHeld(null)
  }, [hold])
  const step = useCallback((frames: number) => hold((time) => time + frames / FRAMES), [hold])
  // K or Space holds and lets go. The arrows, or comma and full stop, step a frame, and ten with Shift.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const on = (e.target as HTMLElement).tagName
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(on)) return
      if (e.key === "k" || (e.key === " " && on !== "BUTTON")) toggle()
      else if (e.key === "ArrowRight" || e.key === "." || e.key === ">") step(e.shiftKey ? 10 : 1)
      else if (e.key === "ArrowLeft" || e.key === "," || e.key === "<") step(e.shiftKey ? -10 : -1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [toggle, step])
  // The frame as it stands, saved under the figure, the clip and the moment.
  const save = useCallback(async () => {
    const r = room.current
    if (!r) return
    r.renderer.render(r.scene, r.camera)
    const blob = await new Promise<Blob | null>((done) => r.renderer.domElement.toBlob(done, "image/png"))
    if (!blob) return
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${figure.id}-${r.action?.getClip().name ?? "still"}-${(r.action?.time ?? 0).toFixed(2)}.png`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [figure.id])

  useEffect(() => {
    if (!room.current) return
    room.current.controls.autoRotate = turning
    room.current.controls.autoRotateSpeed = 2.4
  }, [turning])

  // The address keeps what is shown, so a view can be opened again.
  useEffect(() => {
    const q = new URLSearchParams({ id: address.id, ...(address.v ? { v: address.v } : {}), lod: String(lod), clip })
    if (turning) q.set("turn", "1")
    if (held !== null) q.set("at", String(held))
    history.replaceState(null, "", `${config.home}?${q}`)
  }, [address.id, address.v, lod, clip, turning, held, config.home])

  const level = figure.lods[lod]
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <div className={`absolute top-3 left-3 ${PANEL}`}>
        <div className="flex items-center gap-1">
          <span className="w-10 opacity-60">Detail</span>
          {figure.lods.map((l, i) => (
            <button key={l.file} type="button" className={pill(i === lod)} onClick={() => setLod(i)}>
              {count(l.triangles)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-10 opacity-60">Clip</span>
          {clips.map((c) => (
            <button key={c} type="button" className={pill(c === clip)} onClick={() => setClip(c)}>
              {c}
            </button>
          ))}
          <button type="button" className={`ml-2 ${pill(turning)}`} onClick={() => setTurning((t) => !t)}>
            Turntable
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-10 opacity-60">Time</span>
          <button type="button" aria-label="Back a frame" className={pill(false)} onClick={() => step(-1)}>
            ‹
          </button>
          <button type="button" className={`w-12 ${pill(held !== null)}`} onClick={toggle}>
            {held === null ? "Pause" : "Play"}
          </button>
          <button type="button" aria-label="Forward a frame" className={pill(false)} onClick={() => step(1)}>
            ›
          </button>
          <input ref={scrub} type="range" aria-label="Moment" min={0} step={0.001} defaultValue={0} className="mx-1 w-44 accent-[#f2c97a]" onChange={(e) => hold(() => Number(e.target.value))} />
          <span ref={clock} className="w-32 font-mono text-[10px] opacity-75" />
          <button type="button" className={pill(false)} onClick={save}>
            PNG
          </button>
        </div>
        {level && (
          <div className="font-mono text-[10px] opacity-75">
            {count(level.triangles)} tris · {level.megabytes} MB · {level.texture} px · {figure.rig.bones} bones · {figure.height} m · {loading ? "…" : `${fps} fps`}
          </div>
        )}
        <div className="font-mono text-[10px] opacity-55">
          {figure.source.generator} · {count(figure.source.triangles)} tris · ${figure.source.cost.toFixed(2)} · {day(figure.source.made)}
        </div>
      </div>
    </>
  )
}

// ── A character: the figure that stands for them now, any earlier one, or their card ──
function CharacterView({ character, params }: { character: Character; params: Params }) {
  const config = useContext(Config)
  const all = versionsOf(character)
  // The address names a figure by `v`, or by `id` when it is a figure's own and not the character's.
  const [first] = useState(() => all.find((f) => f.id === params.v) ?? (params.id !== character.id ? all.find((f) => f.id === params.id) : undefined) ?? character.figure)
  const [figure, setFigure] = useState(first)
  const [as, setAs] = useState(figure && params.as !== "card" ? "figure" : "card")
  useEffect(() => {
    if (as === "card") history.replaceState(null, "", `${config.home}?id=${character.id}&as=card`)
  }, [as, character, config.home])
  return (
    <>
      {as === "figure" && figure ? (
        <FigureRoom key={figure.id} figure={figure} address={{ id: character.id, v: figure.id === character.figure?.id ? undefined : figure.id }} params={figure === first ? params : {}} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-10 p-10">
          {[character.front, character.back].map(
            (src) =>
              src && (
                <img key={src} src={src} alt="" className="max-h-full min-h-0 max-w-[42%] object-contain" />
              )
          )}
        </div>
      )}
      <div className={`absolute top-3 right-3 max-h-[calc(100%-1.5rem)] w-[290px] overflow-y-auto ${PANEL}`}>
        <div className="text-[15px] text-[#f2c97a]">{named(character.name)}</div>
        <div className="opacity-70">{named(character.role)}</div>
        {figure && (
          <div className="flex items-center gap-1">
            <button type="button" className={pill(as === "figure")} onClick={() => setAs("figure")}>
              Figure
            </button>
            <button type="button" className={pill(as === "card")} onClick={() => setAs("card")}>
              Card
            </button>
          </div>
        )}
        <div className="font-mono text-[10px] opacity-75">
          {character.height ? `${character.height} m · ` : ""}
          {scenes(character.scenes).toLowerCase()} · {figure ? "3D figure" : "card only"}
        </div>
        {[
          { title: "Current Version", of: all.filter((f) => f === character.figure) },
          { title: "Earlier Versions", of: all.filter((f) => f !== character.figure && !f.trial) },
          { title: "Trials", of: all.filter((f) => f !== character.figure && f.trial) },
        ].map(
          (part) =>
            part.of.length > 0 && (
              <div key={part.title} className="space-y-1 pt-1">
                <div className="opacity-60">
                  {part.title}
                  {part.of.length > 1 ? ` · ${part.of.length}` : ""}
                </div>
                {part.of.map((f) => {
                  const on = f === figure && as === "figure"
                  const triangles = f.lods[0]?.triangles || f.source.triangles
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setFigure(f)
                        setAs("figure")
                      }}
                      className={`block w-full rounded border px-2 py-1.5 text-left ${on ? "border-[#f2c97a] bg-[#f2c97a1f]" : "border-[#e6c89630] hover:border-[#f2c97a99]"}`}
                    >
                      <span className="flex flex-wrap items-center gap-1">
                        <span className={`text-[12px] ${on ? "text-[#f2c97a]" : ""}`}>{maker(f)}</span>
                        {!!f.plays?.length && <span className={`${TAG} bg-[#7fd0a0] text-[#0c1a12]`}>IN THE GAME</span>}
                      </span>
                      {f.note && <span className="block text-[10.5px] opacity-85">{named(f.note)}</span>}
                      <span className="block text-[10.5px] opacity-70">
                        Made {day(f.source.made)}
                        {f.source.built && f.source.built !== f.source.made ? ` · Rebuilt ${day(f.source.built)}` : ""}
                      </span>
                      <span className="block text-[10.5px] opacity-70">
                        {rigger(f)}
                        {triangles ? ` · ${count(triangles)} Triangles` : ""}
                      </span>
                      {!!f.plays?.length && <span className="block text-[10.5px] opacity-70">Plays in {f.plays.map(named).join(", ")}</span>}
                      <span className="block font-mono text-[9.5px] opacity-45">{f.id}</span>
                    </button>
                  )
                })}
              </div>
            )
        )}
      </div>
    </>
  )
}

// ── A place, assembled and live: a variant, empty or with one of its encounters, as the stage shows it or cut open ──
function PlaceView({ place, params }: { place: Place; params: Params }) {
  const config = useContext(Config)
  const [key, setKey] = useState(place.variants.find((v) => v.key === params.env)?.key ?? place.variants[0].key)
  const env = place.variants.find((v) => v.key === key) ?? place.variants[0]
  // It opens on its first encounter, where that encounter opens. "empty" in the address is the set alone.
  const [staging, setStaging] = useState(params.scene === "empty" ? null : params.scene && env.stagings.includes(params.scene) ? params.scene : (env.stagings[0] ?? null))
  const canCut = hasIso(env.key, env.room)
  const [view, setView] = useState(params.view === "stage" ? "stage" : "iso")
  const cut = view === "iso" && canCut
  // Where the camera can jump to in the scene now showing, and where it last went.
  const [nav, setNav] = useState<Nav | null>(null)
  const [at, setAt] = useState("")
  const onNav = useCallback((n: Nav | null) => {
    setNav(n)
    setAt(n?.open ?? "")
  }, [])
  useEffect(() => {
    const short = env.key.startsWith(`${config.setting}/`) ? env.key.slice(config.setting.length + 1) : env.key
    history.replaceState(null, "", `${config.home}?env=${short}&view=${cut ? "iso" : "stage"}&scene=${staging ?? "empty"}`)
  }, [env, cut, staging, config.home])
  return (
    <>
      <Scene set={env.key} staging={staging} iso={cut} files={config.files} figures={config.figures} onNav={onNav} onPick={setAt} />
      <div className={`absolute top-3 right-3 max-w-[420px] ${PANEL}`}>
        <div className="text-[15px] text-[#f2c97a]">{named(env.title)}</div>
        {place.variants.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-12 opacity-60">Variant</span>
            {place.variants.map((v) => (
              <button
                key={v.key}
                type="button"
                className={pill(v.key === env.key)}
                onClick={() => {
                  setKey(v.key)
                  setStaging(v.stagings[0] ?? null)
                }}
              >
                {v.key === place.id ? "Base" : named(v.key.slice(place.id.length + 1))}
              </button>
            ))}
          </div>
        )}
        {canCut && (
          <div className="flex items-center gap-1">
            <span className="w-12 opacity-60">View</span>
            <button type="button" className={pill(cut)} onClick={() => setView("iso")}>
              Isometric
            </button>
            <button type="button" className={pill(!cut)} onClick={() => setView("stage")}>
              Stage
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 opacity-60">Scene</span>
          {env.stagings.map((s) => (
            <button key={s} type="button" className={pill(s === staging)} onClick={() => setStaging(s)}>
              {scene(s)}
            </button>
          ))}
          <button type="button" className={pill(!staging)} onClick={() => setStaging(null)}>
            Empty
          </button>
        </div>
        {[false, true].map((cast) => {
          const row = nav?.shots.filter((s) => !!s.cast === cast) ?? []
          return row.length ? (
            <div key={String(cast)} className="flex flex-wrap items-center gap-1">
              <span className="w-12 opacity-60">{cast ? "Cast" : "Camera"}</span>
              {row.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={pill(s.key === at)}
                  onClick={() => {
                    nav?.go(s.key)
                    setAt(s.key)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null
        })}
        <div className="font-mono text-[10px] opacity-75">
          {env.objects} parts · {env.shots} shots · {env.paintings} paintings
          {env.room ? ` · ${env.room[0].toFixed(1)} × ${env.room[1].toFixed(1)} m` : ""}
        </div>
        <div className="text-[10px] opacity-55">Drag to turn · scroll to zoom · right-drag to slide · W A S D to fly · click a character</div>
      </div>
    </>
  )
}

// ── A picture, whole ──
function PictureView({ picture }: { picture: Picture }) {
  const config = useContext(Config)
  useEffect(() => {
    history.replaceState(null, "", `${config.home}?img=${encodeURIComponent(picture.src)}`)
  }, [picture, config.home])
  return (
    <>
      <img src={picture.src} alt="" className="absolute inset-0 h-full w-full object-contain p-4" />
      <div className={`absolute top-3 right-3 max-w-[420px] ${PANEL}`}>
        <div className="text-[15px] text-[#f2c97a]">{named(picture.title)}</div>
        <div className="opacity-70">
          {picture.kind}
          {picture.of ? ` · ${named(picture.of)}` : ""}
        </div>
        <a href={picture.src} target="_blank" rel="noreferrer" className={`inline-block ${pill(false)}`}>
          Open Original
        </a>
      </div>
    </>
  )
}

// How a kind of picture is laid out in the grid: the narrowest a card may be, and its shape.
const SHAPES: Record<string, [number, string]> = {
  Setting: [280, "aspect-[16/9]"],
  "Adventure Covers": [170, "aspect-[3/4]"],
  "Scene Art": [260, "aspect-[2/1]"],
  Maps: [230, "aspect-square"],
  Portraits: [112, "aspect-[5/6]"],
  "Set Paintings": [240, "aspect-[3/2]"],
  Backgrounds: [240, "aspect-[16/9]"],
}

// ── The library ──
export function AssetLibrary({ library, config, params: given }: { library: Library; config: LibraryConfig; params: Params }) {
  // A place's link leaves out the setting the page is already under: ?env=dragonbone-inn. The full key still opens it.
  const params = given.env && !given.env.includes("/") ? { ...given, env: `${library.setting}/${given.env}` } : given
  const { characters, places, groups } = library
  const pictures = library.pictures ?? []
  const kinds = library.kinds ?? []
  const [open, setOpen] = useState<{ character: Character } | { place: Place } | { picture: Picture } | null>(() => {
    const picture = params.img ? pictures.find((p) => p.src === params.img) : undefined
    if (picture) return { picture }
    // A character by their own id, or by a figure made of them: `v` names a figure, and so does an `id` no character has.
    const has = (c: Character, id?: string) => !!id && versionsOf(c).some((f) => f.id === id)
    const character = params.v
      ? characters.find((c) => has(c, params.v))
      : params.id
        ? (characters.find((c) => c.id === params.id) ?? characters.find((c) => has(c, params.id)) ?? characters.find((c) => c.figure?.cast?.includes(params.id as string)))
        : undefined
    const place = places.find((p) => p.variants.some((v) => v.key === params.env))
    return character ? { character } : place ? { place } : null
  })
  const [tab, setTab] = useState<Tab>(open ? ("picture" in open ? "images" : "place" in open ? "environments" : "characters") : (TABS.find((t) => t === params.tab) ?? TABS[0]))
  // The filter is an adventure for characters and places, and a kind for pictures.
  const [group, setGroup] = useState(params.group && [...groups, ...kinds].includes(params.group) ? params.group : "all")
  // Where the grid was when a card was opened, to come back to.
  const left = useRef(0)
  const back = useRef(0)
  const view = (o: NonNullable<typeof open>) => {
    left.current = window.scrollY
    setOpen(o)
  }
  const close = useCallback((where = left.current) => {
    back.current = where
    setFirst(false)
    setOpen(null)
  }, [])
  const show = (t: Tab) => {
    setTab(t)
    pick("all")
    setOnly(false)
  }
  const pick = (g: string) => {
    setGroup(g)
    if (open) close(0)
    else window.scrollTo(0, 0)
  }
  const [q, setQ] = useState(params.q ?? "")
  const [only, setOnly] = useState(params.only === "1")
  // What the first address asked for is used once: a card opened later starts from its own defaults.
  const [first, setFirst] = useState(true)
  const asked = first ? params : {}
  // The bar sits under the site's header, which is taller for a visitor who is signed out.
  const [top, setTop] = useState<number>()
  useEffect(() => {
    const header = document.querySelector("header")
    if (!header) return
    const measure = () => setTop(header.getBoundingClientRect().bottom)
    const watch = new ResizeObserver(measure)
    watch.observe(header)
    measure()
    return () => watch.disconnect()
  }, [])
  const was = useRef(!!open)
  useLayoutEffect(() => {
    if (was.current && !open) window.scrollTo(0, back.current)
    was.current = !!open
  }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && close()
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [open, close])

  useEffect(() => {
    if (open) return
    const p = new URLSearchParams()
    if (tab !== TABS[0]) p.set("tab", tab)
    if (group !== "all") p.set("group", group)
    if (q) p.set("q", q)
    if (only) p.set("only", "1")
    history.replaceState(null, "", `${config.home}${p.size ? `?${p}` : ""}`)
  }, [open, tab, group, q, only, config.home])

  const words = q.trim().toLowerCase()
  const shownCharacters = characters.filter((c) => (!only || c.figure) && (!words || `${c.name} ${c.role} ${c.id} ${versionsOf(c).map((f) => `${f.id} ${f.source.generator}`).join(" ")}`.toLowerCase().includes(words)))
  const shownPlaces = places.filter((p) => (!only || p.variants.some((v) => hasIso(v.key, v.room))) && (!words || `${p.title} ${p.variants.map((v) => v.key).join(" ")}`.toLowerCase().includes(words)))
  const shownPictures = pictures.filter((p) => !words || `${p.title} ${p.kind} ${p.of ?? ""}`.toLowerCase().includes(words))
  const inGroup = (g: string) =>
    tab === "characters"
      ? shownCharacters.filter((c) => c.group === g).length
      : tab === "environments"
        ? shownPlaces.filter((p) => p.groups.includes(g)).length
        : shownPictures.filter((p) => p.kind === g).length
  const sections = (tab === "images" ? kinds : groups).filter((g) => (group === "all" || group === g) && inGroup(g) > 0)
  const total = tab === "characters" ? shownCharacters.length : tab === "environments" ? shownPlaces.length : shownPictures.length
  const groupName = (g: string) => (tab === "images" ? g : g === "heroes" ? "Player Heroes" : g === "unused" ? "Not in a Scene" : named(g))
  // An adventure's places in the order the story reaches them, a run for each chapter.
  const chapters = (g: string) => {
    const first = (p: Place) => p.story?.[g]?.order ?? Number.MAX_SAFE_INTEGER
    const runs: { chapter: string; places: Place[] }[] = []
    for (const p of shownPlaces.filter((p) => p.groups.includes(g)).sort((a, b) => first(a) - first(b))) {
      const chapter = p.story?.[g]?.chapter ?? ""
      const last = runs.at(-1)
      if (last?.chapter === chapter) last.places.push(p)
      else runs.push({ chapter, places: [p] })
    }
    return runs
  }
  const figured = characters.filter((c) => c.figure)
  const party = figured.filter((c) => c.figure?.party)
  const others = figured.filter((c) => !c.figure?.party)
  // Nothing narrowed: the first tab opens under the library's title, and the characters under the party.
  const whole = !words && !only && group === "all"
  const home = whole && tab === "characters"
  // Which character's figure stands for a cast id, for a scene.
  const provided = useMemo(
    () => ({ ...config, setting: library.setting, figures: Object.fromEntries(characters.flatMap((c) => (c.figure ? (c.figure.cast ?? [c.id]).map((id) => [id, c.figure?.id as string]) : []))) }),
    [config, characters, library.setting]
  )

  const figureCard = (c: Character, wide: boolean) => (
    <button
      key={c.id}
      type="button"
      onClick={() => view({ character: c })}
      className={`group relative shrink-0 rounded-lg border border-[#e6c8962e] bg-gradient-to-b from-[#1c1610] to-[#120e09] p-3 text-left transition-colors hover:border-[#f2c97a] ${wide ? "w-[172px]" : "w-[148px]"}`}
    >
      <img src={`${config.files}/${c.figure?.id}/${c.figure?.thumb ?? c.figure?.front}`} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
      <span className={`mt-2 block truncate font-display group-hover:text-[#f2c97a] ${wide ? "text-[15px]" : "text-[13px]"}`}>{named(c.name)}</span>
      <span className="block truncate text-[11px] opacity-60">{named(c.figure?.role ?? c.role)}</span>
      {c.figure && (
        <span className="mt-1 block truncate font-mono text-[9.5px] opacity-55">
          {maker(c.figure)} · {day(c.figure.source.made).split(",")[0]}
        </span>
      )}
      {c.figure && (
        <span className="block h-[14px] truncate font-mono text-[9.5px] opacity-55">{versionsOf(c).length > 1 ? `${versionsOf(c).length} Versions` : ""}</span>
      )}
      {!!c.figure?.plays?.length && <span className={`absolute top-2 right-2 ${TAG} bg-[#7fd0a0] text-[#0c1a12]`}>IN THE GAME</span>}
    </button>
  )

  // What is open, and the group it is filed under.
  const shown = !open
    ? null
    : "character" in open
      ? { name: open.character.name, group: open.character.group }
      : "place" in open
        ? { name: open.place.title, group: open.place.groups.includes(group) ? group : open.place.groups[0] }
        : { name: open.picture.title, group: open.picture.kind }

  return (
    <Config.Provider value={provided}>
      <div className="min-h-screen bg-[#0d0b09] pt-12 font-serif text-[#e9dcc3]" style={{ paddingTop: top }}>
        <div className={open ? "fixed inset-x-0 top-12 bottom-0 z-20 flex flex-col bg-[#0d0b09]" : "contents"} style={{ top }}>
          <div className={`border-b border-[#e6c89626] bg-[#0e0a06f2] backdrop-blur-sm ${open ? "shrink-0" : "sticky top-12 z-20"}`} style={open ? undefined : { top }}>
            <div className="mx-auto max-w-[1500px] space-y-2 px-5 py-2.5 sm:px-8">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <button
                  type="button"
                  className="font-display text-[15px] tracking-[0.04em] text-[#f2c97a] hover:text-[#ffe0a3]"
                  onClick={() => {
                    setQ("")
                    setTab(TABS[0])
                    setOnly(false)
                    pick("all")
                  }}
                >
                  Asset Library
                </button>
                <div className="order-3 flex w-full gap-1 text-[13px] sm:order-2 sm:w-auto">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`rounded px-2.5 py-1 ${tab === t ? "bg-[#f2c97a26] text-[#f2c97a]" : "opacity-70 hover:opacity-100"}`}
                      onClick={() => (t === tab && open ? close() : show(t))}
                    >
                      {t === "characters" ? `Characters · ${characters.length}` : t === "environments" ? `Places · ${places.length}` : `Images · ${pictures.length}`}
                    </button>
                  ))}
                </div>
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    if (open) close(0)
                  }}
                  placeholder="Search"
                  aria-label="Search"
                  className="order-2 min-w-0 flex-1 rounded border border-[#e6c89640] bg-transparent px-2 py-1 text-[12px] outline-none placeholder:opacity-40 focus:border-[#f2c97a99] sm:order-3 sm:ml-auto sm:w-56 sm:flex-none"
                />
              </div>
              {shown ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <button type="button" className={pill(false)} onClick={() => close()}>
                    ← Back
                  </button>
                  <button type="button" className="ml-1.5 opacity-70 hover:text-[#f2c97a] hover:opacity-100" onClick={() => pick(shown.group)}>
                    {groupName(shown.group)}
                  </button>
                  <span className="opacity-40">/</span>
                  <span className="text-[#f2c97a]">{named(shown.name)}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <button type="button" className={pill(group === "all")} onClick={() => pick("all")}>
                    All · {total}
                  </button>
                  {(tab === "images" ? kinds : groups)
                    .filter((g) => inGroup(g) > 0 || g === group)
                    .map((g) => (
                      <button key={g} type="button" className={pill(group === g)} onClick={() => pick(g)}>
                        {groupName(g)} · {inGroup(g)}
                      </button>
                    ))}
                  {tab !== "images" && (
                    <button type="button" className={`ml-3 ${pill(only)}`} onClick={() => setOnly((o) => !o)}>
                      {tab === "characters" ? `3D · ${figured.length}` : `Isometric · ${places.filter((p) => p.variants.some((v) => hasIso(v.key, v.room))).length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {open && (
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {"character" in open ? (
                <CharacterView character={open.character} params={asked} />
              ) : "place" in open ? (
                <PlaceView place={open.place} params={asked} />
              ) : (
                <PictureView picture={open.picture} />
              )}
            </div>
          )}
        </div>

        <div className={open ? "hidden" : "mx-auto max-w-[1500px] px-5 pb-16 sm:px-8"}>
          {whole && tab === TABS[0] && (
            <div className="pt-10 pb-7 text-center">
              <h1 className="font-display text-[34px] leading-tight tracking-[0.04em] text-[#f2c97a] sm:text-[44px]">{library.settingName}</h1>
              <div className="mt-3 text-[13px] opacity-70">
                {figured.length} Figures in 3D · {characters.length} Characters · {places.length} Places · {pictures.length} Images
              </div>
            </div>
          )}

          {home && party.length > 0 && (
            <section className="pb-4">
              <h2 className="pb-3 text-center text-[11px] tracking-[0.24em] uppercase opacity-55">The Party</h2>
              <div className="flex flex-wrap justify-center gap-3">{party.map((c) => figureCard(c, true))}</div>
            </section>
          )}
          {home && others.length > 0 && (
            <section className="pt-4 pb-2">
              <h2 className="pb-3 text-center text-[11px] tracking-[0.24em] uppercase opacity-55">Also in 3D</h2>
              <div className="flex flex-wrap justify-center gap-3">{others.map((c) => figureCard(c, false))}</div>
            </section>
          )}

          {sections.map((g) => (
            <section key={g}>
              <h2 className="pt-6 pb-2 text-[11px] tracking-[0.14em] uppercase opacity-55">
                {groupName(g)} · {inGroup(g)}
              </h2>
              {tab === "characters" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5">
                  {shownCharacters
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => view({ character: c })}
                        className="group relative rounded-md border border-[#e6c8961f] bg-[#14100b] p-2 text-left hover:border-[#f2c97a99]"
                      >
                        <img src={c.front} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
                        {c.figure && <span className="absolute top-1.5 right-1.5 rounded bg-[#f2c97a] px-1 text-[9px] font-semibold tracking-wide text-[#1a1208]">3D</span>}
                        <span className="mt-1.5 block truncate text-[12px] group-hover:text-[#f2c97a]">{named(c.name)}</span>
                        <span className="block truncate text-[10px] opacity-55">{named(c.role)}</span>
                      </button>
                    ))}
                </div>
              ) : tab === "images" ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${(SHAPES[g] ?? [240])[0]}px, 1fr))` }}>
                  {shownPictures
                    .filter((p) => p.kind === g)
                    .map((p) => (
                      <button
                        key={p.src}
                        type="button"
                        onClick={() => view({ picture: p })}
                        className="group overflow-hidden rounded-md border border-[#e6c8961f] bg-[#14100b] text-left hover:border-[#f2c97a99]"
                      >
                        <img src={p.src} alt="" loading="lazy" decoding="async" className={`${(SHAPES[g] ?? [0, "aspect-[3/2]"])[1]} w-full object-cover`} />
                        <span className="block truncate px-2.5 pt-1.5 text-[12px] group-hover:text-[#f2c97a]">{named(p.title)}</span>
                        <span className="block truncate px-2.5 pb-2 text-[10px] opacity-55">{p.of ? named(p.of) : g}</span>
                      </button>
                    ))}
                </div>
              ) : (
                chapters(g).map(({ chapter, places: run }, i, all) => (
                  <div key={chapter}>
                    {all.length > 1 && chapter && (
                      <h3 className={`${i ? "pt-5" : "pt-1"} pb-2 font-display text-[15px] tracking-[0.03em] text-[#f2c97a]`}>
                        {named(chapter)} <span className="font-serif text-[11px] text-[#e9dcc3] opacity-55">· {run.length}</span>
                      </h3>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                      {run.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => view({ place: p })}
                          className="group relative overflow-hidden rounded-md border border-[#e6c8961f] bg-[#14100b] text-left hover:border-[#f2c97a99]"
                        >
                          {p.picture ? (
                            <img src={p.picture} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                          ) : (
                            <span className="block aspect-[3/2] w-full bg-[#1a140e]" />
                          )}
                          {p.variants.some((v) => hasIso(v.key, v.room)) && (
                            <span className="absolute top-1.5 right-1.5 rounded bg-[#f2c97a] px-1 text-[9px] font-semibold tracking-wide text-[#1a1208]">ISO</span>
                          )}
                          <span className="block px-2.5 pt-1.5 text-[12.5px] group-hover:text-[#f2c97a]">{named(p.title)}</span>
                          <span className="block px-2.5 pb-2 font-mono text-[9.5px] opacity-55">
                            {p.variants.length > 1 ? `${p.variants.length} Variants · ` : ""}
                            {scenes(p.variants.reduce((n, v) => n + v.stagings.length, 0))}
                            {p.variants.some((v) => v.paintings) ? " · Painted" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      </div>
    </Config.Provider>
  )
}
