"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { type NarratorVoice, narratorReady, narratorVoice, onNarratorChange, prepareNarration, speak, warmNarrator } from "./narrator"

export function useNarratorVoice(): NarratorVoice | null {
  return useSyncExternalStore(onNarratorChange, narratorVoice, () => null)
}

// Reads the paragraph on screen aloud, and readies the next one. "speaking" while the words play, "done" once they
// have, and "off" when nothing is read: the narrator is off, there is no sound, or the voice is still loading, in which
// case reading starts with the first paragraph after it has.
export function useNarrator({ key, text, next, on }: { key: string; text: string | undefined; next?: string; on: boolean }): "off" | "speaking" | "done" {
  const voice = useNarratorVoice()
  const [heard, setHeard] = useState<{ key: string; status: "off" | "speaking" | "done" }>({ key: "", status: "off" })
  const nextRef = useRef(next)
  nextRef.current = next

  useEffect(() => {
    if (voice) warmNarrator()
  }, [voice])

  useEffect(() => {
    if (!on || !voice || !text || !narratorReady()) {
      setHeard({ key, status: "off" })
      return
    }
    const reading = speak(text, voice)
    if (!reading) {
      setHeard({ key, status: "off" })
      return
    }
    setHeard({ key, status: "speaking" })
    if (nextRef.current) prepareNarration(nextRef.current, voice)
    let live = true
    void reading.done.then((heard) => live && setHeard({ key, status: heard ? "done" : "off" }))
    return () => {
      live = false
      reading.stop()
    }
  }, [key, text, on, voice])

  return heard.key === key ? heard.status : "off"
}
