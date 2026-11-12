// Dev-only: the level-up screen for each premade class at each level it can take, from the adventures' own sheets.
// Gated to development: notFound() elsewhere.

import { readFileSync } from "node:fs"
import { join } from "node:path"
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

export default function LevelUpPage() {
  if (!isDev()) notFound()
  const heroes = HEROES.map((path) => {
    const hero = JSON.parse(readFileSync(join(process.cwd(), "content/settings/realm-of-myr/adventures", path), "utf8")) as { name: string; image?: string; sheet: Sheet }
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
