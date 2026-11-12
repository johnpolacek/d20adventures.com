"use client"

import type { Sheet } from "@d20/gm-core/sheet/sheet"
import type { SpellEffect } from "@d20/gm-core/sheet/turn-effect"
import type { SheetView } from "@d20/gm-core/sheet/view"
import { useEffect, useState } from "react"

/**
 * A hero's rules sheet, worked out for display at its stored hit points and the spell slots used. The rules data loads on first use, in its own
 * chunk, so pages that never open a sheet do not carry it. Null while loading, and for a character with no sheet.
 */
export function useSheetView(sheet: Sheet | undefined, hitPoints: number | undefined, spellSlots: readonly number[] | undefined, spellEffects?: readonly SpellEffect[]): SheetView | null {
  const [view, setView] = useState<SheetView | null>(null)
  const key = sheet ? JSON.stringify(sheet) : ""
  const slots = JSON.stringify(spellSlots ?? [])
  const effects = JSON.stringify(spellEffects ?? [])
  useEffect(() => {
    let live = true
    if (!key) {
      setView(null)
      return
    }
    import("@d20/gm-core/sheet/view")
      .then(({ sheetView }) => {
        if (live) setView(sheetView(JSON.parse(key) as Sheet, hitPoints, JSON.parse(slots) as number[], JSON.parse(effects) as SpellEffect[]))
      })
      .catch(() => {
        if (live) setView(null)
      })
    return () => {
      live = false
    }
  }, [key, hitPoints, slots, effects])
  return view
}

/**
 * The rules sheets of several heroes at once, by id, each at its stored hit points and spell slots used: for a row of portraits that shows
 * every hero's numbers. A hero with no sheet, or before the rules data loads, has none.
 */
export function useSheetViews(
  characters: readonly { id: string; type?: string; sheet?: Sheet; hitPoints?: number; spellSlots?: readonly number[]; spellEffects?: readonly SpellEffect[] }[]
): Record<string, SheetView> {
  const [views, setViews] = useState<Record<string, SheetView>>({})
  const key = JSON.stringify(characters.flatMap((c) => (c.type === "pc" && c.sheet ? [[c.id, c.sheet, c.hitPoints ?? null, c.spellSlots ?? [], c.spellEffects ?? []]] : [])))
  useEffect(() => {
    let live = true
    const heroes = JSON.parse(key) as [string, Sheet, number | null, number[], SpellEffect[]][]
    if (!heroes.length) {
      setViews({})
      return
    }
    import("@d20/gm-core/sheet/view")
      .then(({ sheetView }) => {
        if (!live) return
        const out: Record<string, SheetView> = {}
        for (const [id, sheet, hitPoints, spellSlots, spellEffects] of heroes) {
          try {
            out[id] = sheetView(sheet, hitPoints ?? undefined, spellSlots, spellEffects)
          } catch {
            // A sheet the rules cannot read shows no numbers.
          }
        }
        setViews(out)
      })
      .catch(() => {
        if (live) setViews({})
      })
    return () => {
      live = false
    }
  }, [key])
  return views
}
