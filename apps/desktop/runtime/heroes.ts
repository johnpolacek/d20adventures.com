import { randomUUID } from "node:crypto"
import type { Llm } from "@d20/gm-core"
import { type Arrival, arrivalSchema, playableHero, withArrival, writeArrival } from "@d20/gm-core/character/hero-draft"
import { allowsHero, buildHero, heroMakingSchema, makeHero, withStoryOf } from "@d20/gm-core/character/hero-make"
import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { type PCTemplate, pcTemplateSchema } from "@d20/gm-core/types/character"
import { z } from "zod"
import { STOCK_FIGURES } from "../src/figures"
import type { Pack, Packs } from "./game"
import { PAINTERS, paint, readArt, storeArt } from "./paint"

const text = (max: number) => z.string().trim().max(max)
export type { Arrival }
// A hero in the local roster: a player character sheet and the stock figure that stands for them. `painted` heroes
// stand as the art painted for them instead, while it exists. Arrivals are by adventure id, so the sheet itself stays
// the hero's own in every adventure.
export const heroSchema = pcTemplateSchema.extend({
  id: z.string().regex(/^hero-[a-z0-9-]{4,40}$/),
  figure: z.string().refine((id) => id in STOCK_FIGURES, "Unknown figure."),
  painted: z.boolean().optional(),
  arrivals: z.record(z.string().max(100), arrivalSchema).optional(),
})
export type Hero = z.infer<typeof heroSchema>
const provider = z.enum(["claude", "codex", "grok", "antigravity"])
// A Claude model by the CLI's alias, such as opus or fable.
export const gmModelSchema = z
  .string()
  .regex(/^[a-z]+$/)
  .max(20)
  .optional()
export const heroCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("heroDraft"),
    provider,
    model: gmModelSchema,
    name: text(80).min(1),
    gender: text(40).optional(),
    idea: text(600).optional(),
    adventure: text(100).optional(),
    // Why the hero came, from the adventure's hooks or the player's own words.
    hook: text(300).optional(),
    // The hero's rules as the player chose them.
    making: heroMakingSchema,
  }),
  // A new hero arrives without an id, with the rules choices they were made from: the sheet is built from those
  // again here, never taken from the screen. A roster hero's story can be edited, and their rules stay as they are.
  z.object({ kind: z.literal("saveHero"), hero: heroSchema.extend({ id: heroSchema.shape.id.optional() }), making: heroMakingSchema.optional() }),
  z.object({ kind: z.literal("deleteHero"), id: z.string().max(100) }),
  z.object({ kind: z.literal("paintHero"), provider: z.enum(PAINTERS), id: z.string().max(100) }),
  // Painted art for these heroes, as data URLs.
  z.object({ kind: z.literal("art"), ids: z.array(z.string().max(100)).max(24) }),
])
export type HeroCommand = z.infer<typeof heroCommandSchema>
export type HeroDraft = Omit<Hero, "id" | "figure">
export interface Roster {
  heroes(): Hero[]
  putHero(hero: Hero): void
  deleteHero(id: string): void
}

// The races and classes a hero can be made with: every bundled adventure's options, in the order the adventures list them.
export function creationOptions(packs: Packs) {
  const options = Object.values(packs).flatMap((p) => (p.artifacts.manifest.availableCharacterOptions ? [p.artifacts.manifest.availableCharacterOptions] : []))
  return { races: [...new Set(options.flatMap((o) => o.races))], archetypes: [...new Set(options.flatMap((o) => o.archetypes))] }
}

// `files` is where painted art lives and a scratch directory for the painting CLI.
export async function heroCommand(
  input: HeroCommand,
  roster: Roster,
  packs: Packs,
  llm: Llm,
  files?: { data: string; scratch: string }
): Promise<{ draft?: HeroDraft; art?: ReturnType<typeof readArt> }> {
  const command = heroCommandSchema.parse(input)
  if (command.kind === "deleteHero") {
    roster.deleteHero(command.id)
    return {}
  }
  if (command.kind === "art") return { art: files ? readArt(files.data, command.ids) : {} }
  if (command.kind === "paintHero") {
    const hero = roster.heroes().find((h) => h.id === command.id)
    if (!hero) throw new Error("That hero is no longer in your roster.")
    if (!files) throw new Error("Painting needs the app's data folder.")
    storeArt(files.data, hero.id, await paint(command.provider, hero, files.scratch))
    roster.putHero({ ...hero, painted: true })
    return { art: readArt(files.data, [hero.id]) }
  }
  if (command.kind === "saveHero") {
    const { id, ...edited } = command.hero
    const stored = id ? roster.heroes().find((h) => h.id === id) : undefined
    if (id && !stored) throw new Error("That hero is no longer in your roster.")
    if (stored) {
      // Their story, figure and arrivals change. Their rules, and the words read off them, do not.
      roster.putHero({ ...withStoryOf(stored, edited), figure: edited.figure, painted: edited.painted, arrivals: edited.arrivals })
      return {}
    }
    if (!command.making) throw new Error("A new hero needs their rules choices.")
    const built = buildHero(command.making)
    if ("problems" in built) throw new Error(`These choices do not make a legal hero: ${built.problems.join(". ")}.`)
    if (!allowsHero(creationOptions(packs), built.record)) throw new Error("Choose one of the listed races and classes.")
    roster.putHero({ ...edited, ...built.record, sheet: built.sheet, id: `hero-${randomUUID().slice(0, 8)}`, type: "pc", effects: [] })
    return {}
  }
  const pack = command.adventure ? packs[command.adventure] : undefined
  const built = buildHero(command.making)
  if ("problems" in built) throw new Error(`These choices do not make a legal hero: ${built.problems.join(". ")}.`)
  if (!allowsHero(pack?.artifacts.manifest.availableCharacterOptions ?? creationOptions(packs), built.record)) throw new Error("Choose one of the listed races and classes.")
  const { hero, arrival } = await makeHero(llm, command, command.making, pack && heroAdventure(pack), command.hook)
  return {
    draft: {
      ...hero,
      image: "",
      type: "pc",
      effects: [],
      ...(arrival && pack ? { arrivals: { [pack.artifacts.manifest.adventureId]: arrival } } : {}),
    },
  }
}

