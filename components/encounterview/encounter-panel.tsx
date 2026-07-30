"use client"

// Player-facing "Encounter Map" entry points: EncounterPanel is the floating
// button (below xl), EncounterRailPanel is the card docked in the turn page's
// right rail (desktop). Both open the same fullscreen overlay, which toggles
// between the 3D miniatures diorama (staged per turn from the narrative by the
// server action, cached in S3) and the encounter's 2D battle map.

import { Maximize2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getOrGenerateCharacterMinis } from "@/app/_actions/generate-character-mini"
import { getOrGenerateEncounterScene } from "@/app/_actions/generate-encounter-scene"
import { uploadScenePreview } from "@/app/_actions/scene-preview"
import Parchment from "@/components/graphics/background/Parchment"
import { EncounterMap2D, type MapTokens } from "@/components/mapview/encounter-map-2d"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import NativeImage from "@/components/ui/native-image"
import { useTurn } from "@/lib/context/TurnContext"
import { cn, getImageUrl } from "@/lib/utils"
import type { Encounter2DMap } from "@/types/encounter-map-2d"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"
import EncounterTurnDrawer from "./encounter-turn-drawer"
import EncounterTurnStrip from "./encounter-turn-strip"

// Keep three.js out of the turn-page bundle until the overlay first opens.
const EncounterScene = dynamic(() => import("./encounter-scene"), { ssr: false })

const MINIS_POLL_INTERVAL_MS = 10000

// Session-level caches shared by both entry points and across open/close cycles.
const sceneCache = new Map<string, EncounterScene3D>()

// Last scene actually shown, module-level so turn advances (which remount the
// page subtree, overlay included) keep the previous diorama on screen while the
// next turn's scene stages instead of dropping to the loading card.
let lastShownScene: EncounterScene3D | null = null

// Turn advances remount the [turnOrder] page subtree, wiping component state —
// persist open flags in sessionStorage so they survive the navigation.
function usePersistedOpen(storageKey: string | null): [boolean, (next: boolean) => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (storageKey && sessionStorage.getItem(storageKey) === "1") setOpen(true)
  }, [storageKey])
  const setOpenPersisted = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!storageKey) return
      if (next) sessionStorage.setItem(storageKey, "1")
      else sessionStorage.removeItem(storageKey)
    },
    [storageKey]
  )
  return [open, setOpenPersisted]
}

// The overlay flag is keyed per entry point too: the rail and floating-button
// entries are both mounted (breakpoint-hidden), and only the one that opened
// should restore.
function useOverlayOpen(adventureId: string | undefined, entryPoint: "rail" | "floating"): [boolean, (next: boolean) => void] {
  return usePersistedOpen(adventureId ? `encounterOverlayOpen:${adventureId}:${entryPoint}` : null)
}

const LOADING_LINES = [
  "The Game Master arranges the miniatures…",
  "Painting the terrain…",
  "Setting the scene by candlelight…",
  "Consulting the battle notes…",
  "Placing the last tree just so…",
]

function LoadingCard() {
  const [lineIndex, setLineIndex] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setLineIndex((i) => (i + 1) % LOADING_LINES.length), 2500)
    return () => clearInterval(interval)
  }, [])
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <D20Icon className="h-12 w-12 animate-pulse text-amber-400" />
      <p className="font-display text-lg text-stone-300">{LOADING_LINES[lineIndex]}</p>
      <p className="text-xs text-stone-500">Staging this turn&apos;s tabletop for the first time can take a moment</p>
    </div>
  )
}

function D20Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden>
      <path d="M12 2 3 7.5v9L12 22l9-5.5v-9L12 2Z" />
      <path d="M12 2v7.5m0 0L3 7.5m9 2 9-2m-9 2V22" />
    </svg>
  )
}

function MapGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

type PanelState = { status: "loading" } | { status: "ready"; scene: EncounterScene3D } | { status: "error"; message: string }

/** Public URL where a turn's scene snapshot lives once someone has viewed it. */
export function getScenePreviewUrl(adventureId: string, turnId: string): string {
  return getImageUrl(`images/scene-previews/${adventureId}/${turnId}.jpg`)
}

/** Downscale the WebGL canvas to a small JPEG thumbnail. */
function captureCanvasThumbnail(container: HTMLElement | null): string | null {
  const canvas = container?.querySelector("canvas")
  if (!canvas || canvas.width === 0) return null
  const targetWidth = 640
  const scale = targetWidth / canvas.width
  const thumb = document.createElement("canvas")
  thumb.width = targetWidth
  thumb.height = Math.round(canvas.height * scale)
  const ctx = thumb.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return thumb.toDataURL("image/jpeg", 0.72)
}

