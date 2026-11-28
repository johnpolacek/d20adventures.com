"use client"

import type { FeatureBeat, RollBeat, StoryBeat } from "@d20/gm-core/story/beats"
import { storyParagraphs } from "@d20/gm-core/story/render"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { TurnAudioManifestResponse, TurnAudioSegmentWithUrl } from "@/types/turn-audio"
import { MAX_POLL_ATTEMPTS, storyviewReducer } from "./storyview-machine"

const GENERATION_POLL_MS = 2000
const DICE_SLIDE_DWELL_MS = 4000
const SPEED_STEPS = [1, 1.25, 1.5, 2]
const DEFAULT_SPEED = 1.25
const SPEED_STORAGE_KEY = "storyview-speed"

function loadStoredSpeed(): number {
  if (typeof window === "undefined") return DEFAULT_SPEED
  const stored = Number(window.localStorage.getItem(SPEED_STORAGE_KEY))
  return SPEED_STEPS.includes(stored) ? stored : DEFAULT_SPEED
}

// A class feature used is not narrated: it shows as an entry of its own, like a roll.
export type StoryviewSlide =
  | { type: "paragraph"; partIndex: number; segments: TurnAudioSegmentWithUrl[] }
  | { type: "diceroll"; partIndex: number; part: RollBeat }
  | { type: "feature"; partIndex: number; part: FeatureBeat }

export type StoryviewStatus = "loading" | "generating" | "ready" | "error" | "insufficient-tokens"

interface UseStoryviewPlayerArgs {
  turnId: string
  story: StoryBeat[]
  open: boolean
  onGenerated?: () => void
}

