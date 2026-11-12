import { z } from "zod"
import type { Llm } from "../ports"
import { authoredText } from "../story/authored"

// Making a player's hero for the Realm of Myr, and their arrival in an adventure with hero hooks. Shared by the desktop
// app, where the player's CLI writes them, and the website, so a hero fits the world wherever it is made.

/** Only a hero with a rules sheet plays. */
export const playableHero = (hero: { sheet?: unknown }) => Boolean(hero.sheet)

const text = (max: number) => z.string().trim().max(max)
// How a hero comes into one adventure: why they came, for their sheet, the paragraph that shows them in its opening
// scene, and the one thing others there can see and ask about.
export const arrivalSchema = z.object({ reason: text(400).min(1), intro: text(600).min(1), tell: text(200).min(1) })
export type Arrival = z.infer<typeof arrivalSchema>

export type HeroIdea = { name: string; race: string; archetype: string; gender?: string; idea?: string }
// The adventure a hero is made for: its title and teaser, and with hooks the start encounter's intro they arrive in.
export type HeroAdventure = { title: string; teaser?: string; hooks?: string[]; opening?: string }

const who = (h: Pick<HeroIdea, "name" | "race" | "archetype" | "gender">) =>
  `${h.name}, a ${[h.gender, h.race, h.archetype].filter(Boolean).join(" ")}, a hero of the Realm of Myr, a medieval fantasy world.`
const about = (adventure: HeroAdventure) => `They are about to set out on ${adventure.title}${adventure.teaser ? `: ${adventure.teaser}` : "."}`

// Keeps the hero inside the world: the adventure's teaser is all they know of it.
const WORLD = [
  "Everything about them belongs in a medieval fantasy world: no modern objects, words or ideas, and no firearms.",
  "Name no real gods, places, factions or people beyond those given here. Invent small ones of their own if needed, such as a home village or a mentor.",
  // The owner's word, 2026-11-12: the March of Davos keeps the faith of Valkara, and other faiths may be invented.
  "The faith of the March of Davos, where Kordavos stands, is the Church of Valkara: a devout hero of the March keeps it. One from another land may keep a faith of their own, which you may invent.",
].join(" ")

/**
 * What the rules make of a hero, in words: the story is written to fit it. The scores, skills, gear and spells
 * themselves come from the hero's sheet (../sheet/create), never from the model.
 */
export type HeroRules = {
  /** The SRD background by name: "Soldier". */
  background: string
  /** The abilities the hero is strongest and weakest in, by name: "Dexterity". */
  strongest: string[]
  weakest: string
  /** The skills they are proficient in, by name. */
  skills: string[]
  /** What they carry, by name. */
  gear: string[]
  /** The cantrips and spells they can cast, by name. None for one who casts nothing. */
  spells: string[]
}

/** The story of a hero, which the game master writes and the player may edit. */
export const heroStorySchema = z.object({
  appearance: z.string().trim().min(1),
  personality: z.string().trim().min(1),
  background: z.string().trim().min(1),
  motivation: z.string().trim().min(1),
  behavior: z.string().trim().min(1),
})
export type HeroStory = z.infer<typeof heroStorySchema>

const listed = (items: string[]) => items.join(", ")

