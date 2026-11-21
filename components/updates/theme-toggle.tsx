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

/** The look the page is in, light or dark, kept current as it changes. Undefined until the page has woken. */
export function useUpdateLook(): Look | undefined {
  return useSyncExternalStore(watchLook, readLook, () => undefined)
}

/**
 * Ledger's light and dark switch: both looks side by side, with a raised thumb under the current one.
 * The stylesheet places the thumb from the look on <html>, so it is right before React wakes.
 */
export function UpdateThemeToggle() {
  const current = useUpdateLook()
  const choose = (look: Look) => {
    const root = document.documentElement
    if (readLook() === look) return
    const change = () => {
      root.dataset.updateTheme = look
    }
    // The whole window crossfades to the new look (the `up-look-change` rules in app/updates/updates.css), where the
    // browser can and the reader has not asked for less motion. Elsewhere the look just changes.
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      change()
    } else {
      root.classList.add("up-look-change")
      document.startViewTransition(change).finished.finally(() => root.classList.remove("up-look-change"))
    }
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
