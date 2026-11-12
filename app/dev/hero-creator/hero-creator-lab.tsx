"use client"

import { useState } from "react"
import type { HeroDraft } from "@/apps/desktop/runtime/heroes"
import { HeroCreator } from "@/apps/desktop/src/hero-creator"

const WELCOME = {
  races: ["Human", "Elf", "Dwarf", "Half-Elf", "Halfling", "Gnome", "Half-Orc"],
  archetypes: ["Fighter", "Barbarian", "Rogue", "Wizard", "Sorcerer", "Cleric", "Paladin", "Bard", "Ranger", "Monk", "Druid", "Warlock"],
}
const HOOKS = ["Bringing an offering to the Church of Valkara.", "Looking for work as a caravan guard.", "Following a debt that fled to the city."]

export function HeroCreatorLab() {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState("")
  const [round, setRound] = useState(0)
  return (
    <div className="relative min-h-screen bg-stage-ink text-white">
      <HeroCreator
        key={round}
        options={WELCOME}
        adventure={{ id: "welcome-to-kordavos", hooks: HOOKS }}
        figures={false}
        busy={busy}
        onDraft={async (idea, making) => {
          setBusy(true)
          const { buildHero } = await import("@d20/gm-core/character/hero-make")
          const built = buildHero(making)
          await new Promise((done) => setTimeout(done, 500))
          setBusy(false)
          if ("problems" in built) {
            setSaid(built.problems.join("; "))
            return undefined
          }
          return {
            ...built.record,
            sheet: built.sheet,
            name: idea.name,
            gender: idea.gender,
            image: "",
            type: "pc",
            effects: [],
            appearance: "Lean and road-worn, with ink on the cuffs.",
            personality: "Patient until crossed.",
            background: "Raised in a river town by a ferryman who could not read.",
            motivation: "To find work that lasts longer than a season.",
            behavior: "Watches first, speaks second.",
            arrivals: { "welcome-to-kordavos": { reason: "Looking for work as a caravan guard.", intro: "A traveler waits a little apart, counting coins twice.", tell: "Counts coins twice." } },
          } as HeroDraft
        }}
        onSave={async (hero, making) => {
          setSaid(JSON.stringify({ name: hero.name, race: hero.race, archetype: hero.archetype, making }, null, 2))
          setRound((n) => n + 1)
          return true
        }}
        onClose={() => setRound((n) => n + 1)}
      />
      {said && <pre className="absolute bottom-2 left-2 z-[60] max-h-40 max-w-[40rem] overflow-auto whitespace-pre-wrap bg-black/80 p-2 font-mono text-[10px] text-white/80">{said}</pre>}
    </div>
  )
}
