"use server"

import { auth } from "@clerk/nextjs/server"
import { heroDraftPrompt } from "@d20/gm-core/character/hero-draft"
import { createServerCore } from "@/lib/gm-server/core"
import { heroCreation } from "@/lib/heroes/creation"
import type { PCTemplate } from "@/types/character"

const clip = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max)

// Drafts a whole hero in one call from race, class, name and the player's idea, for the adventure they are made for.
// Their arrival is not written here: in a hosted game the host's GM writes it once the hero takes a seat.
export async function draftHero(input: { planId?: string; race: string; archetype: string; name: string; gender?: string; idea?: string; hook?: string }): Promise<{ draft?: PCTemplate; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { error: "Sign in to create a hero." }
  const { options, adventure } = await heroCreation(input.planId)
  if (!options.races.includes(input.race) || !options.archetypes.includes(input.archetype)) return { error: "Choose one of the listed races and classes." }
  const hero = { name: clip(input.name, 80), race: input.race, archetype: input.archetype, gender: clip(input.gender, 40), idea: clip(input.idea, 600) }
  if (!hero.name) return { error: "Give your hero a name." }
  const result = await createServerCore().generateCharacterAction({ characterType: "pc", prompt: heroDraftPrompt(hero, adventure && { title: adventure.title, teaser: adventure.teaser }, clip(input.hook, 300)) })
  if (!result.success || !result.character) return { error: result.error ?? "The hero could not be created. Retry." }
  const c = result.character as PCTemplate
  return {
    draft: {
      ...c,
      name: hero.name,
      race: hero.race,
      archetype: hero.archetype,
      gender: hero.gender || c.gender,
      image: "",
      type: "pc",
      healthPercent: 100,
      effects: [],
      spells: (c.spells ?? []).map((s) => ({ name: s.name, description: s.description })),
    },
  }
}
