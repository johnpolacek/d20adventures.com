"use client"

// The asset library's page, shared by the workspace's own (/dev/assets) and the one anyone can open
// (/settings/<setting>/assets). It opens as a home: the party, then every character or place as a grid under the
// adventure it belongs to, narrowed by a search or a filter. A card opens the asset itself:
//   - a character with a 3D figure stands in a lit room, at any detail level and in any clip the game plays
//     (asset-library/clips.ts), and one without shows its card;
//   - a place shows its picture. In the workspace it is shown live by the stage's own dev pages, in a frame: a variant,
//     empty or with one of its scenes, as the stage shows it or as an isometric cut-away.

import { createContext, useContext, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { figureClips, isRigged } from "../clips"
import type { Character, Figure, Library, Picture, Place } from "../types"

// Where a page of the library lives, where its figures' files are served from, and whether the stage's dev pages are
// there to show a place live.
export interface LibraryConfig {
  home: string
  files: string
  live: boolean
}
const Config = createContext<LibraryConfig>({ home: "/dev/assets", files: "/dev/assets/file/characters", live: true })

type Params = Record<string, string | undefined>
type Tab = "characters" | "environments" | "images"

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
const scenes = (n: number) => `${n} ${n === 1 ? "Scene" : "Scenes"}`
// The lens that fits a room seen from 40 metres.
const lens = (room: [number, number]) => Math.round(THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((Math.hypot(...room) * 0.52) / 40)), 8, 40))

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

function FigureRoom({ figure, params }: { figure: Figure; params: Params }) {
  const config = useContext(Config)
  const host = useRef<HTMLDivElement>(null)
  const room = useRef<Room | null>(null)
  const [lod, setLod] = useState(Math.min(Number(params.lod) || 0, figure.lods.length - 1))
  const [clip, setClip] = useState(params.clip && figure.clips.includes(params.clip) ? params.clip : (figure.clips[0] ?? ""))
  const [turning, setTurning] = useState(params.turn === "1")
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
    const r: Room = { renderer, scene, camera, controls, figure: null, mixer: null, clips: [], action: null, framed: false }
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
        const at = r.action?.time ?? 0
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
        r.action = null
        const next = r.clips.find((c) => c.name === clip) ?? r.clips[0]
        if (next) {
          r.action = r.mixer.clipAction(next).play()
          r.action.time = at
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
  }, [clip])

  useEffect(() => {
    if (!room.current) return
    room.current.controls.autoRotate = turning
    room.current.controls.autoRotateSpeed = 2.4
  }, [turning])

  // The address keeps what is shown, so a view can be opened again.
  useEffect(() => {
    const q = new URLSearchParams({ id: figure.cast?.[0] ?? figure.id, lod: String(lod), clip })
    if (turning) q.set("turn", "1")
    history.replaceState(null, "", `${config.home}?${q}`)
  }, [figure, lod, clip, turning, config.home])

  const level = figure.lods[lod]
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <div className={`absolute top-14 left-3 ${PANEL}`}>
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
          {figure.clips.map((c) => (
            <button key={c} type="button" className={pill(c === clip)} onClick={() => setClip(c)}>
              {c}
            </button>
          ))}
          <button type="button" className={`ml-2 ${pill(turning)}`} onClick={() => setTurning((t) => !t)}>
            Turntable
          </button>
        </div>
        {level && (
          <div className="font-mono text-[10px] opacity-75">
            {count(level.triangles)} tris · {level.megabytes} MB · {level.texture} px · {figure.rig.bones} bones · {figure.height} m · {loading ? "…" : `${fps} fps`}
          </div>
        )}
        <div className="font-mono text-[10px] opacity-55">
          {figure.source.generator} · {count(figure.source.triangles)} tris · ${figure.source.cost.toFixed(2)} · {figure.source.made}
        </div>
      </div>
    </>
  )
}

