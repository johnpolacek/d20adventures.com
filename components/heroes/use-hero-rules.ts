"use client"

// The rules of making a hero, for the creator's screen. They load on first use, in their own chunk, so a page that
// never opens the creator does not carry the rules data.

import type { CreationChoices, CreationOptions, CreationPick } from "@d20/gm-core/sheet/create"
import type { Named } from "@d20/gm-core/sheet/level-up"
import type { Sheet } from "@d20/gm-core/sheet/sheet"
import type { SheetView } from "@d20/gm-core/sheet/view"
import { useEffect, useState } from "react"

export type HeroRulesKit = {
  /** The classes, species and backgrounds a hero can be made from. */
  menu: { classes: Named[]; species: Named[]; backgrounds: Named[] }
  /** What a class, species and background ask the player to choose. */
  options: (pick: CreationPick) => CreationOptions
  /** Choices that need no player. */
  auto: (pick: CreationPick) => CreationChoices
  /** The hero those choices make, as the sheet shows it, or what stops it. */
  build: (pick: CreationPick, choices: CreationChoices) => { sheet: Sheet; gear: string[]; view: SheetView } | { problems: string[] }
  /** A class's spells of one level, for a feat that takes spells from a list. */
  listSpells: (classId: string, level: number) => Named[]
}

/** The rules kit. Null while it loads. */
export function useHeroRules(): HeroRulesKit | null {
  const [kit, setKit] = useState<HeroRulesKit | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([import("@d20/gm-core/sheet/create"), import("@d20/gm-core/sheet/level-up"), import("@d20/gm-core/sheet/view")])
      .then(([create, levels, view]) => {
        if (!live) return
        setKit({
          menu: create.creationMenu(),
          options: create.creationOptions,
          auto: create.autoCreate,
          build: (pick, choices) => {
            const made = create.createSheet(pick, choices)
            return "problems" in made ? made : { ...made, view: view.sheetView(made.sheet) }
          },
          listSpells: (classId, level) => levels.listSpells(classId, level, level).map(levels.spellNamed),
        })
      })
      .catch(() => {
        if (live) setKit(null)
      })
    return () => {
      live = false
    }
  }, [])
  return kit
}