// What a hero made for an adventure knows of it: its teaser, and with hooks the opening scene they arrive in.
export function heroAdventure(pack: Pack) {
  const m = pack.artifacts.manifest
  const opening = m.heroHooks?.length ? pack.artifacts.encounters[m.startEncounterId]?.sections.intro : undefined
  return { title: m.title, teaser: m.teaser, hooks: m.heroHooks, opening }
}

// Writes the arrival each chosen roster hero lacks for an adventure with hooks, such as a hero made from the Characters
// page, one call per hero with the hook the GM picks. It is kept on the roster hero, so the next start needs no call.
// A failed call leaves the hero without one: the opening scene's notes cover heroes it does not name.
export async function writeArrivals(pack: Pack, ids: string[], roster: Roster, llm: Llm) {
  const m = pack.artifacts.manifest
  const { hooks, opening, ...adventure } = heroAdventure(pack)
  if (!hooks || !opening) return
  const missing = roster.heroes().filter((h) => ids.includes(h.id) && !h.arrivals?.[m.adventureId])
  // One at a time: a CLI session answers one request at a time.
  for (const hero of missing) {
    try {
      const arrival = await writeArrival(llm, hero, { ...adventure, hooks, opening })
      roster.putHero({ ...hero, arrivals: { ...hero.arrivals, [m.adventureId]: arrival } })
    } catch (error) {
      console.warn(`No arrival for ${hero.name}:`, error)
    }
  }
}

export type PartyChoice = { id: string; ai: boolean }
/** A hero's rules sheet as their last level left it. */
export type KeptHero = { sheet: Sheet }
// Checks a new game's party against the adventure and resolves each hero's sheet. Premades come from the adventure.
// Roster heroes are copied in, so later roster changes never alter a running adventure.
// A premade whose levels the player holds comes with the rules sheet those levels left, `kept`.
export function partyFor(pack: Pack, choices: PartyChoice[], roster: Hero[], kept: Record<string, KeptHero> = {}) {
  const m = pack.artifacts.manifest
  const [min, max] = [m.minPlayers ?? 1, m.maxPlayers ?? choices.length]
  if (new Set(choices.map((c) => c.id)).size !== choices.length) throw new Error("A hero can join the party only once.")
  if (choices.length < min || choices.length > max) throw new Error(min === max ? `${m.title} needs ${min} ${min === 1 ? "hero" : "heroes"}.` : `${m.title} needs ${min} to ${max} heroes.`)
  if (choices.every((c) => c.ai)) throw new Error("Play at least one hero yourself.")
  const sheets: Record<string, PCTemplate> = {}
  // The paragraphs that show created heroes in the opening scene.
  const arrivals: Record<string, string> = {}
  const figures: Record<string, string> = {}
  const painted: string[] = []
  for (const choice of choices) {
    if (m.premadeCharacterIds.includes(choice.id)) {
      const premade = pack.artifacts.characterSheets.premadeCharacters[choice.id]?.sheet
      if (premade && kept[choice.id]) sheets[choice.id] = { ...premade, sheet: kept[choice.id].sheet }
      continue
    }
    const hero = roster.find((h) => h.id === choice.id)
    if (!hero) throw new Error("That hero is not in your roster.")
    if (!playableHero(hero)) throw new Error(`${hero.name} has no rules sheet.`)
    const options = m.availableCharacterOptions
    if (!options) throw new Error(`${m.title} is played with its own heroes.`)
    if (!options.races.includes(hero.race) || !options.archetypes.includes(hero.archetype))
      throw new Error(`${hero.name} cannot join ${m.title}. It allows ${options.races.join(", ")} heroes who are ${options.archetypes.join(", ")}.`)
    const { figure, painted: art, arrivals: byAdventure, ...sheet } = hero
    // Why they came goes on their background, and what others see of them on their appearance.
    const arrival = byAdventure?.[m.adventureId]
    if (arrival) arrivals[hero.id] = arrival.intro
    sheets[hero.id] = withArrival(sheet, arrival)
    figures[hero.id] = figure
    if (art) painted.push(hero.id)
  }
  return {
    players: choices.map((c) => ({ characterId: c.id, userId: "local-player", ...(c.ai ? { controlledBy: "ai" as const } : {}) })),
    sheets,
    arrivals,
    figures,
    painted,
  }
}
