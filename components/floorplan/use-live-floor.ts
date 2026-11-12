"use client"

import { useEffect, useState } from "react"
import { loadFloorView } from "./load-floor"
import type { FloorView } from "./view"

/**
 * The floor of the encounter the live turn is in. The server sends the first one with the page; when the turn moves to
 * another encounter, its floor is fetched. Null while it loads and for an encounter with no floor plan.
 */
export function useLiveFloor(initial: FloorView | null | undefined, encounterId: string | undefined): FloorView | null {
  const [loaded, setLoaded] = useState<{ encounterId?: string; floor: FloorView | null }>({ encounterId: initial?.encounterId, floor: initial ?? null })
  useEffect(() => {
    if (!encounterId || loaded.encounterId === encounterId) return
    let live = true
    loadFloorView(encounterId)
      .then((floor) => live && setLoaded({ encounterId, floor }))
      .catch((error) => {
        console.error("[floorplan] floor load failed", error)
        if (live) setLoaded({ encounterId, floor: null })
      })
    return () => {
      live = false
    }
  }, [encounterId, loaded.encounterId])
  return loaded.encounterId === encounterId ? loaded.floor : null
}