export function useStoryviewPlayer({ turnId, story, open, onGenerated }: UseStoryviewPlayerArgs) {
  const [state, dispatch] = useReducer(storyviewReducer, { kind: "closed" })
  const [speed, setSpeed] = useState(loadStoredSpeed)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onGeneratedRef = useRef(onGenerated)
  onGeneratedRef.current = onGenerated

  const segments = state.kind === "ready" ? state.segments : []

  const slides = useMemo<StoryviewSlide[]>(() => {
    if (segments.length === 0) return []
    const parts = storyParagraphs(story)
    const byPart = new Map<number, TurnAudioSegmentWithUrl[]>()
    for (const segment of segments) {
      const list = byPart.get(segment.partIndex) ?? []
      list.push(segment)
      byPart.set(segment.partIndex, list)
    }
    const result: StoryviewSlide[] = []
    parts.forEach(({ beats }, partIndex) => {
      const part = beats[0]
      if (part.kind === "roll") {
        result.push({ type: "diceroll", partIndex, part })
      } else if (part.kind === "feature") {
        result.push({ type: "feature", partIndex, part })
      } else if (part.kind !== "reply") {
        const partSegments = byPart.get(partIndex)
        if (partSegments && partSegments.length > 0) {
          result.push({ type: "paragraph", partIndex, segments: partSegments })
        }
      }
      // the players' own words are not narrated
    })
    return result
  }, [story, segments])

  const slideSegmentCounts = useMemo(() => slides.map((s) => (s.type === "paragraph" ? s.segments.length : 0)), [slides])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.removeAttribute("src")
    }
  }, [])

  // Isolated manifest fetch / bounded generation poll effect (owns its own AbortController + poll timer).
  useEffect(() => {
    if (!open) {
      dispatch({ type: "CLOSE" })
      stopAudio()
      return
    }

    const controller = new AbortController()
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    dispatch({ type: "OPEN" })

    const applyReady = (manifest: TurnAudioManifestResponse): boolean => {
      if (manifest.status === "ready" && manifest.segments && manifest.segments.length > 0) {
        dispatch({ type: "MANIFEST_READY", segments: manifest.segments, storyviewAuto: manifest.storyviewAuto })
        return true
      }
      return false
    }

    const schedulePoll = () => {
      clearPoll()
      if (controller.signal.aborted) return
      pollTimer = setTimeout(poll, GENERATION_POLL_MS)
    }

    const poll = async () => {
      pollTimer = null
      if (controller.signal.aborted) return
      try {
        const response = await fetch(`/api/adventure/turn-audio/${turnId}`, { signal: controller.signal })
        const manifest = (await response.json()) as TurnAudioManifestResponse
        if (controller.signal.aborted) return
        if (applyReady(manifest)) return
        if (manifest.status === "error") {
          dispatch({
            type: "FAILED",
            code: "error",
            message: manifest.error ?? "Narration generation failed.",
            storyviewAuto: manifest.storyviewAuto,
          })
          return
        }
        attempts++
        dispatch({ type: "POLL_TICK", storyviewAuto: manifest.storyviewAuto })
        if (attempts < MAX_POLL_ATTEMPTS) schedulePoll()
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: "FAILED", code: "error", message: "Could not load narration." })
        }
      }
    }

    const start = async () => {
      try {
        const response = await fetch(`/api/adventure/turn-audio/${turnId}`, { signal: controller.signal })
        const manifest = (await response.json()) as TurnAudioManifestResponse
        if (controller.signal.aborted) return

        if (!manifest.stale && applyReady(manifest)) return
        if (!manifest.stale && manifest.status === "generating") {
          dispatch({ type: "GENERATING", storyviewAuto: manifest.storyviewAuto })
          schedulePoll()
          return
        }

        // No audio yet (or narrative changed since it was made): generate.
        dispatch({ type: "GENERATING", storyviewAuto: manifest.storyviewAuto })
        const postResponse = await fetch(`/api/adventure/turn-audio/${turnId}`, { method: "POST", signal: controller.signal })
        const postManifest = (await postResponse.json()) as TurnAudioManifestResponse & { error?: string }
        if (controller.signal.aborted) return

        if (postResponse.status === 402) {
          dispatch({
            type: "FAILED",
            code: "insufficient-tokens",
            message: postManifest.error ?? "Not enough tokens for narration.",
            storyviewAuto: postManifest.storyviewAuto,
          })
          return
        }
        if (!postResponse.ok) {
          dispatch({
            type: "FAILED",
            code: "error",
            message: postManifest.error ?? "Narration generation failed.",
            storyviewAuto: postManifest.storyviewAuto,
          })
          return
        }
        if (applyReady(postManifest)) {
          onGeneratedRef.current?.()
          return
        }
        // Lost the generation claim to another player: poll until ready.
        schedulePoll()
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: "FAILED", code: "error", message: "Could not load narration." })
        }
      }
    }

    void start()

    return () => {
      controller.abort()
      clearPoll()
      stopAudio()
    }
  }, [open, turnId, stopAudio])

  const slideIndex = state.kind === "ready" ? state.playback.slideIndex : 0
  const segmentIndex = state.kind === "ready" ? state.playback.segmentIndex : 0
  const playing = state.kind === "ready" && state.playback.kind === "playing"
  const finished = state.kind === "ready" && state.playback.kind === "finished"
  const currentSlide = slides[slideIndex] ?? null

  const advance = useCallback(() => {
    dispatch({ type: "ADVANCE", slideSegmentCounts })
  }, [slideSegmentCounts])

  // Isolated playback effect (owns ONLY the dice/feature dwell timer + HTMLAudioElement).
  useEffect(() => {
    if (!playing || !currentSlide) return

    if (currentSlide.type === "diceroll" || currentSlide.type === "feature") {
      stopAudio()
      const dwellTimer = setTimeout(advance, DICE_SLIDE_DWELL_MS / speed)
      return () => clearTimeout(dwellTimer)
    }

    const segment = currentSlide.segments[segmentIndex]
    if (!segment?.audioUrl) {
      advance()
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current
    audio.src = segment.audioUrl
    audio.playbackRate = speed
    audio.onended = advance
    audio.onerror = advance
    audio.play().catch(() => {
      // Autoplay rejection (e.g. tab lost its gesture unlock): surface as paused.
      dispatch({ type: "PAUSE" })
    })

    // Preload the next segment in the background.
    const nextSegment =
      currentSlide.segments[segmentIndex + 1] ?? (slides[slideIndex + 1]?.type === "paragraph" ? (slides[slideIndex + 1] as Extract<StoryviewSlide, { type: "paragraph" }>).segments[0] : undefined)
    if (nextSegment?.audioUrl) {
      const preload = new Audio()
      preload.preload = "auto"
      preload.src = nextSegment.audioUrl
    }

    return () => {
      audio.onended = null
      audio.onerror = null
      audio.pause()
    }
  }, [playing, currentSlide, segmentIndex, slideIndex, slides, speed, advance, stopAudio])

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEED_STEPS[(SPEED_STEPS.indexOf(current) + 1) % SPEED_STEPS.length]
      window.localStorage.setItem(SPEED_STORAGE_KEY, String(next))
      // Apply to the live element so the change is audible mid-segment.
      if (audioRef.current) audioRef.current.playbackRate = next
      return next
    })
  }, [])

  const play = useCallback(() => {
    dispatch({ type: "PLAY" })
  }, [])

  const pause = useCallback(() => {
    dispatch({ type: "PAUSE" })
    if (audioRef.current) audioRef.current.pause()
  }, [])

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slides.length) return
      stopAudio()
      dispatch({ type: "GO_TO_SLIDE", index, slideCount: slides.length })
    },
    [slides.length, stopAudio]
  )

  const status: StoryviewStatus =
    state.kind === "ready"
      ? "ready"
      : state.kind === "generating"
        ? "generating"
        : state.kind === "error"
          ? state.code
          : "loading"
  const errorMessage = state.kind === "error" ? state.message : null
  const storyviewAuto = state.kind === "closed" ? undefined : state.storyviewAuto

  return {
    status,
    errorMessage,
    storyviewAuto,
    slides,
    slideIndex,
    segmentIndex,
    currentSlide,
    playing,
    finished,
    speed,
    cycleSpeed,
    play,
    pause,
    next: () => goToSlide(slideIndex + 1),
    prev: () => goToSlide(slideIndex - 1),
  }
}
