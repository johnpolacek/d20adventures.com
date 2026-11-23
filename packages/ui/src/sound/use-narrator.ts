"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { type NarratorVoice, narratorReady, narratorVoice, onNarratorChange, prepareNarration, speak, warmNarrator } from "./narrator"

export function useNarratorVoice(): NarratorVoice | null {
  return useSyncExternalStore(onNarratorChange, narratorVoice, () => null)
}

export type NarratorStatus = "off" | "waiting" | "speaking" | "done"
export type Narrated = { status: NarratorStatus; sentence: number }

// Reads the paragraph on screen aloud, and readies the next one. "waiting" until its first words are heard, as a
// sentence can take a moment to make, then "speaking" with the sentence being heard, by its place in sentences(text),
// and "done" once they all have. "off" when nothing is read: the narrator is off, there is no sound, or the voice is
// still loading, in which case reading starts with the first paragraph after it has.
export function useNarrator({ key, text, next, on }: { key: string; text: string | undefined; next?: string; on: boolean }): Narrated {
  const voice = useNarratorVoice()
  const [heard, setHeard] = useState<{ key: string } & Narrated>({ key: "", status: "off", sentence: -1 })
  const nextRef = useRef(next)
  nextRef.current = next

  useEffect(() => {
    if (voice) warmNarrator()
  }, [voice])

  useEffect(() => {
    if (!on || !voice || !text || !narratorReady()) {
      setHeard({ key, status: "off", sentence: -1 })
      return
    }
    let live = true
    const reading = speak(text, voice, (sentence) => live && setHeard({ key, status: "speaking", sentence }))
    if (!reading) {
      setHeard({ key, status: "off", sentence: -1 })
      return
    }
    setHeard({ key, status: "waiting", sentence: -1 })
    if (nextRef.current) prepareNarration(nextRef.current, voice)
    void reading.done.then((heard) => live && setHeard({ key, status: heard ? "done" : "off", sentence: -1 }))
    return () => {
      live = false
      reading.stop()
    }
  }, [key, text, on, voice])

  if (heard.key === key) return { status: heard.status, sentence: heard.sentence }
  // A new paragraph, before the effect above has started reading it: waiting, so nothing is shown ahead of the words.
  return { status: on && voice && text && narratorReady() ? "waiting" : "off", sentence: -1 }
}
