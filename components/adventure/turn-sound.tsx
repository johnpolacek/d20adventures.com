"use client"

// The web game's sound: the scene's ambience, and the story read aloud as it is told. The voice is Kokoro on the
// player's graphics card (@d20/ui/sound/narrator-web.ts), a large download, so it is off until the player turns it on,
// and offered only where it runs fast enough. Ambience is the set's beds, as the stage plays them.

import { storyParagraphs } from "@d20/gm-core/story/render"
import type { AmbienceBed } from "@d20/stage"
import { SCENE_FILES, SETS } from "@d20/stage/sets"
import { setAmbience } from "@d20/ui/sound/ambience"
import { narratorAvailable, narratorReady, onNarratorChange, setNarratorDefault, setNarratorEngine, setNarratorNames, setNarratorVoice, spokenGender } from "@d20/ui/sound/narrator"
import { browserNarrator, onVoiceDownload, voiceDownload } from "@d20/ui/sound/narrator-web"
import { withCharacters } from "@d20/ui/sound/pronunciations"
import { onSoundSetting, setSoundOn, soundOn } from "@d20/ui/sound/settings"
import { useNarrator, useNarratorVoice } from "@d20/ui/sound/use-narrator"
import { Switch } from "@d20/ui/switch"
import { Tip } from "@d20/ui/tooltip"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { getPronunciations } from "@/app/_actions/pronunciations"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"

// Set as the page's code loads, before anything renders, so no voice is chosen or fetched until the player asks.
if (typeof window !== "undefined") {
  setNarratorDefault(null)
  const engine = browserNarrator()
  if (engine) setNarratorEngine(engine)
}

// How many of a turn's read-aloud paragraphs have been heard, kept so a reload does not read them again.
const heardKey = (turnId: string) => `d20.heard.${turnId}`
function heardOf(turnId: string) {
  try {
    return Number(localStorage.getItem(heardKey(turnId))) || 0
  } catch {
    return 0
  }
}
function markHeard(turnId: string, count: number) {
  try {
    localStorage.setItem(heardKey(turnId), String(count))
  } catch {}
}

const onSound = (listener: () => void) => onSoundSetting(() => listener())
const SKIPPED = new Set(["roll", "reply", "feature"])

export default function TurnSound() {
  const { currentTurn, disableSSE } = useTurnContext()
  const { settingId, adventurePlanId } = useAdventure()
  const [available, setAvailable] = useState(false)
  useEffect(() => setAvailable(narratorAvailable()), [])
  const voice = useNarratorVoice()
  const ready = useSyncExternalStore(onNarratorChange, narratorReady, () => false)
  const download = useSyncExternalStore(onVoiceDownload, voiceDownload, () => null)
  const sound = useSyncExternalStore(onSound, soundOn, () => false)

  // The scene's beds, from the set its encounter is staged on.
  const encounterId = currentTurn?.encounterId
  useEffect(() => {
    if (!encounterId) return
    let live = true
    void (async () => {
      const scenes = await SCENE_FILES[adventurePlanId]?.()
      const set = (scenes?.[encounterId] as { set?: string } | undefined)?.set
      const spec = set ? ((await SETS[set]?.()) as { ambience?: AmbienceBed[] } | undefined) : undefined
      if (live) setAmbience(spec?.ambience ?? [])
    })().catch(() => {})
    return () => {
      live = false
      setAmbience([])
    }
  }, [adventurePlanId, encounterId])

  // The setting's names, said as it lists them, and the heroes' names as they sound alone.
  const characters = currentTurn?.characters ?? []
  const names = characters
    .map((c) => c.name)
    .sort()
    .join("|")
  useEffect(() => {
    if (!available) return
    let live = true
    void getPronunciations(settingId).then((list) => live && setNarratorNames(withCharacters(list, names.split("|"))))
    return () => {
      live = false
    }
  }, [available, settingId, names])

  // The latest turn's story is read paragraph by paragraph, from the first not yet heard. Rolls, class features and the
  // players' own words show as they are and are not read.
  const turnId = currentTurn?.id
  const story = currentTurn?.story
  const paragraphs = useMemo(() => (story ? storyParagraphs(story).filter((p) => !SKIPPED.has(p.beats[0].kind)) : []), [story])
  const [at, setAt] = useState(0)
  useEffect(() => setAt(turnId ? heardOf(turnId) : 0), [turnId])
  const speakerOf = (i: number) => {
    const line = paragraphs[i]?.beats.find((b) => b.kind === "line")
    const c = line?.kind === "line" ? characters.find((c) => c.id === line.speaker) : undefined
    return c ? spokenGender(c) : undefined
  }
  const heard = useNarrator({
    key: `${turnId}:${at}`,
    text: paragraphs[at]?.text,
    next: paragraphs[at + 1]?.text,
    speaker: speakerOf(at),
    nextSpeaker: speakerOf(at + 1),
    on: !disableSSE && ready && sound,
  })
  useEffect(() => {
    if (heard.status !== "done" || !turnId) return
    markHeard(turnId, at + 1)
    setAt(at + 1)
  }, [heard.status, turnId, at])

  return (
    <>
      <span className="text-xs text-white/60">Sound</span>
      <div className="scale-75 pt-0.5">
        <Switch checked={sound} onCheckedChange={setSoundOn} id="sound-switch" />
      </div>
      {available && (
        <>
          <Tip label="Reads the story aloud. The voice downloads once, about 330 MB.">
            <span className="text-xs text-white/60">{download !== null ? `Loading Voice ${Math.round(download * 100)}%` : "Read Aloud"}</span>
          </Tip>
          <div className="scale-75 pt-0.5">
            <Switch
              checked={Boolean(voice)}
              onCheckedChange={(on) => {
                if (on) setSoundOn(true)
                setNarratorVoice(on ? "bf_emma" : null)
              }}
              id="read-aloud-switch"
            />
          </div>
        </>
      )}
    </>
  )
}
