"use client"

// Phones play in landscape (Stageview decision 6). A phone held upright gets a full-screen prompt instead of the stage.
// iOS cannot lock orientation from a web page, so the prompt is the enforcement there; Android can lock once the page is
// fullscreen, which requestLandscape() asks for on the player's first tap.

import { useEffect, useState } from "react"

// Phones only: tablets in portrait keep playing, with the panel as a bottom sheet.
const PHONE_PORTRAIT = "(pointer: coarse) and (orientation: portrait) and (max-width: 600px)"

export function usePhonePortrait() {
  const [portrait, setPortrait] = useState(false)
  useEffect(() => {
    const mq = matchMedia(PHONE_PORTRAIT)
    const sync = () => setPortrait(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return portrait
}

// Best effort: fullscreen, then lock to landscape. Both fail silently where unsupported (iOS Safari, desktop).
export async function requestLandscape() {
  if (!matchMedia("(pointer: coarse)").matches) return
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" })
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await orientation.lock?.("landscape")
  } catch {
    // unsupported: the rotate prompt still guards portrait
  }
}

export function RotatePrompt() {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-6 bg-stage-ink px-8 text-center" role="alert">
      <svg viewBox="0 0 64 64" className="h-20 w-20 animate-[spin_2.4s_ease-in-out_infinite] text-stage-gold" aria-hidden="true">
        <rect x="20" y="6" width="24" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="32" cy="44" r="2" fill="currentColor" />
      </svg>
      <div className="font-serif text-2xl text-stage-gold">Turn your phone sideways</div>
      <p className="max-w-xs font-sans text-[11px] tracking-[0.2em] uppercase text-stage-sage">The adventure plays in landscape.</p>
    </div>
  )
}
