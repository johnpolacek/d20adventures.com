"use server"

import { auth } from "@clerk/nextjs/server"
import { allowsHero, buildHero, heroMakingSchema, makeHero } from "@d20/gm-core/character/hero-make"
import { createServerLlm } from "@/lib/gm-server/llm"
import { heroCreation } from "@/lib/heroes/creation"
import type { PCTemplate } from "@/types/character"

const clip = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max)

// Makes a hero from the player's rules choices, for the adventure they are made for: the engine builds the sheet, and
// one call writes the story to fit it. Nothing is saved. Their arrival is not written here: in a hosted game the
// host's GM writes it once the hero takes a seat.
export async function draftHero(input: { planId?: string; name: string; gender?: string; idea?: string; hook?: string; making: unknown }): Promise<{ draft?: PCTemplate; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { error: "Sign in to create a hero." }
  const name = clip(input.name, 80)
  if (!name) return { error: "Give your hero a name." }
  const making = heroMakingSchema.safeParse(input.making)
  if (!making.success) return { error: "Those rules choices could not be read. Choose them again." }
  const built = buildHero(making.data)
  if ("problems" in built) return { error: `These choices do not make a legal hero: ${built.problems.join(". ")}.` }
  const { options, adventure } = await heroCreation(input.planId)
  if (!allowsHero(options, built.record)) return { error: "Choose one of the listed races and classes." }
  try {
    const { hero } = await makeHero(
      createServerLlm(),
      { name, gender: clip(input.gender, 40), idea: clip(input.idea, 600) },
      making.data,
      adventure && { title: adventure.title, teaser: adventure.teaser },
      clip(input.hook, 300)
    )
    return { draft: { ...hero, id: "", image: "", type: "pc", effects: [] } }
  } catch (error) {
    console.error("[draftHero] The hero could not be written:", error)
    return { error: "The hero could not be created. Retry." }
  }
}
