"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { type NarratorVoice, type Speaking, type Spoken, narratorReady, narratorVoice, onNarratorChange, prepareNarration, speak, warmNarrator } from "./narrator"

export function useNarratorVoice(): NarratorVoice | null {
  return useSyncExternalStore(onNarratorChange, narratorVoice, () => null)
}

export type NarratorStatus = "off" | "waiting" | "speaking" | "done"
export type Narrated = { status: NarratorStatus; sentence: number }
// How much of the paragraph on screen has been heard, 0 to 1.
export type Heard = Narrated & { progress: () => number }

// Reads the paragraph on screen aloud, and readies the next one. "waiting" until its first words are heard, as a
// sentence can take a moment to make, then "speaking" with the sentence being heard, by its place in sentences(text),
// and "done" once they all have. "off" when nothing is read: the narrator is off, there is no sound, or the voice is
// still loading, in which case reading starts with the first paragraph after it has. `speaker` and `nextSpeaker` are the
// genders of whoever is quoted in each, whose words are said in a voice for them. `paused` holds the words where they
// are, and they go on from there once it is let go.
export function useNarrator({ key, text, next, on, speaker, nextSpeaker, paused = false }: { key: string; text: string | undefined; next?: string; on: boolean; speaker?: Spoken; nextSpeaker?: Spoken; paused?: boolean }): Heard {
  const voice = useNarratorVoice()
  const [heard, setHeard] = useState<{ key: string } & Narrated>({ key: "", status: "off", sentence: -1 })
  const nextRef = useRef({ next, nextSpeaker })
  nextRef.current = { next, nextSpeaker }
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const reading = useRef<{ key: string; speaking: Speaking } | null>(null)
  const keyRef = useRef(key)
  keyRef.current = key
  const [progress] = useState(() => () => (reading.current?.key === keyRef.current ? reading.current.speaking.progress() : 0))

  useEffect(() => {
    if (voice) warmNarrator()
  }, [voice])

  useEffect(() => {
    if (!on || !voice || !text || !narratorReady()) {
      setHeard({ key, status: "off", sentence: -1 })
      return
    }
    let live = true
    const speaking = speak(text, voice, (sentence) => live && setHeard({ key, status: "speaking", sentence }), speaker)
    if (!speaking) {
      setHeard({ key, status: "off", sentence: -1 })
      return
    }
    reading.current = { key, speaking }
    if (pausedRef.current) speaking.pause()
    setHeard({ key, status: "waiting", sentence: -1 })
    if (nextRef.current.next) prepareNarration(nextRef.current.next, voice, nextRef.current.nextSpeaker)
    void speaking.done.then((heard) => live && setHeard({ key, status: heard ? "done" : "off", sentence: -1 }))
    return () => {
      live = false
      speaking.stop()
      if (reading.current?.speaking === speaking) reading.current = null
    }
  }, [key, text, on, voice, speaker])

  useEffect(() => {
    if (paused) reading.current?.speaking.pause()
    else reading.current?.speaking.resume()
  }, [paused])

  if (heard.key === key) return { status: heard.status, sentence: heard.sentence, progress }
  // A new paragraph, before the effect above has started reading it: waiting, so nothing is shown ahead of the words.
  return { status: on && voice && text && narratorReady() ? "waiting" : "off", sentence: -1, progress }
}
