"use client"

import type { Sheet } from "@d20/gm-core/sheet/sheet"
import type { SheetView } from "@d20/gm-core/sheet/view"
import { useEffect, useState } from "react"

/**
 * A hero's rules sheet, worked out for display. The rules data loads on first use, in its own chunk, so pages that
 * never open a sheet do not carry it. Null while loading, and for a character with no sheet.
 */
export function useSheetView(sheet: Sheet | undefined, healthPercent?: number): SheetView | null {
  const [view, setView] = useState<SheetView | null>(null)
  const key = sheet ? JSON.stringify(sheet) : ""
  useEffect(() => {
    let live = true
    if (!key) {
      setView(null)
      return
    }
    import("@d20/gm-core/sheet/view")
      .then(({ sheetView }) => {
        if (live) setView(sheetView(JSON.parse(key) as Sheet, healthPercent))
      })
      .catch(() => {
        if (live) setView(null)
      })
    return () => {
      live = false
    }
  }, [key, healthPercent])
  return view
}
