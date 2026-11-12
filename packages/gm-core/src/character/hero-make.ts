import { z } from "zod"
import type { Llm } from "../ports"
import { createSheet, creationChoicesSchema, creationPickSchema, heroRecord, heroRules } from "../sheet/create"
import type { Sheet } from "../sheet/sheet"
import { type Arrival, draftHeroStory, type HeroAdventure, type HeroStory } from "./hero-draft"

// Making a player's hero, for both hosts: the rules sheet is built from the player's choices by the engine, the words
// a hero is known by are read off that sheet, and the game master writes only the story, to fit them.

/** A new hero's rules as the player chose them: what they are made from, and their choices for it. */
export const heroMakingSchema = z.object({ pick: creationPickSchema, choices: creationChoicesSchema })
export type HeroMaking = z.infer<typeof heroMakingSchema>

/** What the rules make of a hero: the sheet, and the race, class, scores, skills and gear as a hero's record holds them. */
export type HeroBuild = { sheet: Sheet; gear: string[]; record: ReturnType<typeof heroRecord> }

/** The hero those choices make, or what stops it. */
export function buildHero(making: HeroMaking): HeroBuild | { problems: string[] } {
  const made = createSheet(making.pick, making.choices)
  if ("problems" in made) return made
  return { sheet: made.sheet, gear: made.gear, record: heroRecord(made.sheet, made.gear) }
}

/** Whether an adventure's lists allow a hero of that race and class. With no lists, the adventure takes no made hero. */
export const allowsHero = (options: { races: string[]; archetypes: string[] } | undefined, hero: { race: string; archetype: string }) =>
  Boolean(options?.races.includes(hero.race) && options.archetypes.includes(hero.archetype))

/** A hero as made: their rules, the words read off them, and the story written to fit. */
export type MadeHero = HeroStory & HeroBuild["record"] & { name: string; gender?: string; sheet: Sheet }

/**
 * Builds a hero from the player's choices and has the game master write their story, and their arrival where the
 * adventure has hooks and an opening. Throws with the engine's reasons when the choices do not make a legal hero.
 */
export async function makeHero(
  llm: Llm,
  who: { name: string; gender?: string; idea?: string },
  making: HeroMaking,
  adventure?: HeroAdventure,
  hook?: string
): Promise<{ hero: MadeHero; arrival?: Arrival }> {
  const built = buildHero(making)
  if ("problems" in built) throw new Error(`These choices do not make a legal hero: ${built.problems.join(". ")}.`)
  const { record, sheet, gear } = built
  const { arrival, ...story } = await draftHeroStory(
    llm,
    { name: who.name, race: record.race, archetype: record.archetype, gender: who.gender, idea: who.idea },
    heroRules(sheet, gear),
    adventure,
    hook
  )
  return { hero: { ...story, ...record, name: who.name, ...(who.gender ? { gender: who.gender } : {}), sheet }, ...(arrival ? { arrival } : {}) }
}

const STORY = ["name", "gender", "appearance", "personality", "background", "motivation", "behavior"] as const
/**
 * A stored hero with the story of an edit. Their rules, and the race, class, scores, skills and gear read off them,
 * stay as stored: levels change those, never an edit.
 */
export function withStoryOf<T extends object>(stored: T, edited: Partial<Record<(typeof STORY)[number], string>>): T {
  const story = Object.fromEntries(STORY.flatMap((key) => (typeof edited[key] === "string" ? [[key, edited[key]]] : [])))
  return { ...stored, ...story }
}
