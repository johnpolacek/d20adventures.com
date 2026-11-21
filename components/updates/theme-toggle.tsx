"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Button } from "@d20/ui/button"
import { UPDATE_THEME_KEY } from "@/lib/update-theme"

type Look = "light" | "dark"

const LOOKS = [
  { look: "light", name: "Light", Icon: Sun },
  { look: "dark", name: "Dark", Icon: Moon },
] as const

// The look lives on <html>, where the script in app/layout.tsx sets it before the page draws.
const readLook = () => document.documentElement.dataset.updateTheme as Look | undefined
const watchLook = (notify: () => void) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-update-theme"] })
  return () => observer.disconnect()
}

/**
 * The Updates pages' light and dark switch: both looks side by side, the current one raised.
 * The stylesheet raises it from the look on <html>, so it is right before React wakes.
 */
export function UpdateThemeToggle() {
  const current = useSyncExternalStore(watchLook, readLook, () => undefined)
  const choose = (look: Look) => {
    document.documentElement.dataset.updateTheme = look
    try {
      localStorage.setItem(UPDATE_THEME_KEY, look)
    } catch {
      // The choice still holds for this visit.
    }
  }
  return (
    <div className="up-theme-switch" role="radiogroup" aria-label="Look">
      {LOOKS.map(({ look, name, Icon }) => (
        <Button key={look} variant="plain" role="radio" aria-checked={current === look} data-look={look} onClick={() => choose(look)}>
          <Icon aria-hidden="true" />
          <span>{name}</span>
        </Button>
      ))}
    </div>
  )
}
