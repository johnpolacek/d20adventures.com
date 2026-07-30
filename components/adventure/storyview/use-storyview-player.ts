"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { parseNarrative, type NarrativePart } from "@/lib/utils/parse-narrative"
import type { StoryviewAutoStatus, TurnAudioManifestResponse, TurnAudioSegmentWithUrl } from "@/types/turn-audio"

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

export type StoryviewSlide =
  | { type: "paragraph"; partIndex: number; segments: TurnAudioSegmentWithUrl[] }
  | { type: "diceroll"; partIndex: number; part: Extract<NarrativePart, { type: "diceroll" }> }

export type StoryviewStatus = "loading" | "generating" | "ready" | "error" | "insufficient-tokens"

interface UseStoryviewPlayerArgs {
  turnId: string
  narrative: string
  open: boolean
  onGenerated?: () => void
}

export function useStoryviewPlayer({ turnId, narrative, open, onGenerated }: UseStoryviewPlayerArgs) {
  const [status, setStatus] = useState<StoryviewStatus>("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [storyviewAuto, setStoryviewAuto] = useState<StoryviewAutoStatus | undefined>(undefined)
  const [segments, setSegments] = useState<TurnAudioSegmentWithUrl[]>([])
  const [slideIndex, setSlideIndex] = useState(0)
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const [speed, setSpeed] = useState(loadStoredSpeed)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const diceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortedRef = useRef(false)

  const slides = useMemo<StoryviewSlide[]>(() => {
    if (segments.length === 0) return []
    const parts = parseNarrative(narrative)
    const byPart = new Map<number, TurnAudioSegmentWithUrl[]>()
    for (const segment of segments) {
      const list = byPart.get(segment.partIndex) ?? []
      list.push(segment)
      byPart.set(segment.partIndex, list)
    }
    const result: StoryviewSlide[] = []
    parts.forEach((part, partIndex) => {
      if (part.type === "diceroll") {
        result.push({ type: "diceroll", partIndex, part })
      } else if (part.type === "paragraph") {
        const partSegments = byPart.get(partIndex)
        if (partSegments && partSegments.length > 0) {
          result.push({ type: "paragraph", partIndex, segments: partSegments })
        }
      }
      // original-reply parts are not narrated
    })
    return result
  }, [narrative, segments])

  const clearTimers = useCallback(() => {
    if (diceTimerRef.current) {
      clearTimeout(diceTimerRef.current)
      diceTimerRef.current = null
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute("src")
    }
  }, [])

  const applyManifest = useCallback((manifest: TurnAudioManifestResponse) => {
    if (manifest.storyviewAuto) setStoryviewAuto(manifest.storyviewAuto)
    if (manifest.status === "ready" && manifest.segments && manifest.segments.length > 0) {
      setSegments(manifest.segments)
      setStatus("ready")
      return true
    }
    return false
  }, [])

  // Fetch (and generate if needed) the manifest while the overlay is open.
  useEffect(() => {
    if (!open) return
    abortedRef.current = false
    setStatus("loading")
    setErrorMessage(null)
    setSegments([])
    setSlideIndex(0)
    setSegmentIndex(0)
    setPlaying(false)
    setFinished(false)

    const poll = async () => {
      if (abortedRef.current) return
      try {
        const response = await fetch(`/api/adventure/turn-audio/${turnId}`)
        const manifest = (await response.json()) as TurnAudioManifestResponse
        if (abortedRef.current) return
        if (applyManifest(manifest)) return
        if (manifest.status === "error") {
          setStatus("error")
          setErrorMessage(manifest.error ?? "Narration generation failed.")
          return
        }
        pollTimerRef.current = setTimeout(poll, GENERATION_POLL_MS)
      } catch {
        if (!abortedRef.current) {
          setStatus("error")
          setErrorMessage("Could not load narration.")
        }
      }
    }

    const start = async () => {
      try {
        const response = await fetch(`/api/adventure/turn-audio/${turnId}`)
        const manifest = (await response.json()) as TurnAudioManifestResponse
        if (abortedRef.current) return

        if (!manifest.stale && applyManifest(manifest)) return
        if (!manifest.stale && manifest.status === "generating") {
          setStatus("generating")
          pollTimerRef.current = setTimeout(poll, GENERATION_POLL_MS)
          return
        }

        // No audio yet (or narrative changed since it was made): generate.
        setStatus("generating")
        const postResponse = await fetch(`/api/adventure/turn-audio/${turnId}`, { method: "POST" })
        const postManifest = (await postResponse.json()) as TurnAudioManifestResponse & { error?: string }
        if (abortedRef.current) return

        if (postResponse.status === 402) {
          setStatus("insufficient-tokens")
          setErrorMessage(postManifest.error ?? "Not enough tokens for narration.")
          return
        }
        if (!postResponse.ok) {
          setStatus("error")
          setErrorMessage(postManifest.error ?? "Narration generation failed.")
          return
        }
        if (applyManifest(postManifest)) {
          onGenerated?.()
          return
        }
        // Lost the generation claim to another player: poll until ready.
        pollTimerRef.current = setTimeout(poll, GENERATION_POLL_MS)
      } catch {
        if (!abortedRef.current) {
          setStatus("error")
          setErrorMessage("Could not load narration.")
        }
      }
    }

    start()

    return () => {
      abortedRef.current = true
      clearTimers()
      stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, turnId])

  const currentSlide = slides[slideIndex] ?? null

  const advance = useCallback(() => {
    const slide = slides[slideIndex]
    if (!slide) return
    if (slide.type === "paragraph" && segmentIndex < slide.segments.length - 1) {
      setSegmentIndex(segmentIndex + 1)
      return
    }
    if (slideIndex < slides.length - 1) {
      setSlideIndex(slideIndex + 1)
      setSegmentIndex(0)
      return
    }
    setPlaying(false)
    setFinished(true)
  }, [slides, slideIndex, segmentIndex])

  // Drive playback: play the current segment's audio, or dwell on dice slides.
  useEffect(() => {
    clearTimers()
    if (!playing || !currentSlide) return

    if (currentSlide.type === "diceroll") {
      stopAudio()
      diceTimerRef.current = setTimeout(advance, DICE_SLIDE_DWELL_MS / speed)
      return
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
      setPlaying(false)
    })

    // Preload the next segment in the background.
    const nextSegment = currentSlide.segments[segmentIndex + 1] ?? (slides[slideIndex + 1]?.type === "paragraph" ? (slides[slideIndex + 1] as Extract<StoryviewSlide, { type: "paragraph" }>).segments[0] : undefined)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentSlide, segmentIndex, advance])

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
    if (finished) {
      setSlideIndex(0)
      setSegmentIndex(0)
      setFinished(false)
    }
    setPlaying(true)
  }, [finished])

  const pause = useCallback(() => {
    setPlaying(false)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slides.length) return
      stopAudio()
      setSlideIndex(index)
      setSegmentIndex(0)
      setFinished(false)
    },
    [slides.length, stopAudio]
  )

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
