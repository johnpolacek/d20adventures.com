"use client"

// The asset library's page: the shelf down the left, and the chosen figure standing in a lit room on the right, at any of
// its detail levels and in any of its clips. The figure plays the clips the game will (lab/stage-art/clips.ts).

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { figureClips, isRigged } from "@/lab/stage-art/clips"

export interface Asset {
  id: string
  kind: string
  name: string
  role: string
  status: string
  height: number
  front: string
  source: { generator: string; model: string; triangles: number; cost: number; made: string }
  rig: { bones: number; weights: string }
  clips: string[]
  lods: { file: string; triangles: number; megabytes: number; texture: number }[]
}

const BASE = "/stage-lab/figures"
const pill = (on: boolean) => `rounded border px-1.5 py-0.5 ${on ? "border-[#f2c97a] bg-[#f2c97a33] text-[#f2c97a]" : "border-[#e6c89640] text-[#e9dcc3b0] hover:border-[#f2c97a99]"}`
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const count = (n: number) => n.toLocaleString("en-US")

interface Room {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  figure: THREE.Object3D | null
  mixer: THREE.AnimationMixer | null
  clips: THREE.AnimationClip[]
  action: THREE.AnimationAction | null
  // The asset in the room, so a change of detail keeps the camera and the moment in the clip.
  shown: string | null
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

export function AssetLibrary({ assets, params }: { assets: Asset[]; params: Record<string, string | undefined> }) {
  const host = useRef<HTMLDivElement>(null)
  const room = useRef<Room | null>(null)
  const [id, setId] = useState(assets.find((a) => a.id === params.id)?.id ?? assets[0]?.id ?? null)
  const asset = assets.find((a) => a.id === id) ?? null
  const [lod, setLod] = useState(Math.min(Number(params.lod) || 0, Math.max(0, (asset?.lods.length ?? 1) - 1)))
  const [clip, setClip] = useState(params.clip && asset?.clips.includes(params.clip) ? params.clip : (asset?.clips[0] ?? ""))
  const [turning, setTurning] = useState(params.turn === "1")
  const [fps, setFps] = useState(0)
  const [loading, setLoading] = useState(false)
  const kinds = [...new Set(assets.map((a) => a.kind))]

  // The room: made once, and kept while assets come and go.
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
    const r: Room = { renderer, scene, camera, controls, figure: null, mixer: null, clips: [], action: null, shown: null }
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

  // The figure: loaded when the asset or its detail level changes.
  useEffect(() => {
    const r = room.current
    if (!r || !asset) return
    const file = asset.lods[lod]?.file
    if (!file) return
    let stale = false
    setLoading(true)
    new GLTFLoader()
      .loadAsync(`${BASE}/${asset.id}/${file}`)
      .then((gltf) => {
        if (stale) return discard(gltf.scene)
        const at = r.shown === asset.id ? (r.action?.time ?? 0) : 0
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
        if (r.shown !== asset.id) {
          r.controls.target.set(0, tall * 0.5, 0)
          r.camera.position.set(tall * 0.8, tall * 0.72, tall * 2.25)
          r.shown = asset.id
        }
        ;(window as unknown as { __assets: { ready?: string } }).__assets.ready = `${asset.id}/${file}`
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
  }, [asset, lod])

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
    if (!id) return
    const q = new URLSearchParams({ id, lod: String(lod), clip })
    if (turning) q.set("turn", "1")
    history.replaceState(null, "", `/dev/assets?${q}`)
  }, [id, lod, clip, turning])

  const pick = (a: Asset) => {
    setId(a.id)
    setLod((l) => Math.min(l, a.lods.length - 1))
    setClip((c) => (a.clips.includes(c) ? c : (a.clips[0] ?? "")))
  }
  const level = asset?.lods[lod]

  return (
    <div className="fixed inset-0 z-[100] flex overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-[#e6c89626] bg-[#0e0a06]">
        <div className="px-3 pt-3 pb-2 text-[14px] tracking-[0.06em] text-[#f2c97a]">Asset Library</div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {kinds.map((kind) => (
            <div key={kind}>
              <div className="px-3 pt-2 pb-1 text-[10px] tracking-[0.14em] uppercase opacity-50">
                {title(kind)}s · {assets.filter((a) => a.kind === kind).length}
              </div>
              {assets
                .filter((a) => a.kind === kind)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pick(a)}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${a.id === id ? "bg-[#f2c97a1f]" : "hover:bg-[#f2c97a0d]"}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: a dev page's local file */}
                    <img src={`${BASE}/${a.id}/${a.front}`} alt="" className="h-14 w-9 rounded-sm object-cover object-top" />
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] ${a.id === id ? "text-[#f2c97a]" : ""}`}>{a.name}</span>
                      <span className="block truncate text-[10px] opacity-60">{a.role}</span>
                      <span className="block font-mono text-[9px] opacity-50">
                        {title(a.status)} · {a.lods.length} Levels
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        {asset && (
          <div className="absolute top-3 left-3 space-y-1.5 rounded-md border border-[#e6c89640] bg-[#0e0a06b0] px-3 py-2 text-[11px] leading-snug backdrop-blur-sm">
            <div className="text-[15px] text-[#f2c97a]">{asset.name}</div>
            <div className="flex items-center gap-1">
              <span className="w-10 opacity-60">Detail</span>
              {asset.lods.map((l, i) => (
                <button key={l.file} type="button" className={pill(i === lod)} onClick={() => setLod(i)}>
                  {count(l.triangles)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-10 opacity-60">Clip</span>
              {asset.clips.map((c) => (
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
                {count(level.triangles)} tris · {level.megabytes} MB · {level.texture} px · {asset.rig.bones} bones · {asset.height} m · {loading ? "…" : `${fps} fps`}
              </div>
            )}
            <div className="font-mono text-[10px] opacity-55">
              {asset.source.generator} · {count(asset.source.triangles)} tris · ${asset.source.cost.toFixed(2)} · {asset.source.made}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
