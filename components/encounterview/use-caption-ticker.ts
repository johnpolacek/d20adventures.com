"use client"

// Subtitle-style caption feed for the encounter view's bottom strip: watches the
// turn's accumulated narrative and surfaces newly appended paragraphs and dice
// results one at a time. History is never replayed — on mount the current part
// count becomes the baseline, so only narrative that arrives while the player
// is watching the diorama gets narrated.

import { useEffect, useRef, useState } from "react"
import { type NarrativePart, parseNarrative } from "@/lib/utils/parse-narrative"
import type { Turn } from "@/types/adventure"

const PARAGRAPH_MS = 6000
const DICE_MS = 4000
// Cap the backlog so a burst of narrative doesn't leave the ticker minutes behind.
const MAX_QUEUE = 4

export function useCaptionTicker(turn: Turn | null): NarrativePart | null {
  const [queue, setQueue] = useState<NarrativePart[]>([])
  const turnIdRef = useRef<string | null>(null)
  const lastPartCountRef = useRef(0)

  useEffect(() => {
    if (!turn) return
    const parts = parseNarrative(turn.narrative || "")

    if (turnIdRef.current === null) {
      turnIdRef.current = turn.id
      lastPartCountRef.current = parts.length
      return
    }

    if (turnIdRef.current !== turn.id) {
      // A new turn arrived while watching: narrate its opening paragraph so the
      // scene transition explains itself, then baseline on the new narrative.
      turnIdRef.current = turn.id
      lastPartCountRef.current = parts.length
      const opening = parts.find((p) => p.type === "paragraph")
      setQueue(opening ? [opening] : [])
      return
    }

    if (parts.length > lastPartCountRef.current) {
      const fresh = parts.slice(lastPartCountRef.current).filter((p) => p.type !== "original-reply")
      lastPartCountRef.current = parts.length
      if (fresh.length > 0) {
        setQueue((q) => [...q, ...fresh].slice(-MAX_QUEUE))
      }
    }
  }, [turn])

  // Dwell on the head caption, then shift. Keyed on the head part itself so
  // appends to the tail don't restart the timer.
  const head = queue[0] ?? null
  useEffect(() => {
    if (!head) return
    const timeout = setTimeout(() => setQueue((q) => q.slice(1)), head.type === "diceroll" ? DICE_MS : PARAGRAPH_MS)
    return () => clearTimeout(timeout)
  }, [head])

  return head
}

export function formatCaptionPart(part: NarrativePart): string {
  if (part.type === "diceroll") {
    return `${part.character} rolls ${part.rollType}: ${part.result} vs DC ${part.difficulty} — ${part.success ? "Success" : "Failure"}`
  }
  return part.type === "paragraph" ? part.value : ""
}
