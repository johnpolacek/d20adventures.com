// Dev-only: the level-up screen for each premade class at the levels it shows, from the adventures' own sheets,
// and for a made hero of each class that has no premade.
// Gated to development: notFound() elsewhere.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { autoCreate, type CreationPick, createSheet } from "@d20/gm-core/sheet/create"
import { autoChoices, LEVEL_CAP, takeLevel } from "@d20/gm-core/sheet/milestone"
import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import { LevelUpLab } from "./level-up-lab"

const HEROES = [
  "covert-cargo/characters/thalbern.json",
  "covert-cargo/characters/1749159962941.json",
  "covert-cargo/characters/1749307435667.json",
  "welcome-to-kordavos/characters/milos-radan.json",
  "welcome-to-kordavos/characters/branka-stoneveil.json",
  "welcome-to-kordavos/characters/ilya-veles.json",
]

const MADE = [
  { name: "Barbarian", class: "barbarian", species: "dwarf", background: "soldier" },
  { name: "Druid", class: "druid", species: "elf", background: "acolyte" },
  { name: "Monk", class: "monk", species: "human", background: "sage" },
  { name: "Paladin", class: "paladin", species: "human", background: "soldier" },
  { name: "Sorcerer", class: "sorcerer", species: "dragonborn", background: "sage" },
  { name: "Warlock", class: "warlock", species: "tiefling", background: "acolyte" },
]

// The levels the lab takes a hero to: each to 5, then those that bring a choice of their own (Magical Secrets at 10, a
// Mystic Arcanum at 11, the Epic Boon at 19) and the capstones at 20.
const SHOWN = [2, 3, 4, 5, 6, 10, 11, 17, 19, 20]

export default function LevelUpPage() {
  if (!isDev()) notFound()
  const premade = HEROES.map((path) => JSON.parse(readFileSync(join(process.cwd(), "content/settings/realm-of-myr/adventures", path), "utf8")) as { name: string; image?: string; sheet: Sheet })
  const made = MADE.flatMap(({ name, ...rest }) => {
    const pick = rest as CreationPick
    const built = createSheet(pick, autoCreate(pick))
    return "problems" in built ? [] : [{ name, image: undefined as string | undefined, sheet: built.sheet }]
  })
  const heroes = [...premade, ...made].map((hero) => {
    // The hero raised by the choices that need no player, kept below each level the lab shows.
    const sheets = [hero.sheet]
    let sheet = hero.sheet
    while (sheet.level < LEVEL_CAP - 1) {
      const taken = takeLevel({ type: "pc", sheet, levelDue: LEVEL_CAP }, autoChoices(sheet))
      if ("problems" in taken) break
      sheet = taken.character.sheet
      if (SHOWN.includes(sheet.level + 1)) sheets.push(sheet)
    }
    return { name: hero.name, image: hero.image, sheets }
  })
  return <LevelUpLab heroes={heroes} />
}
