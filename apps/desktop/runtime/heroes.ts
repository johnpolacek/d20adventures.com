import { randomUUID } from "node:crypto"
import type { GmPorts, Llm } from "@d20/gm-core"
import { createGenerateCharacterAction } from "@d20/gm-core/character/generate-character-action"
import { type PCTemplate, pcTemplateSchema } from "@d20/gm-core/types/character"
import { z } from "zod"
import { STOCK_FIGURES } from "../src/figures"
import type { Pack, Packs } from "./game"
import { PAINTERS, paint, readArt, storeArt } from "./paint"

// A hero in the local roster: a player character sheet and the stock figure that stands for them. `painted` heroes
// stand as the art painted for them instead, while it exists.
export const heroSchema = pcTemplateSchema.extend({
  id: z.string().regex(/^hero-[a-z0-9-]{4,40}$/),
  figure: z.string().refine((id) => id in STOCK_FIGURES, "Unknown figure."),
  painted: z.boolean().optional(),
})
export type Hero = z.infer<typeof heroSchema>
const provider = z.enum(["claude", "codex", "grok", "gemini"])
const text = (max: number) => z.string().trim().max(max)
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
  const manifest = command.adventure ? packs[command.adventure]?.artifacts.manifest : undefined
  const { generateCharacterAction } = createGenerateCharacterAction({ llm } as GmPorts)
  const result = await generateCharacterAction({
    characterType: "pc",
    prompt: [
      `${command.name}, a ${[command.gender, command.race, command.archetype].filter(Boolean).join(" ")}, a hero of the Realm of Myr, a medieval fantasy world.`,
      command.idea ? `The player's idea for them: ${command.idea}` : "",
      manifest ? `They are about to set out on ${manifest.title}${manifest.teaser ? `: ${manifest.teaser}` : "."}` : "",
      "Keep the given name, race and class. Write appearance, personality, background and motivation as two or three vivid sentences each, plus a short behavior note on how they act in play. A spellcaster has two to four spells. Others have none. Equipment items have one-sentence descriptions.",
    ]
      .filter(Boolean)
      .join("\n"),
  })
  if (!result.success || !result.character) throw new Error(result.error ?? "The hero could not be created. Retry.")
  const c = result.character as PCTemplate
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
    },
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
    const { figure, painted: art, ...sheet } = hero
    sheets[hero.id] = sheet
    figures[hero.id] = figure
    if (art) painted.push(hero.id)
  }
  return {
    players: choices.map((c) => ({ characterId: c.id, userId: "local-player", ...(c.ai ? { controlledBy: "ai" as const } : {}) })),
    sheets,
    figures,
    painted,
  }
}
