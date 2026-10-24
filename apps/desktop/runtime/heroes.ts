import { randomUUID } from "node:crypto"
import type { GmPorts, Llm } from "@d20/gm-core"
import { createGenerateCharacterAction } from "@d20/gm-core/character/generate-character-action"
import { authoredText } from "@d20/gm-core/story/authored"
import { type PCTemplate, pcTemplateSchema } from "@d20/gm-core/types/character"
import { z } from "zod"
import { STOCK_FIGURES } from "../src/figures"
import type { Pack, Packs } from "./game"
import { PAINTERS, paint, readArt, storeArt } from "./paint"

const text = (max: number) => z.string().trim().max(max)
// How a hero comes into one adventure: why they came, for their sheet, the paragraph that shows them in its opening
// scene, and the one thing others there can see and ask about.
const arrivalSchema = z.object({ reason: text(400).min(1), intro: text(600).min(1), tell: text(200).min(1) })
export type Arrival = z.infer<typeof arrivalSchema>
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
export const heroCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("heroDraft"),
    provider,
    race: text(40).min(1),
    archetype: text(40).min(1),
    name: text(80).min(1),
    gender: text(40).optional(),
    idea: text(600).optional(),
    adventure: text(100).optional(),
    // Why the hero came, from the adventure's hooks or the player's own words.
    hook: text(300).optional(),
  }),
  // A new hero arrives without an id.
  z.object({ kind: z.literal("saveHero"), hero: heroSchema.extend({ id: heroSchema.shape.id.optional() }) }),
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
  const { races, archetypes } = creationOptions(packs)
  const hero = command.kind === "saveHero" ? command.hero : command
  if (!races.includes(hero.race) || !archetypes.includes(hero.archetype)) throw new Error("Choose one of the listed races and classes.")
  if (command.kind === "saveHero") {
    const { id, ...rest } = command.hero
    if (id && !roster.heroes().some((h) => h.id === id)) throw new Error("That hero is no longer in your roster.")
    roster.putHero({ ...rest, id: id ?? `hero-${randomUUID().slice(0, 8)}`, type: "pc", healthPercent: 100, effects: [] })
    return {}
  }
  const pack = command.adventure ? packs[command.adventure] : undefined
  const manifest = pack?.artifacts.manifest
  // An adventure with hooks has the hero arrive in its opening scene, written in the same call.
  const opening = manifest?.heroHooks?.length ? pack?.artifacts.encounters[manifest.startEncounterId]?.sections.intro : undefined
  const { generateCharacterAction } = createGenerateCharacterAction({ llm } as GmPorts)
  const result = await generateCharacterAction({
    characterType: "pc",
    prompt: [
      `${command.name}, a ${[command.gender, command.race, command.archetype].filter(Boolean).join(" ")}, a hero of the Realm of Myr, a medieval fantasy world.`,
      command.idea ? `The player's idea for them: ${command.idea}` : "",
      manifest ? `They are about to set out on ${manifest.title}${manifest.teaser ? `: ${manifest.teaser}` : "."}` : "",
      "Keep the given name, race and class. Write appearance, personality, background and motivation as two or three vivid sentences each, plus a short behavior note on how they act in play. A spellcaster has two to four spells. Others have none. Equipment items have one-sentence descriptions.",
      manifest?.heroHooks && opening ? arrivalPrompt(manifest.heroHooks, opening, command.hook) : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ...(opening ? { extend: { arrival: arrivalSchema } } : {}),
  })
  if (!result.success || !result.character) throw new Error(result.error ?? "The hero could not be created. Retry.")
  const { arrival, ...c } = result.character as PCTemplate & { arrival?: Arrival }
  return {
    draft: {
      ...c,
      name: command.name,
      race: command.race,
      archetype: command.archetype,
      gender: command.gender || c.gender,
      image: "",
      type: "pc",
      healthPercent: 100,
      effects: [],
      spells: (c.spells ?? []).map((s) => ({ name: s.name, description: s.description })),
      ...(arrival && manifest ? { arrivals: { [manifest.adventureId]: arrival } } : {}),
    },
  }
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

// Writes the arrival each chosen roster hero lacks for an adventure with hooks, such as a hero made from the Characters
// page, one call per hero with the hook the GM picks. It is kept on the roster hero, so the next start needs no call.
// A failed call leaves the hero without one: the opening scene's notes cover heroes it does not name.
export async function writeArrivals(pack: Pack, ids: string[], roster: Roster, llm: Llm) {
  const m = pack.artifacts.manifest
  const opening = m.heroHooks?.length ? pack.artifacts.encounters[m.startEncounterId]?.sections.intro : undefined
  if (!m.heroHooks || !opening) return
  const hooks = m.heroHooks
  const missing = roster.heroes().filter((h) => ids.includes(h.id) && !h.arrivals?.[m.adventureId])
  // One at a time: a CLI session answers one request at a time.
  for (const hero of missing) {
    const prompt = [
      `${hero.name}, a ${[hero.gender, hero.race, hero.archetype].filter(Boolean).join(" ")}, a hero of the Realm of Myr, a medieval fantasy world, is about to set out on ${m.title}${m.teaser ? `: ${m.teaser}` : "."}`,
      `Appearance: ${hero.appearance}`,
      hero.personality ? `Personality: ${hero.personality}` : "",
      hero.background ? `Background: ${hero.background}` : "",
      hero.motivation ? `Motivation: ${hero.motivation}` : "",
      arrivalPrompt(hooks, opening),
    ]
      .filter(Boolean)
      .join("\n")
    try {
      const { object } = await llm.generateObject({ prompt, schema: arrivalSchema })
      roster.putHero({ ...hero, arrivals: { ...hero.arrivals, [m.adventureId]: object } })
    } catch (error) {
      console.warn(`No arrival for ${hero.name}:`, error)
    }
  }
}

export type PartyChoice = { id: string; ai: boolean }
// Checks a new game's party against the adventure and resolves each hero's sheet. Premades come from the adventure.
// Roster heroes are copied in, so later roster changes never alter a running adventure.
export function partyFor(pack: Pack, choices: PartyChoice[], roster: Hero[]) {
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
    if (m.premadeCharacterIds.includes(choice.id)) continue
    const hero = roster.find((h) => h.id === choice.id)
    if (!hero) throw new Error("That hero is not in your roster.")
    const options = m.availableCharacterOptions
    if (!options) throw new Error(`${m.title} is played with its own heroes.`)
    if (!options.races.includes(hero.race) || !options.archetypes.includes(hero.archetype))
      throw new Error(`${hero.name} cannot join ${m.title}. It allows ${options.races.join(", ")} heroes who are ${options.archetypes.join(", ")}.`)
    const { figure, painted: art, arrivals: byAdventure, ...sheet } = hero
    // Why they came goes on their background, and what others see of them on their appearance.
    const arrival = byAdventure?.[m.adventureId]
    if (arrival) arrivals[hero.id] = arrival.intro
    sheets[hero.id] = arrival ? { ...sheet, background: [sheet.background, arrival.reason].filter(Boolean).join(" "), appearance: [sheet.appearance, arrival.tell].filter(Boolean).join(" ") } : sheet
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