function EncounterOverlay({
  encounterTitle,
  nextAdventure,
  map,
  mapTokens,
  mapTitle,
  onClose,
}: {
  encounterTitle?: string
  nextAdventure?: string
  map?: Encounter2DMap | null
  mapTokens?: MapTokens
  mapTitle?: string
  onClose: () => void
}) {
  const [state, setState] = useState<PanelState>({ status: "loading" })
  // Encounter (3D) vs Map (2D) toggle. Deliberately not persisted: the overlay
  // unmounts on close and remounts on turn advance, so every open starts in 3D.
  const [view, setView] = useState<"encounter" | "map">("encounter")
  const [standees, setStandees] = useState<Record<string, string>>({})
  const [standeesBack, setStandeesBack] = useState<Record<string, string>>({})
  const [minis3d, setMinis3d] = useState<Record<string, string>>({})
  const [minisPending, setMinisPending] = useState(false)
  const [insufficientTokens, setInsufficientTokens] = useState(false)
  // When the turn advances while the overlay is open, keep showing the previous
  // turn's scene while the next one stages instead of dropping to the loader.
  const [restaging, setRestaging] = useState(false)
  const turn = useTurn()
  const params = useParams<{ settingId?: string; adventurePlanId?: string; adventureId?: string }>()
  // Persisted like the overlay flag so the drawer survives turn advances.
  const [drawerOpen, setDrawerOpen] = usePersistedOpen(params?.adventureId ? `encounterDrawerOpen:${params.adventureId}` : null)

  const turnId = turn?.id
  const settingId = params?.settingId
  const adventurePlanId = params?.adventurePlanId
  const adventureId = params?.adventureId

  // Avatar-derived minis load in parallel with the scene spec; re-called on an
  // interval while 3D generation jobs are still running server-side. The
  // in-flight guard stops strict-mode double effects (and overlapping polls)
  // from firing concurrent charge-and-submit calls.
  const minisInFlight = useRef(false)
  const loadMinis = useCallback(async () => {
    if (!turnId || minisInFlight.current) return
    minisInFlight.current = true
    try {
      const result = await getOrGenerateCharacterMinis({ turnId })
      setStandees(result.minis)
      setStandeesBack(result.minisBack)
      setMinis3d(result.minis3d)
      setMinisPending(result.pending)
      setInsufficientTokens(result.insufficientTokens)
    } catch (error) {
      console.warn("[encounterview] minis fetch failed", error)
      setMinisPending(false)
    } finally {
      minisInFlight.current = false
    }
  }, [turnId])

  const loadScene = useCallback(async () => {
    if (!turnId || !settingId || !adventurePlanId || !adventureId) return

    void loadMinis()

    const cached = sceneCache.get(turnId)
    if (cached) {
      setState({ status: "ready", scene: cached })
      setRestaging(false)
      return
    }
    if (lastShownScene) {
      setRestaging(true)
    } else {
      setState({ status: "loading" })
    }
    try {
      const { scene } = await getOrGenerateEncounterScene({ settingId, adventurePlanId, adventureId, turnId })
      sceneCache.set(turnId, scene)
      setState({ status: "ready", scene })
    } catch (error) {
      console.error("[encounterview] scene generation failed", error)
      const message = error instanceof Error && error.message.includes("Insufficient tokens") ? "Not enough tokens to stage this scene." : "The Game Master knocked over the miniatures. Try again?"
      setState({ status: "error", message })
    } finally {
      setRestaging(false)
    }
  }, [turnId, settingId, adventurePlanId, adventureId, loadMinis])

  useEffect(() => {
    if (state.status === "ready") lastShownScene = state.scene
  }, [state])

  useEffect(() => {
    void loadScene()
  }, [loadScene])

  // Escape peels layers one at a time: drawer first, then the overlay.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (drawerOpen) setDrawerOpen(false)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, drawerOpen, setDrawerOpen])

  // Poll while 3D mini jobs are pending.
  useEffect(() => {
    if (!minisPending) return
    const interval = setInterval(() => void loadMinis(), MINIS_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [minisPending, loadMinis])

  // Once the scene has had a moment to render (models load inside Suspense),
  // capture a thumbnail for the rail card. Write-once server-side; fired once
  // per overlay mount.
  const sceneContainerRef = useRef<HTMLDivElement>(null)
  const snapshotSent = useRef(false)
  useEffect(() => {
    if (state.status !== "ready" || snapshotSent.current || !turnId) return
    const timeout = setTimeout(() => {
      const dataUrl = captureCanvasThumbnail(sceneContainerRef.current)
      if (!dataUrl) return
      snapshotSent.current = true
      void uploadScenePreview({ turnId, dataUrl }).catch((error) => console.warn("[encounterview] preview upload failed", error))
    }, 4000)
    return () => clearTimeout(timeout)
  }, [state.status, turnId])

  if (!turn) return null

  // Portal to <body> so the fullscreen overlay escapes any ancestor stacking
  // context (the right rail is position:sticky).
  // The scene shown this frame: the ready scene, or the previous turn's scene
  // while the next one restages.
  const visibleScene = state.status === "ready" ? state.scene : restaging ? lastShownScene : null

  // z-[60] clears the turn page's fixed z-50 chrome (floating buttons, storyview
  // bar); the turn modal sits above at z-[70], storyview's overlay above all at z-[100].
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <header className="relative flex flex-none items-center justify-center px-5 py-5">
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
        <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
          <Parchment />
          <span style={textShadow}>{view === "map" ? mapTitle || encounterTitle || "Encounter Map" : encounterTitle || "Encounter"}</span>
        </h2>
        {/* Encounter/Map segmented toggle — mirrors the Close pill on the right.
            Only rendered when the encounter has a stored 2D map. */}
        {map && (
          <div className="absolute left-10 top-1/2 z-[11] inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-stone-600 bg-black p-1">
            <button
              type="button"
              onClick={() => setView("encounter")}
              aria-pressed={view === "encounter"}
              aria-label="Show 3D encounter view"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-sm transition-colors",
                view === "encounter" ? "bg-stone-800 text-amber-200" : "text-stone-400 hover:text-stone-200"
              )}
            >
              <D20Icon className="h-4 w-4" />
              {/* Labels only at xl — below that the centered title plaque can
                  collide with the toggle, so the segments go icon-only. */}
              <span className="hidden xl:inline">Encounter</span>
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              aria-pressed={view === "map"}
              aria-label="Show 2D map view"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-sm transition-colors",
                view === "map" ? "bg-stone-800 text-amber-200" : "text-stone-400 hover:text-stone-200"
              )}
            >
              <MapGlyph className="h-4 w-4" />
              <span className="hidden xl:inline">Map</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-10 top-1/2 inline-flex -translate-y-1/2 items-center gap-3 rounded-full border border-stone-600 bg-black px-5 py-2 font-display text-lg text-stone-200 hover:border-amber-500 hover:text-amber-200"
          aria-label="Close encounter view"
        >
          Close
          <span aria-hidden>✕</span>
        </button>
      </header>

      {/* Scene + strip on the left; the turn drawer slides in on the right and
          the scene re-centers in the remaining width (the canvas tracks its
          container size). */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Both views live in the same slot. The 3D layer stays mounted and is
              hidden with visibility (not display:none, which would collapse the
              canvas to 0 and break the delayed thumbnail capture; not unmount,
              which would re-run GLTF Suspense on every toggle back). The WebGL
              frameloop keeps ticking while hidden — acceptable for a deliberate
              toggle. */}
          <div className="relative min-h-0 flex-1" ref={sceneContainerRef}>
            <div className={cn("absolute inset-0", view === "map" && map && "invisible")}>
              {visibleScene ? (
                <EncounterScene scene={visibleScene} characters={turn.characters} standees={standees} standeesBack={standeesBack} minis3d={minis3d} />
              ) : (
                <div className="flex h-full items-center justify-center px-6">
                  {state.status === "error" ? (
                    <div className="flex flex-col items-center gap-4 text-center">
                      <p className="font-display text-lg text-stone-300">{state.message}</p>
                      <Button onClick={() => void loadScene()} className="bg-[#15353d] ring-4 ring-[#24565f] hover:bg-[#15353d]">
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <LoadingCard />
                  )}
                </div>
              )}
            </div>
            {map && (
              <div className={cn("absolute inset-0 flex items-center justify-center p-4", view !== "map" && "invisible")}>
                <EncounterMap2D map={map} tokens={mapTokens} fit className="max-h-full" />
              </div>
            )}
          </div>

          {/* 3D miniatures upgrade in silently while minisPending drives the poll
              loop above — no status line; the standee already reads as a finished
              mini. The strip stays up even while the scene loads or errors so the
              game remains playable regardless of the diorama's state — but hides
              while the drawer is open, which supersedes it. */}
          {!drawerOpen && (
            <EncounterTurnStrip
              sceneSummary={view === "map" && map?.summary ? map.summary : state.status === "ready" ? state.scene.summary : undefined}
              insufficientTokens={insufficientTokens}
              restaging={restaging}
              onOpenTurn={() => setDrawerOpen(true)}
            />
          )}
        </div>
        <EncounterTurnDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} nextAdventure={nextAdventure} />
      </div>
    </div>,
    document.body
  )
}

