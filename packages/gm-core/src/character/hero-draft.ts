import { z } from "zod"
import { authoredText } from "../story/authored"
import type { Llm } from "../ports"

// Making a player's hero for the Realm of Myr, and their arrival in an adventure with hero hooks. Shared by the desktop
// app, where the player's CLI writes them, and the website, so a hero fits the world wherever it is made.

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
const FIT = [
  "Everything about them belongs in a medieval fantasy world: no modern objects, words or ideas, and no firearms.",
  "Name no real gods, places, factions or people beyond those given here. Invent small ones of their own if needed, such as a home village or a mentor.",
  "Their gear is what a traveler of their class could carry and afford, with at most one minor magic item.",
].join(" ")

/** The prompt that drafts a whole hero in one call. With an adventure that has hooks and an opening, the same call writes their arrival. */
export function heroDraftPrompt(hero: HeroIdea, adventure?: HeroAdventure, hook?: string) {
  return [
    who(hero),
    hero.idea ? `The player's idea for them: ${hero.idea}` : "",
    adventure ? about(adventure) : "",
    adventure ? "Give them a past that could bring them there: they may be from that land or from elsewhere." : "",
    FIT,
    "Keep the given name, race and class. Write appearance, personality, background and motivation as two or three vivid sentences each, plus a short behavior note on how they act in play. A spellcaster has two to four spells. Others have none. Equipment items have one-sentence descriptions.",
    adventure?.hooks?.length && adventure.opening ? arrivalPrompt(adventure.hooks, adventure.opening, hook) : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** The fields to add to the hero schema when heroDraftPrompt asks for an arrival. */
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
