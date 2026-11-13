"use client"

// Two heroes who own magic items, shown by the stage's character card and the site's character sheet: Branka with a
// magic weapon and Shield, a Ring of Protection attuned and a Cloak of Protection not, and Lyra with a Wand of the War
// Mage and a Robe of the Archmagi. The items are given here: no hero gains one in play yet.

import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { useState } from "react"
import { CharacterSheetModal } from "@/components/adventure/character-sheet-modal"
import { useSheetView } from "@/components/adventure/use-sheet-view"
import { CharacterCard } from "@/components/stage/character-card"
import { eyebrow, Pill } from "@/components/stage/hud"
import type { PCTemplate } from "@/types/character"

const BRANKA: Sheet = {
  class: "fighter",
  level: 1,
  species: "dwarf",
  background: "soldier",
  abilityScores: { str: 16, dex: 10, con: 16, int: 10, wis: 12, cha: 8 },
  classSkills: ["perception", "insight"],
  featureChoices: { "fighter-fighting-style": "defense" },
  armor: "breastplate",
  shield: true,
  weapons: ["warhammer", "longsword"],
  weaponMasteries: ["warhammer"],
  items: [
    { id: "weapon-1-2-or-3", variant: "+1", base: "warhammer" },
    { id: "shield-1-2-or-3", variant: "+2", base: "shield" },
    { id: "ring-of-protection", attuned: true },
    { id: "cloak-of-protection" },
    { id: "armor-1-2-or-3", variant: "+1", base: "plate-armor" },
    { id: "bag-of-holding" },
  ],
}

const LYRA: Sheet = {
  class: "wizard",
  level: 1,
  species: "human",
  background: "sage",
  abilityScores: { str: 8, dex: 10, con: 10, int: 16, wis: 14, cha: 12 },
  classSkills: ["investigation", "religion"],
  otherSkills: ["insight"],
  feats: ["skilled"],
  weapons: ["quarterstaff"],
  cantrips: ["mage-hand", "light", "ray-of-frost"],
  spells: ["detect-magic", "fog-cloud", "charm-person", "magic-missile"],
  spellbook: ["detect-magic", "identify", "comprehend-languages", "fog-cloud", "charm-person", "magic-missile"],
  items: [
    { id: "wand-of-the-war-mage-1-2-or-3", variant: "+1", attuned: true },
    { id: "robe-of-the-archmagi", attuned: true },
    { id: "dragon-slayer", base: "longsword" },
  ],
}

const HEROES = [
  { name: "Branka Stoneveil", race: "Dwarf", archetype: "Fighter", sheet: BRANKA },
  { name: "Lyra Silvanus", race: "Human", archetype: "Wizard", sheet: LYRA },
]

function ItemHero({ hero, onOpen }: { hero: (typeof HEROES)[number]; onOpen: () => void }) {
  const view = useSheetView(hero.sheet, undefined, undefined)
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={eyebrow}>Card · {hero.name}</h3>
        <Pill onClick={onOpen}>Site Sheet</Pill>
      </div>
      <div className="relative h-[620px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
        {view && (
          <CharacterCard
            info={{
              id: hero.name,
              name: hero.name,
              role: `${hero.race} ${hero.archetype}`,
              standing: { kind: "hero", hitPoints: view.hitPoints.current, maximum: view.hitPoints.maximum, armorClass: view.armorClass },
              ...(view.spellcasting ? { spellcasting: view.spellcasting } : {}),
              items: view.items,
            }}
            onClose={() => {}}
          />
        )}
      </div>
    </section>
  )
}

export function ItemLooks() {
  const [open, setOpen] = useState<(typeof HEROES)[number] | null>(null)
  return (
    <div className="mt-12 flex flex-col gap-6">
      <div>
        <div className={eyebrow}>Stageview · magic items</div>
        <h2 className="mt-1.5 font-display text-[26px]">Magic Items</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6">
        {HEROES.map((hero) => (
          <ItemHero key={hero.name} hero={hero} onOpen={() => setOpen(hero)} />
        ))}
      </div>
      <CharacterSheetModal
        character={open ? ({ id: open.name, name: open.name, race: open.race, archetype: open.archetype, gender: "", sheet: open.sheet } as unknown as PCTemplate) : null}
        open={!!open}
        onOpenChange={(next) => !next && setOpen(null)}
      />
    </div>
  )
}
