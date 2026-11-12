// Dev-only: the level-up screen for each premade class at each level it can take, from the adventures' own sheets,
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

export default function LevelUpPage() {
  if (!isDev()) notFound()
  const premade = HEROES.map((path) => JSON.parse(readFileSync(join(process.cwd(), "content/settings/realm-of-myr/adventures", path), "utf8")) as { name: string; image?: string; sheet: Sheet })
  const made = MADE.flatMap(({ name, ...rest }) => {
    const pick = rest as CreationPick
    const built = createSheet(pick, autoCreate(pick))
    return "problems" in built ? [] : [{ name, image: undefined as string | undefined, sheet: built.sheet }]
  })
  const heroes = [...premade, ...made].map((hero) => {
    // The hero at each level below the cap, by the choices that need no player.
    const sheets = [hero.sheet]
    while (sheets.length < LEVEL_CAP - 1) {
      const taken = takeLevel({ type: "pc", sheet: sheets[sheets.length - 1], levelDue: LEVEL_CAP }, autoChoices(sheets[sheets.length - 1]))
      if ("problems" in taken) break
      sheets.push(taken.character.sheet)
    }
    return { name: hero.name, image: hero.image, sheets }
  })
  return <LevelUpLab heroes={heroes} />
}
