import { isTauri } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import { textShadowSpreadLight } from "@/components/typography/styles"
import { cn } from "@/lib/utils"
import { isFullscreen, toggleFullscreen } from "./bridge"

// Fullscreen for the app window, or the page when it runs in a browser for checks.
export function useFullscreen() {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const check = () => void (isTauri() ? isFullscreen().then(setFull) : setFull(Boolean(document.fullscreenElement)))
    check()
    addEventListener("resize", check)
    return () => removeEventListener("resize", check)
  }, [])
  const toggle = async () => {
    if (isTauri()) return setFull(await toggleFullscreen())
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }
  return { full, toggle }
}

export function FullscreenButton({ className }: { className?: string }) {
  const { full, toggle } = useFullscreen()
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={full ? "Exit full screen" : "Full screen"}
      title={full ? "Exit full screen" : "Full screen"}
      className={cn("grid h-12 w-12 place-items-center rounded-full border border-white/80 text-white transition-colors hover:bg-white/15", className)}
      style={textShadowSpreadLight}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  )
}
