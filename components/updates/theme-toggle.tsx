"use client"

import { UPDATE_THEME_KEY } from "@/lib/update-theme"

/** The Updates pages' light and dark switch. It names the look it switches to, and the stylesheet shows the right name. */
export function UpdateThemeToggle() {
  return (
    <button
      type="button"
      className="up-theme-toggle"
      aria-label="Switch Between Light and Dark"
      onClick={() => {
        const root = document.documentElement
        const theme = root.dataset.updateTheme === "dark" ? "light" : "dark"
        root.dataset.updateTheme = theme
        try {
          localStorage.setItem(UPDATE_THEME_KEY, theme)
        } catch {
          // The choice still holds for this visit.
        }
      }}
    >
      <span className="up-when-light">Dark</span>
      <span className="up-when-dark">Light</span>
    </button>
  )
}