// ── A character: its figure, or its card ──
function CharacterView({ character, params }: { character: Character; params: Params }) {
  const config = useContext(Config)
  const [as, setAs] = useState(character.figure && params.as !== "card" ? "figure" : "card")
  useEffect(() => {
    if (as === "card") history.replaceState(null, "", `${config.home}?id=${character.id}&as=card`)
  }, [as, character, config.home])
  return (
    <>
      {as === "figure" && character.figure ? (
        <FigureRoom figure={character.figure} params={params} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-10 p-10">
          {[character.front, character.back].map(
            (src) =>
              src && (
                // biome-ignore lint/performance/noImgElement: card art served as it is
                <img key={src} src={src} alt="" className="max-h-full min-h-0 max-w-[42%] object-contain" />
              )
          )}
        </div>
      )}
      <div className={`absolute top-3 right-3 ${PANEL}`}>
        <div className="text-[15px] text-[#f2c97a]">{named(character.name)}</div>
        <div className="opacity-70">{named(character.role)}</div>
        {character.figure && (
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
          {scenes(character.scenes).toLowerCase()} · {character.figure ? "3D figure" : "card only"}
        </div>
      </div>
    </>
  )
}

// ── A place: its picture, and in the workspace one of its variants live in the stage's own page ──
function PlaceView({ place, params }: { place: Place; params: Params }) {
  const config = useContext(Config)
  const [key, setKey] = useState(place.variants.find((v) => v.key === params.env)?.key ?? place.variants[0].key)
  const env = place.variants.find((v) => v.key === key) ?? place.variants[0]
  const [staging, setStaging] = useState(params.scene && env.stagings.includes(params.scene) ? params.scene : null)
  const [view, setView] = useState(params.view === "iso" ? "iso" : "stage")
  // The cut-away is the lab's, which shows a set through one of its scenes.
  const iso = view === "iso" && !!env.room && !!env.stagings[0]
  const src = iso
    ? `/dev/stage-lab?staging=${staging ?? env.stagings[0]}&tier=balanced&paint=0&iso=45,35,40,${lens(env.room as [number, number])}&isolight=1.4,0.3,1.8&panel=0${staging ? "" : "&cast=off"}`
    : staging
      ? `/dev/stage?staging=${staging}&tier=balanced&panel=0`
      : `/dev/stage?set=${env.key}&staging=none&tier=balanced&panel=0`
  useEffect(() => {
    history.replaceState(null, "", `${config.home}?env=${env.key}${config.live ? `&view=${view}${staging ? `&scene=${staging}` : ""}` : ""}`)
  }, [env, view, staging, config])
  const picture = env.picture ?? place.picture
  return (
    <>
      {config.live ? (
        <iframe key={src} src={src} title={env.title} className="absolute inset-0 h-full w-full border-0 bg-[#0d0b09]" />
      ) : picture ? (
        // biome-ignore lint/performance/noImgElement: scene art served as it is
        <img src={picture} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
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
                  setStaging(null)
                }}
              >
                {v.key === place.id ? "Base" : named(v.key.slice(place.id.length + 1))}
              </button>
            ))}
          </div>
        )}
        {config.live && (
          <>
            <div className="flex items-center gap-1">
              <span className="w-12 opacity-60">View</span>
              <button type="button" className={pill(!iso)} onClick={() => setView("stage")}>
                Stage
              </button>
              {env.room && env.stagings[0] && (
                <button type="button" className={pill(iso)} onClick={() => setView("iso")}>
                  Isometric
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-12 opacity-60">Scene</span>
              <button type="button" className={pill(!staging)} onClick={() => setStaging(null)}>
                Empty
              </button>
              {env.stagings.map((s) => (
                <button key={s} type="button" className={pill(s === staging)} onClick={() => setStaging(s)}>
                  {scene(s)}
                </button>
              ))}
            </div>
          </>
        )}
        {!config.live && env.stagings.length > 0 && <div className="opacity-70">{env.stagings.map(scene).join(" · ")}</div>}
        <div className="font-mono text-[10px] opacity-75">
          {env.objects} parts · {env.shots} shots · {env.paintings} paintings
          {env.room ? ` · ${env.room[0].toFixed(1)} × ${env.room[1].toFixed(1)} m` : ""}
        </div>
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
      {/* biome-ignore lint/performance/noImgElement: art served as it is */}
      <img src={picture.src} alt="" className="absolute inset-0 h-full w-full object-contain p-4 pt-14" />
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
export function AssetLibrary({ library, config, params }: { library: Library; config: LibraryConfig; params: Params }) {
  const { characters, places, groups } = library
  const pictures = library.pictures ?? []
  const kinds = library.kinds ?? []
  const [open, setOpen] = useState<{ character: Character } | { place: Place } | { picture: Picture } | null>(() => {
    const picture = params.img ? pictures.find((p) => p.src === params.img) : undefined
    if (picture) return { picture }
    const character = params.id ? characters.find((c) => c.id === params.id || c.figure?.cast?.includes(params.id as string) || c.figure?.id === params.id) : undefined
    const place = places.find((p) => p.variants.some((v) => v.key === params.env))
    return character ? { character } : place ? { place } : null
  })
  const [tab, setTab] = useState<Tab>(params.tab === "images" || (open && "picture" in open) ? "images" : params.tab === "environments" || (open && "place" in open) ? "environments" : "characters")
  // The filter is an adventure for characters and places, and a kind for pictures.
  const [group, setGroup] = useState(params.group && [...groups, ...kinds].includes(params.group) ? params.group : "all")
  const show = (t: Tab) => {
    setTab(t)
    setGroup("all")
    setOnly(false)
  }
  const [q, setQ] = useState(params.q ?? "")
  const [only, setOnly] = useState(params.only === "1")
  // What the first address asked for is used once: a card opened later starts from its own defaults.
  const [first, setFirst] = useState(true)
  const asked = first ? params : {}

  useEffect(() => {
    if (open) return
    const p = new URLSearchParams()
    if (tab !== "characters") p.set("tab", tab)
    if (group !== "all") p.set("group", group)
    if (q) p.set("q", q)
    if (only) p.set("only", "1")
    history.replaceState(null, "", `${config.home}${p.size ? `?${p}` : ""}`)
  }, [open, tab, group, q, only, config.home])

  const words = q.trim().toLowerCase()
  const shownCharacters = characters.filter((c) => (!only || c.figure) && (!words || `${c.name} ${c.role} ${c.id}`.toLowerCase().includes(words)))
  const shownPlaces = places.filter((p) => (!only || p.variants.some((v) => v.room)) && (!words || `${p.title} ${p.variants.map((v) => v.key).join(" ")}`.toLowerCase().includes(words)))
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
  const figured = characters.filter((c) => c.figure)
  const party = figured.filter((c) => c.figure?.party)
  const others = figured.filter((c) => !c.figure?.party)
  const home = !words && !only && group === "all" && tab === "characters"

  if (open)
    return (
      <Config.Provider value={config}>
        <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
          {"character" in open ? (
            <CharacterView character={open.character} params={asked} />
          ) : "place" in open ? (
            <PlaceView place={open.place} params={asked} />
          ) : (
            <PictureView picture={open.picture} />
          )}
          <button
            type="button"
            className="absolute top-3 left-3 z-10 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-1.5 text-[12px] text-[#f2c97a] backdrop-blur-sm hover:border-[#f2c97a99]"
            onClick={() => {
              setFirst(false)
              setOpen(null)
            }}
          >
            ← Asset Library
          </button>
        </div>
      </Config.Provider>
    )

  const figureCard = (c: Character, wide: boolean) => (
    <button
      key={c.id}
      type="button"
      onClick={() => setOpen({ character: c })}
      className={`group shrink-0 rounded-lg border border-[#e6c8962e] bg-gradient-to-b from-[#1c1610] to-[#120e09] p-3 text-left transition-colors hover:border-[#f2c97a] ${wide ? "w-[172px]" : "w-[132px]"}`}
    >
      {/* biome-ignore lint/performance/noImgElement: a thumbnail served as it is */}
      <img src={`${config.files}/${c.figure?.id}/${c.figure?.front}`} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
      <span className={`mt-2 block truncate font-display group-hover:text-[#f2c97a] ${wide ? "text-[15px]" : "text-[13px]"}`}>{named(c.name)}</span>
      <span className="block truncate text-[11px] opacity-60">{named(c.figure?.role ?? c.role)}</span>
    </button>
  )

  return (
    <Config.Provider value={config}>
      <div className="min-h-screen bg-[#0d0b09] pt-12 font-serif text-[#e9dcc3]">
        <div className="mx-auto max-w-[1500px] px-5 pb-16 sm:px-8">
          <div className="pt-10 pb-7 text-center">
            <div className="text-[11px] tracking-[0.32em] uppercase opacity-60">{library.settingName}</div>
            <h1 className="mt-2 font-display text-[34px] leading-tight tracking-[0.04em] text-[#f2c97a] sm:text-[44px]">Asset Library</h1>
            <div className="mt-3 text-[13px] opacity-70">
              {figured.length} Figures in 3D · {characters.length} Characters · {places.length} Places · {pictures.length} Images
            </div>
          </div>

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

          <div className="sticky top-12 z-20 -mx-5 mt-6 space-y-2 border-y border-[#e6c89626] bg-[#0e0a06f2] px-5 py-2.5 backdrop-blur-sm sm:-mx-8 sm:px-8">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex gap-1 text-[13px]">
                {(["characters", "environments", "images"] as const).map((t) => (
                  <button key={t} type="button" className={`rounded px-2.5 py-1 ${tab === t ? "bg-[#f2c97a26] text-[#f2c97a]" : "opacity-70 hover:opacity-100"}`} onClick={() => show(t)}>
                    {t === "characters" ? `Characters · ${characters.length}` : t === "environments" ? `Places · ${places.length}` : `Images · ${pictures.length}`}
                  </button>
                ))}
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                aria-label="Search"
                className="ml-auto w-56 rounded border border-[#e6c89640] bg-transparent px-2 py-1 text-[12px] outline-none placeholder:opacity-40 focus:border-[#f2c97a99]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <button type="button" className={pill(group === "all")} onClick={() => setGroup("all")}>
                All · {total}
              </button>
              {(tab === "images" ? kinds : groups)
                .filter((g) => inGroup(g) > 0 || g === group)
                .map((g) => (
                  <button key={g} type="button" className={pill(group === g)} onClick={() => setGroup(g)}>
                    {groupName(g)} · {inGroup(g)}
                  </button>
                ))}
              {(tab === "characters" || (tab === "environments" && config.live)) && (
                <button type="button" className={`ml-3 ${pill(only)}`} onClick={() => setOnly((o) => !o)}>
                  {tab === "characters" ? `3D · ${figured.length}` : `Isometric · ${places.filter((p) => p.variants.some((v) => v.room)).length}`}
                </button>
              )}
            </div>
          </div>

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
                        onClick={() => setOpen({ character: c })}
                        className="group relative rounded-md border border-[#e6c8961f] bg-[#14100b] p-2 text-left hover:border-[#f2c97a99]"
                      >
                        {/* biome-ignore lint/performance/noImgElement: card art served as it is */}
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
                        onClick={() => setOpen({ picture: p })}
                        className="group overflow-hidden rounded-md border border-[#e6c8961f] bg-[#14100b] text-left hover:border-[#f2c97a99]"
                      >
                        {/* biome-ignore lint/performance/noImgElement: art served as it is */}
                        <img src={p.src} alt="" loading="lazy" decoding="async" className={`${(SHAPES[g] ?? [0, "aspect-[3/2]"])[1]} w-full object-cover`} />
                        <span className="block truncate px-2.5 pt-1.5 text-[12px] group-hover:text-[#f2c97a]">{named(p.title)}</span>
                        <span className="block truncate px-2.5 pb-2 text-[10px] opacity-55">{p.of ? named(p.of) : g}</span>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                  {shownPlaces
                    .filter((p) => p.groups.includes(g))
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpen({ place: p })}
                        className="group relative overflow-hidden rounded-md border border-[#e6c8961f] bg-[#14100b] text-left hover:border-[#f2c97a99]"
                      >
                        {p.picture ? (
                          // biome-ignore lint/performance/noImgElement: scene art served as it is
                          <img src={p.picture} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                        ) : (
                          <span className="block aspect-[3/2] w-full bg-[#1a140e]" />
                        )}
                        {config.live && p.variants.some((v) => v.room) && (
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
              )}
            </section>
          ))}
        </div>
      </div>
    </Config.Provider>
  )
}
