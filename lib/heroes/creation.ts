import type { HeroAdventure } from "@d20/gm-core/character/hero-draft"
import { getLocalWikiAdventuresForSetting, isLocalWikiAdventure, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

// Server only. What a hero can be made as on the website: for one adventure, its races, classes and hooks, and
// otherwise every race and class the setting's adventures allow, as the app offers them.

const SETTING = "realm-of-myr"

export type HeroOptions = { races: string[]; archetypes: string[] }
export type HeroCreation = { options: HeroOptions; adventure?: HeroAdventure & { planId: string } }

export async function heroCreation(planId?: string): Promise<HeroCreation> {
  if (planId && isLocalWikiAdventure(SETTING, planId)) {
    const m = (await loadWikiAdventureRuntime(SETTING, planId)).artifacts.manifest
    if (m.availableCharacterOptions) return { options: m.availableCharacterOptions, adventure: { planId, title: m.title, teaser: m.teaser, hooks: m.heroHooks } }
  }
  const all = await Promise.all(getLocalWikiAdventuresForSetting(SETTING).map((d) => loadWikiAdventureRuntime(SETTING, d.planId)))
  const options = all.flatMap((r) => (r.artifacts.manifest.availableCharacterOptions ? [r.artifacts.manifest.availableCharacterOptions] : []))
  return { options: { races: [...new Set(options.flatMap((o) => o.races))], archetypes: [...new Set(options.flatMap((o) => o.archetypes))] } }
}

/** Why a hero cannot join an adventure, or nothing when its race and class are allowed there. */
export async function heroMisfit(planId: string, hero: { name: string; race?: string; archetype?: string }) {
  if (!isLocalWikiAdventure(SETTING, planId)) return undefined
  const m = (await loadWikiAdventureRuntime(SETTING, planId)).artifacts.manifest
  const o = m.availableCharacterOptions
  if (!o || (hero.race && o.races.includes(hero.race) && hero.archetype && o.archetypes.includes(hero.archetype))) return undefined
  return `${hero.name} cannot join ${m.title}. It allows ${o.races.join(", ")} heroes who are ${o.archetypes.join(", ")}.`
}
