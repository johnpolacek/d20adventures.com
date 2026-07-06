"use client"

// Player-facing Encounter view entry points, mirroring the Mapview pair:
// EncounterPanel is the floating "Encounter" button (below xl), EncounterRailPanel
// is the card docked in the turn page's right rail (desktop). Both open the same
// fullscreen 3D miniatures overlay, staged per turn from the narrative by the
// server action and cached in S3.

import { Maximize2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getOrGenerateCharacterMinis } from "@/app/_actions/generate-character-mini"
import { getOrGenerateEncounterScene } from "@/app/_actions/generate-encounter-scene"
import { uploadScenePreview } from "@/app/_actions/scene-preview"
import Parchment from "@/components/graphics/background/Parchment"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import NativeImage from "@/components/ui/native-image"
import { useTurn } from "@/lib/context/TurnContext"
import { cn, getImageUrl } from "@/lib/utils"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"

// Keep three.js out of the turn-page bundle until the overlay first opens.
const EncounterScene = dynamic(() => import("./encounter-scene"), { ssr: false })

const MINIS_POLL_INTERVAL_MS = 10000

// Session-level caches shared by both entry points and across open/close cycles.
const sceneCache = new Map<string, EncounterScene3D>()

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

function EncounterOverlay({ encounterTitle, onClose }: { encounterTitle?: string; onClose: () => void }) {
  const [state, setState] = useState<PanelState>({ status: "loading" })
  const [standees, setStandees] = useState<Record<string, string>>({})
  const [minis3d, setMinis3d] = useState<Record<string, string>>({})
  const [minisPending, setMinisPending] = useState(false)
  const [insufficientTokens, setInsufficientTokens] = useState(false)
  const turn = useTurn()
  const params = useParams<{ settingId?: string; adventurePlanId?: string; adventureId?: string }>()

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
      return
    }
    setState({ status: "loading" })
    try {
      const { scene } = await getOrGenerateEncounterScene({ settingId, adventurePlanId, adventureId, turnId })
      sceneCache.set(turnId, scene)
      setState({ status: "ready", scene })
    } catch (error) {
      console.error("[encounterview] scene generation failed", error)
      const message = error instanceof Error && error.message.includes("Insufficient tokens") ? "Not enough tokens to stage this scene." : "The Game Master knocked over the miniatures. Try again?"
      setState({ status: "error", message })
    }
  }, [turnId, settingId, adventurePlanId, adventureId, loadMinis])

  useEffect(() => {
    void loadScene()
  }, [loadScene])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
      <header className="relative flex flex-none items-center justify-center px-5 py-5">
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
        <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
          <Parchment />
          <span style={textShadow}>{encounterTitle || "Encounter"}</span>
        </h2>
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

      <div className="relative min-h-0 flex-1" ref={sceneContainerRef}>
        {state.status === "ready" ? (
          <EncounterScene scene={state.scene} characters={turn.characters} standees={standees} minis3d={minis3d} />
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

      {state.status === "ready" && (state.scene.summary || minisPending || insufficientTokens) && (
        <div className="flex-none px-5 py-3 text-center">
          {state.scene.summary && <p className="text-sm italic text-stone-400">{state.scene.summary}</p>}
          {minisPending && <p className="mt-1 text-xs text-teal-400/80">Sculpting 3D miniatures… they&apos;ll appear here when painted.</p>}
          {insufficientTokens && <p className="mt-1 text-xs text-amber-500/90">Not enough tokens to generate some miniatures.</p>}
        </div>
      )}
    </div>,
    document.body
  )
}

/** Floating "Encounter" button — the below-xl entry point. */
export function EncounterPanel({ encounterTitle }: { encounterTitle?: string }) {
  const [open, setOpen] = useState(false)
  const turn = useTurn()
  if (!turn) return null

  return (
    <>
      {/* Muted teal at the same value/saturation as the Map amber and Game Chat
          indigo, so the three buttons read as equal priority. */}
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#15353d] ring-4 ring-[#24565f] hover:bg-[#15353d] hover:scale-105 transition-all duration-300" aria-label="Open 3D encounter view">
        <D20Icon className="mr-1 h-4 w-4" />
        Encounter
      </Button>
      {open && <EncounterOverlay encounterTitle={encounterTitle} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Right-rail card — the desktop entry point, docked with the mini map and chat. */
export function EncounterRailPanel({ encounterTitle, encounterImage, className }: { encounterTitle?: string; encounterImage?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const turn = useTurn()
  const params = useParams<{ adventureId?: string }>()

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

  if (!turn) return null

  return (
    <>
      <div className={cn("overflow-hidden rounded-xl bg-black/40 ring ring-primary-700", className)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h3 className="truncate font-display text-sm font-bold text-teal-300">Encounter Map</h3>
          <button type="button" onClick={() => setOpen(true)} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-teal-200" aria-label="Open 3D encounter view">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-pointer text-left" aria-label="Open 3D encounter view">
          {previewSrc ? (
            <div className="relative aspect-video w-full overflow-hidden bg-[#0c1417]">
              <NativeImage
                src={previewSrc}
                alt=""
                className="h-full w-full object-cover transition-[filter,transform] duration-300 group-hover:scale-[1.02] group-hover:brightness-110"
                onError={() => setPreviewSrc(previewSrc === sceneSrc && artSrc ? artSrc : null)}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2">
                <D20Icon className="h-5 w-5 flex-none text-teal-300/90" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-stone-100">{encounterTitle || "This turn's tabletop"}</p>
                  <p className="text-[11px] text-stone-300/80">View the scene in 3D miniatures</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-b from-[#101c20] via-[#0c1417] to-[#080c0e] px-3 py-4">
              <div className="flex items-center gap-3">
                <D20Icon className="h-9 w-9 flex-none text-teal-400/80 transition-colors group-hover:text-teal-300" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-stone-200 transition-colors group-hover:text-teal-100">{encounterTitle || "This turn's tabletop"}</p>
                  <p className="text-xs text-stone-400">View the scene in 3D miniatures</p>
                </div>
              </div>
            </div>
          )}
        </button>
      </div>
      {open && <EncounterOverlay encounterTitle={encounterTitle} onClose={() => setOpen(false)} />}
    </>
  )
}
