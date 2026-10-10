import { isTauri } from "@tauri-apps/api/core"
import { Expand, Shrink } from "lucide-react"
import { useEffect, useState } from "react"
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
  const Icon = full ? Shrink : Expand
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={full ? "Exit full screen" : "Full screen"}
      title={full ? "Exit full screen" : "Full screen"}
      className={cn("grid h-12 w-12 place-items-center text-white opacity-85 drop-shadow-[0_1px_6px_#000] transition-opacity hover:opacity-100", className)}
    >
      <Icon aria-hidden="true" className="h-7 w-7" strokeWidth={1.75} />
    </button>
  )
}