/** The prompt that writes a hero's story in one call. With an adventure that has hooks and an opening, the same call writes their arrival. */
export function heroStoryPrompt(hero: HeroIdea, rules: HeroRules, adventure?: HeroAdventure, hook?: string) {
  return [
    who(hero),
    hero.idea ? `The player's idea for them: ${hero.idea}` : "",
    "The rules of the game have already settled what they can do. Write a story that fits all of it and contradicts none of it:",
    `- The life behind them: ${rules.background}.`,
    `- Strongest in ${listed(rules.strongest)}, and weakest in ${rules.weakest}.`,
    rules.skills.length ? `- Skilled in ${listed(rules.skills)}.` : "",
    rules.gear.length ? `- They carry ${listed(rules.gear)}.` : "",
    rules.spells.length ? `- They can cast ${listed(rules.spells)}.` : "- They cast no spells.",
    adventure ? about(adventure) : "",
    adventure ? "Give them a past that could bring them there: they may be from that land or from elsewhere." : "",
    // Without an arrival in the same call, the player's reason still shapes the past.
    adventure && hook && !draftsArrival(adventure) ? `Why they are going there: ${hook.replace(/\.?$/, ".")} Their background leads to it.` : "",
    WORLD,
    "Keep the given name, race and class. Write appearance, personality, background and motivation as two or three vivid sentences each, plus a short behavior note on how they act in play. Give no numbers. Name no weapon, armor, spell or skill beyond those listed above. Show what the rules settled through how they look, live and act: do not open by restating their race and class, and do not list their abilities or skills as such.",
    adventure?.hooks?.length && adventure.opening ? arrivalPrompt(adventure.hooks, adventure.opening, hook) : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Writes a hero's story to fit what the rules made of them, and their arrival where the adventure has hooks and an opening. */
export async function draftHeroStory(llm: Llm, hero: HeroIdea, rules: HeroRules, adventure?: HeroAdventure, hook?: string): Promise<HeroStory & { arrival?: Arrival }> {
  const schema = draftsArrival(adventure) ? heroStorySchema.extend({ arrival: arrivalSchema }) : heroStorySchema
  return (await llm.generateObject({ prompt: heroStoryPrompt(hero, rules, adventure, hook), schema })).object
}

/** Whether the story's call also writes an arrival: the adventure has hooks and an opening. */
export const draftsArrival = (adventure?: HeroAdventure) => Boolean(adventure?.hooks?.length && adventure.opening)

type SheetText = HeroIdea & { appearance: string; personality?: string; background?: string; motivation?: string }

/** Writes the arrival of a hero already made, with the player's hook or one the GM picks from the adventure's. */
export async function writeArrival(llm: Llm, hero: SheetText, adventure: Required<Pick<HeroAdventure, "title" | "hooks" | "opening">> & HeroAdventure, hook?: string) {
  const prompt = [
    `${who(hero)} ${about(adventure)}`,
    `Appearance: ${hero.appearance}`,
    hero.personality ? `Personality: ${hero.personality}` : "",
    hero.background ? `Background: ${hero.background}` : "",
    hero.motivation ? `Motivation: ${hero.motivation}` : "",
    arrivalPrompt(adventure.hooks, adventure.opening, hook),
  ]
    .filter(Boolean)
    .join("\n")
  return (await llm.generateObject({ prompt, schema: arrivalSchema })).object
}

// Asks for a hero's arrival in an adventure's opening scene, written like the paragraphs that show its premades there.
function arrivalPrompt(hooks: string[], opening: string, hook?: string) {
  return [
    "They arrive alone, a stranger to everyone, in the adventure's opening scene below. Write their arrival:",
    `- reason: one sentence for their sheet on why they have come, in the third person. ${hook ? `The player's reason for them: ${hook}` : `Pick the reason that suits them best: ${hooks.join(" | ")}`}`,
    "- intro: a paragraph for the scene like the one about each traveler in it. One or two sentences in the present tense, at most 45 words: how they look and what they do while they wait, with one detail the others can notice and ask about. Show the reason without stating it. Never give their name, since no one there knows it. Mention no other traveler, since who else stands in the line changes.",
    "- tell: one short sentence on that detail as others see it, for their sheet.",
    `The opening scene:\n${authoredText(opening)}`,
  ].join("\n")
}

/** A hero's sheet in one adventure: why they came on their background, and what others see on their appearance. */
export function withArrival<T extends { background?: string; appearance?: string }>(sheet: T, arrival?: Arrival): T {
  if (!arrival) return sheet
  return { ...sheet, background: [sheet.background, arrival.reason].filter(Boolean).join(" "), appearance: [sheet.appearance, arrival.tell].filter(Boolean).join(" ") }
}
