import type { SkillId } from "@d20/srd"
import type { Species } from "@d20/srd/schema/origins"
import { species as srdSpecies } from "@d20/srd/species"

/**
 * The game's own species. These are not SRD content: the SRD 5.2.1 has no Half-Elf or Half-Orc, and the adventures of
 * the Realm of Myr offer both, so the game writes its own, in its own words, by the owner's decision of 2026-11-12.
 * They are kept here, apart from `@d20/srd`, which holds the SRD alone. They take the shape of the SRD's species, in
 * the 2024 style: no ability score increases, which come from the background. Having no page in the SRD, they carry none.
 *
 * Where one shares a kind of trait with an SRD species, it is typed the same way, so one rule runs both: Fey Blood is
 * typed as an Elf's Fey Ancestry is, and Hard to Fell is found beside Relentless Endurance (./species-traits).
 */
export type SpeciesEntry = Omit<Species, "page"> & { page?: number }

export const HOUSE_SPECIES: readonly SpeciesEntry[] = [
  {
    id: "half-elf",
    name: "Half-Elf",
    creatureType: "humanoid",
    sizes: [{ size: "Medium", height: "about 5–6 feet tall" }],
    speed: 30,
    traits: [
      {
        name: "Darkvision",
        text: "Out to 60 feet you see in dim light as if it were bright, and in darkness as if it were dim. In darkness you make out shapes but no color.",
        senses: [{ type: "darkvision", range: 60 }],
      },
      {
        name: "Fey Blood",
        text: "Your elven blood steadies your mind. You have Advantage on saving throws you make to avoid or end the Charmed condition.",
        savingThrowAdvantage: { conditions: ["charmed"] },
      },
      {
        name: "Two Worlds",
        text: "Raised between two peoples, you have learned from both. You gain proficiency in one skill of your choice.",
        skillChoice: { count: 1, from: "any" },
      },
    ],
  },
  {
    id: "half-orc",
    name: "Half-Orc",
    creatureType: "humanoid",
    sizes: [{ size: "Medium", height: "about 5–7 feet tall" }],
    speed: 30,
    traits: [
      {
        name: "Darkvision",
        text: "Out to 60 feet you see in dim light as if it were bright, and in darkness as if it were dim. In darkness you make out shapes but no color.",
        senses: [{ type: "darkvision", range: 60 }],
      },
      {
        name: "Hard to Fell",
        text: "The first time a blow would bring you to 0 Hit Points without killing you outright, you stay on your feet at 1 Hit Point. You must finish a Long Rest before this can save you again.",
        uses: { count: 1, recharge: "long-rest" },
      },
      {
        name: "Menacing",
        text: "Your bearing alone makes people think twice. You have proficiency in the Intimidation skill.",
        skillChoice: { count: 1, from: ["intimidation"] },
      },
    ],
  },
]

/** Every species a hero can be: the SRD's, then the game's own. */
export const allSpecies: readonly SpeciesEntry[] = [...srdSpecies, ...HOUSE_SPECIES]

/** The one lookup the engine reads a species through, the SRD's and the game's own alike. */
export const speciesById: ReadonlyMap<string, SpeciesEntry> = new Map(allSpecies.map((entry) => [entry.id, entry]))

/**
 * The skills a species gives with no choice: a trait whose list holds only as many skills as it gives (a Half-Orc's
 * Menacing). Any other skill a trait gives is the player's pick, kept in the sheet's `otherSkills`.
 */
export function grantedSkills(species: SpeciesEntry): SkillId[] {
  return species.traits.flatMap((trait) => (Array.isArray(trait.skillChoice?.from) && trait.skillChoice.from.length === trait.skillChoice.count ? trait.skillChoice.from : []))
}

/** Whether a species trait's skills are the player's pick, not given outright. */
export const picksSkills = (trait: SpeciesEntry["traits"][number]) => !!trait.skillChoice && !(Array.isArray(trait.skillChoice.from) && trait.skillChoice.from.length === trait.skillChoice.count)
