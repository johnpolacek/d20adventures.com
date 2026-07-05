"use client"

// Player-facing Encounter panel: a floating "Encounter" toggle on the turn page that
// opens a fullscreen 3D miniatures view of the current turn, staged from the
// narrative by the server action (per-turn, cached in S3). Mirrors the Mapview
// panel (components/mapview/map-panel.tsx) so the two buttons read as siblings.

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { getOrGenerateCharacterMinis } from "@/app/_actions/generate-character-mini"
import { getOrGenerateEncounterScene } from "@/app/_actions/generate-encounter-scene"
import Parchment from "@/components/graphics/background/Parchment"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { useTurn } from "@/lib/context/TurnContext"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"

// Keep three.js out of the turn-page bundle until the panel first opens.
const EncounterScene = dynamic(() => import("./encounter-scene"), { ssr: false })

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
      <svg viewBox="0 0 24 24" className="h-12 w-12 animate-pulse text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden>
        <path d="M12 2 3 7.5v9L12 22l9-5.5v-9L12 2Z" />
        <path d="M12 2v7.5m0 0L3 7.5m9 2 9-2m-9 2V22" />
      </svg>
      <p className="font-display text-lg text-stone-300">{LOADING_LINES[lineIndex]}</p>
      <p className="text-xs text-stone-500">Staging this turn&apos;s tabletop for the first time can take a moment</p>
    </div>
  )
}

type PanelState = { status: "idle" } | { status: "loading" } | { status: "ready"; scene: EncounterScene3D } | { status: "error"; message: string }

export function EncounterPanel({ encounterTitle }: { encounterTitle?: string }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<PanelState>({ status: "idle" })
  const [standees, setStandees] = useState<Record<string, string>>({})
  const sceneCache = useRef(new Map<string, EncounterScene3D>())
  const standeeCache = useRef(new Map<string, Record<string, string>>())
  const turn = useTurn()
  const params = useParams<{ settingId?: string; adventurePlanId?: string; adventureId?: string }>()

  const turnId = turn?.id
  const settingId = params?.settingId
  const adventurePlanId = params?.adventurePlanId
  const adventureId = params?.adventureId

  const loadScene = useCallback(async () => {
    if (!turnId || !settingId || !adventurePlanId || !adventureId) return

    // Avatar-derived standee minis load in parallel with the scene spec; the
    // scene renders with fallback minis until they arrive.
    const cachedStandees = standeeCache.current.get(turnId)
    if (cachedStandees) {
      setStandees(cachedStandees)
    } else {
      setStandees({})
      void getOrGenerateCharacterMinis({ turnId })
        .then(({ minis }) => {
          standeeCache.current.set(turnId, minis)
          setStandees(minis)
        })
        .catch((error) => console.warn("[encounterview] standee fetch failed", error))
    }

    const cached = sceneCache.current.get(turnId)
    if (cached) {
      setState({ status: "ready", scene: cached })
      return
    }
    setState({ status: "loading" })
    try {
      const { scene } = await getOrGenerateEncounterScene({ settingId, adventurePlanId, adventureId, turnId })
      sceneCache.current.set(turnId, scene)
      setState({ status: "ready", scene })
    } catch (error) {
      console.error("[encounterview] scene generation failed", error)
      setState({ status: "error", message: "The Game Master knocked over the miniatures. Try again?" })
    }
  }, [turnId, settingId, adventurePlanId, adventureId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (open) void loadScene()
  }, [open, loadScene])

  if (!turn || !settingId || !adventurePlanId || !adventureId) return null

  return (
    <>
      {/* Muted teal at the same value/saturation as the Map amber and Game Chat
          indigo, so the three buttons read as equal priority. */}
      <Button size="sm" onClick={() => setOpen(true)} className="bg-[#15353d] ring-4 ring-[#24565f] hover:bg-[#15353d] hover:scale-105 transition-all duration-300" aria-label="Open 3D encounter view">
        <svg viewBox="0 0 24 24" className="mr-1 h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
          <path d="M12 2 3 7.5v9L12 22l9-5.5v-9L12 2Z" />
          <path d="M12 2v7.5m0 0L3 7.5m9 2 9-2m-9 2V22" />
        </svg>
        Encounter
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
          <header className="relative flex flex-none items-center justify-center px-5 py-5">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 bg-[url('/images/app/art/texture-line.png')] bg-blend-lighten opacity-50" />
            <h2 className="relative z-[11] rounded-sm border border-white/20 bg-gradient-to-t from-amber-950 via-amber-950 to-amber-800 px-6 py-1.5 text-center font-display text-lg font-bold contrast-[1.2] saturate-[.4] ring-4 ring-black sm:px-8 sm:py-2 sm:text-xl sm:ring-8">
              <Parchment />
              <span style={textShadow}>{encounterTitle || "Encounter"}</span>
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-10 top-1/2 inline-flex -translate-y-1/2 items-center gap-3 rounded-full border border-stone-600 bg-black px-5 py-2 font-display text-lg text-stone-200 hover:border-amber-500 hover:text-amber-200"
              aria-label="Close encounter view"
            >
              Close
              <span aria-hidden>✕</span>
            </button>
          </header>

          <div className="relative min-h-0 flex-1">
            {state.status === "ready" ? (
              <EncounterScene scene={state.scene} characters={turn.characters} standees={standees} />
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

          {state.status === "ready" && state.scene.summary && <p className="flex-none px-5 py-3 text-center text-sm italic text-stone-400">{state.scene.summary}</p>}
        </div>
      )}
    </>
  )
}