/** Floating "Encounter Map" button — the below-xl entry point. */
export function EncounterPanel({
  encounterTitle,
  nextAdventure,
  map,
  mapTokens,
  mapTitle,
}: {
  encounterTitle?: string
  nextAdventure?: string
  map?: Encounter2DMap | null
  mapTokens?: MapTokens
  mapTitle?: string
}) {
  const params = useParams<{ adventureId?: string }>()
  const [open, setOpen] = useOverlayOpen(params?.adventureId, "floating")
  const turn = useTurn()
  if (!turn) return null

  return (
    <>
      {/* Muted teal at the same value/saturation as Game Chat's indigo, so the
          two buttons read as equal priority. */}
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#15353d] ring-4 ring-[#24565f] hover:bg-[#15353d] hover:scale-105 transition-all duration-300" aria-label="Open encounter map">
        <D20Icon className="mr-1 h-4 w-4" />
        Encounter Map
      </Button>
      {open && <EncounterOverlay encounterTitle={encounterTitle} nextAdventure={nextAdventure} map={map} mapTokens={mapTokens} mapTitle={mapTitle} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Right-rail card — the desktop entry point, docked with the chat. */
export function EncounterRailPanel({
  encounterTitle,
  encounterImage,
  nextAdventure,
  map,
  mapTokens,
  mapTitle,
  className,
}: {
  encounterTitle?: string
  encounterImage?: string
  nextAdventure?: string
  map?: Encounter2DMap | null
  mapTokens?: MapTokens
  mapTitle?: string
  className?: string
}) {
  const turn = useTurn()
  const params = useParams<{ adventureId?: string }>()
  const [open, setOpen] = useOverlayOpen(params?.adventureId, "rail")

  // Preview fallback chain: real scene snapshot (exists once anyone has viewed
  // this turn's tabletop) -> encounter art -> icon-only card.
  const sceneSrc = turn && params?.adventureId ? getScenePreviewUrl(params.adventureId, turn.id) : null
  const artSrc = encounterImage ? getImageUrl(encounterImage) : null
  const [previewSrc, setPreviewSrc] = useState<string | null | undefined>(undefined)
  const turnId = turn?.id
  useEffect(() => {
    setPreviewSrc(sceneSrc ?? artSrc ?? null)
    // Reset the chain when navigating between turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId])

  // The 2D map half renders only after mount: its procedural foliage advances a
  // shared PRNG during render, which isn't hydration-stable, so we skip SSR and
  // hold its half with a placeholder background instead.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!turn) return null

  // The 3D half of the split preview (or the full-width preview when there's no
  // 2D map): snapshot/art image, else the icon block.
  const scenePreview = previewSrc ? (
    <NativeImage
      src={previewSrc}
      alt=""
      className="h-full w-full object-cover transition-[filter,transform] duration-300 group-hover:scale-[1.02] group-hover:brightness-110"
      onError={() => setPreviewSrc(previewSrc === sceneSrc && artSrc ? artSrc : null)}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#101c20] via-[#0c1417] to-[#080c0e]">
      <D20Icon className="h-9 w-9 text-teal-400/80 transition-colors group-hover:text-teal-300" />
    </div>
  )

  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-teal-300">Encounter Map</h3>
          <button type="button" onClick={() => setOpen(true)} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-teal-200" aria-label="Open encounter map">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-pointer text-left" aria-label="Open encounter map">
          <div className="relative aspect-video w-full overflow-hidden bg-[#0c1417]">
            {map ? (
              // Split preview: 2D map on the left, 3D scene on the right. Purely
              // visual — the whole card is one click target into the 3D view.
              <div className="flex h-full w-full">
                <div className="relative h-full w-1/2 overflow-hidden bg-[#241f18]">
                  {mounted && (
                    // Center-crop: render the 16:9 map at the half's full height
                    // and crop horizontally, keeping tokens/terrain legible.
                    <div className="absolute inset-y-0 left-1/2 aspect-video h-full -translate-x-1/2">
                      <EncounterMap2D map={map} tokens={mapTokens} fit className="transition-[filter] duration-300 group-hover:brightness-110" />
                    </div>
                  )}
                </div>
                <div className="h-full w-1/2 overflow-hidden border-l border-black/60">{scenePreview}</div>
              </div>
            ) : (
              scenePreview
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2">
              <D20Icon className="h-5 w-5 flex-none text-teal-300/90" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold text-stone-100">{(map && mapTitle) || encounterTitle || "This turn's tabletop"}</p>
                <p className="text-[11px] text-stone-300/80">{map ? "View the 3D scene and 2D map" : "View the scene in 3D miniatures"}</p>
              </div>
            </div>
          </div>
        </button>
      </div>
      {open && <EncounterOverlay encounterTitle={encounterTitle} nextAdventure={nextAdventure} map={map} mapTokens={mapTokens} mapTitle={mapTitle} onClose={() => setOpen(false)} />}
    </>
  )
}
