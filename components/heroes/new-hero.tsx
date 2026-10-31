"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import slugify from "slugify"
import { toast } from "sonner"
import { draftHero } from "@/app/_actions/hero-draft"
import { joinAdventure, requestSeat } from "@/app/_actions/join-adventure"
import { saveCharacterTemplateAction } from "@/app/_actions/save-character-template"
import type { HeroDraft } from "@/apps/desktop/runtime/heroes"
import { heroFigure } from "@/apps/desktop/src/figures"
import { HeroCreator, type HeroIdea } from "@/apps/desktop/src/hero-creator"
import type { HeroCreation } from "@/lib/heroes/creation"
import type { PCTemplate } from "@/types/character"

// The lobby a hero is made from: it joins that game once saved, then the player goes back to the lobby's link.
export type HeroLobby = { href: string; settingId: string; planId: string; adventureId: string; hosted: boolean }

// The website's hero creator: the app's, with the races, classes and hooks of the adventure it is made for. In a hosted
// game the hero takes an open seat with the hook the player chose, for the host's GM to write their arrival.
export function NewHero({ creation, lobby }: { creation: HeroCreation; lobby?: HeroLobby }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hook = useRef("")
  const leave = () => (lobby ? router.push(lobby.href) : router.back())

  const onDraft = async (idea: HeroIdea) => {
    setBusy(true)
    hook.current = idea.hook.trim()
    const { draft, error } = await draftHero({ ...idea, planId: creation.adventure?.planId }).catch(() => ({ draft: undefined, error: "The hero could not be created. Retry." }))
    setBusy(false)
    if (error) toast.error(error)
    return draft && { ...draft, gender: draft.gender ?? "" }
  }

  const onSave = async ({ figure: _f, painted: _p, arrivals: _a, ...hero }: HeroDraft & { figure: string; painted?: boolean }) => {
    setBusy(true)
    try {
      // Until the stage reads a chosen figure, the hero's portrait is the stock figure it stands as.
      const image = heroFigure({ id: hero.name, race: hero.race, gender: hero.gender }).art.portrait
      const saved = await saveCharacterTemplateAction({ character: { ...hero, id: slugify(hero.name, { lower: true, strict: true }), image } as PCTemplate })
      if (!saved.success || !saved.characterId) {
        toast.error(saved.error ?? "The hero could not be saved.")
        return false
      }
      if (!lobby) {
        router.push("/player")
        return true
      }
      if (lobby.hosted) {
        const { error } = await requestSeat({ adventureId: lobby.adventureId, characterId: saved.characterId, hook: hook.current || undefined })
        if (error) toast.error(`${hero.name} is saved, but ${error.charAt(0).toLowerCase()}${error.slice(1)}`)
        window.location.href = lobby.href
        return true
      }
      await joinAdventure({ settingId: lobby.settingId, adventurePlanId: lobby.planId, adventureId: lobby.adventureId, characterId: saved.characterId })
      return true
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 min-h-screen">
      <HeroCreator
        options={creation.options}
        adventure={creation.adventure?.hooks?.length ? { id: creation.adventure.planId, hooks: creation.adventure.hooks } : undefined}
        figures={false}
        busy={busy}
        onDraft={onDraft}
        onSave={onSave}
        onClose={leave}
      />
    </div>
  )
}
