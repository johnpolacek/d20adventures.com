"use client"

import type { HeroConcept } from "@d20/gm-core/character/hero-draft"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import slugify from "slugify"
import { toast } from "@d20/ui/toast"
import { draftHero, generateHeroIdea } from "@/app/_actions/hero-draft"
import { joinAdventure, requestSeat } from "@/app/_actions/join-adventure"
import { saveCharacterTemplateAction } from "@/app/_actions/save-character-template"
import type { HeroDraft } from "@/apps/desktop/runtime/heroes"
import { heroFigure } from "@/apps/desktop/src/figures"
import { HeroCreator, type HeroIdea, type HeroMaking } from "@/apps/desktop/src/hero-creator"
import type { HeroCreation } from "@/lib/heroes/creation"
import type { PCTemplate } from "@/types/character"

// The lobby a hero is made from: it joins that game once saved, then the player goes back to the lobby's link.
export type HeroLobby = { href: string; settingId: string; planId: string; adventureId: string; hosted: boolean }

const POLL_INTERVAL_MS = 900
const HOST_GENERATE_TIMEOUT_MS = 60_000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })

// The website's hero creator: the app's, with the races, classes and hooks of the adventure it is made for. In a hosted
// game the hero takes an open seat with the hook the player chose, for the host's GM to write their arrival.
export function NewHero({
  creation,
  lobby,
  inline,
  onClose,
  onPendingSeat,
}: {
  creation: HeroCreation
  lobby?: HeroLobby
  /** Renders inline on the lobby page without navigating away. */
  inline?: boolean
  onClose?: () => void
  /** Called in inline hosted lobbies when the hero was saved and is now waiting on host approval. */
  onPendingSeat?: (name: string) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hook = useRef("")
  const generateAbort = useRef<AbortController | null>(null)

  useEffect(() => () => generateAbort.current?.abort(), [])

  const leave = () => {
    generateAbort.current?.abort()
    if (onClose) return onClose()
    if (lobby) router.push(lobby.href)
    else router.back()
  }

  // Generates a starting name and background. In a hosted game this runs on the GM Host's AI via gmJobs.
  const onGenerate = async (input: { race: string; archetype: string; gender?: string; hook?: string }): Promise<HeroConcept | undefined> => {
    generateAbort.current?.abort()
    const controller = new AbortController()
    generateAbort.current = controller

    if (lobby?.hosted) {
      try {
        const startRes = await fetch(`/api/adventure/${lobby.adventureId}/hero-idea`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        })
        const startJson = (await startRes.json().catch(() => ({}))) as { jobId?: string; hostOnline?: boolean; error?: string }
        if (!startRes.ok || !startJson.jobId) {
          toast.error(startJson.error ?? "Could not reach the GM Host.")
          return undefined
        }
        if (startJson.hostOnline === false) {
          toast("Waiting for the GM Host's app to come online…")
        }

        const deadline = Date.now() + HOST_GENERATE_TIMEOUT_MS
        while (!controller.signal.aborted && Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS, controller.signal)
          if (controller.signal.aborted) return undefined
          const pollRes = await fetch(`/api/adventure/${lobby.adventureId}/hero-idea?jobId=${encodeURIComponent(startJson.jobId)}`, {
            cache: "no-store",
            signal: controller.signal,
          })
          const pollJson = (await pollRes.json().catch(() => ({}))) as { status?: string; heroConcept?: HeroConcept; error?: string }
          if (!pollRes.ok) {
            toast.error(pollJson.error ?? "Could not generate a hero idea.")
            return undefined
          }
          if (pollJson.status === "done" && pollJson.heroConcept) {
            return pollJson.heroConcept
          }
          if (pollJson.status === "failed") {
            toast.error(pollJson.error ?? "The GM Host could not generate a hero idea.")
            return undefined
          }
        }
        if (!controller.signal.aborted) {
          toast.error("The GM Host didn't respond in time. Make sure the host has D20 Adventures open.")
        }
        return undefined
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "Could not reach the GM Host.")
        }
        return undefined
      }
    }

    const { concept, error } = await generateHeroIdea({ ...input, planId: creation.adventure?.planId }).catch(() => ({
      concept: undefined,
      error: "Could not generate a hero idea right now. Retry.",
    }))
    if (error) toast.error(error)
    return concept
  }

  const onDraft = async (idea: HeroIdea, making: HeroMaking) => {
    setBusy(true)
    hook.current = idea.hook.trim()
    const { draft, error } = await draftHero({ ...idea, making, planId: creation.adventure?.planId }).catch(() => ({ draft: undefined, error: "The hero could not be created. Retry." }))
    setBusy(false)
    if (error) toast.error(error)
    return draft && { ...draft, gender: draft.gender ?? "" }
  }

  const onSave = async ({ figure: _f, painted: _p, arrivals: _a, ...hero }: HeroDraft & { figure: string; painted?: boolean }, making?: HeroMaking) => {
    if (!making) return false
    setBusy(true)
    try {
      // Until the stage reads a chosen figure, the hero's portrait is the stock figure it stands as.
      const image = heroFigure({ id: hero.name, race: hero.race, gender: hero.gender }).art.portrait
      const saved = await saveCharacterTemplateAction({ character: { ...hero, id: slugify(hero.name, { lower: true, strict: true }), image } as PCTemplate, making })
      if (!saved.success || !saved.characterId) {
        toast.error(saved.error ?? "The hero could not be saved.")
        return false
      }
      if (!lobby) {
        router.push("/player")
        return true
      }
      if (lobby.hosted) {
        const { seated, error } = await requestSeat({ adventureId: lobby.adventureId, characterId: saved.characterId, hook: hook.current || undefined })
        if (error) toast.error(`${hero.name} is saved, but ${error.charAt(0).toLowerCase()}${error.slice(1)}`)
        if (inline && !seated && !error && onPendingSeat) {
          onPendingSeat(hero.name)
          return true
        }
        if (inline) {
          window.location.replace(window.location.pathname + window.location.search)
          return true
        }
        window.location.href = lobby.href
        return true
      }
      await joinAdventure({ settingId: lobby.settingId, adventurePlanId: lobby.planId, adventureId: lobby.adventureId, characterId: saved.characterId })
      return true
    } finally {
      setBusy(false)
    }
  }

  const creator = (
    <HeroCreator
      options={creation.options}
      adventure={
        creation.adventure && (creation.adventure.hooks?.length || creation.adventure.hookPrompt)
          ? { id: creation.adventure.planId, hooks: creation.adventure.hooks ?? [], hookPrompt: creation.adventure.hookPrompt }
          : undefined
      }
      figures={false}
      inline={inline}
      saveLabel={lobby ? "Save & Join Table" : "Save Hero"}
      busy={busy}
      onGenerate={onGenerate}
      onDraft={onDraft}
      onSave={onSave}
      onClose={leave}
    />
  )

  if (inline) return creator

  return <div className="relative z-10 min-h-screen">{creator}</div>
}
