"use client"

import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { type ReactNode, useRef } from "react"
import { ModuleCover } from "@d20/ui/adventure/module-cover"
import AccountRequired from "@/components/nav/account-required"
import type { AdventurePlan } from "@/types/adventure-plan"

// How long the intro waits for the cover painting before it enters without it.
const ART_WAIT_MS = 400

// A signed-out guest's invite: the adventure's cover, its first sentence and sign in, with nothing to scroll past.
export function InviteSignIn(props: { plan: AdventurePlan; redirectUrl: string }) {
  return (
    <LobbyIntro plan={props.plan}>
      <div data-intro="sign-in">
        <AccountRequired redirectUrl={props.redirectUrl} className="md:justify-start" />
      </div>
    </LobbyIntro>
  )
}

// An adventure's lobby on any screen: one column on a phone, and a two-column spread on a laptop with the cover and
// first sentence pinned beside the party and heroes. Each piece enters in turn with transforms and opacity only.
export function LobbyIntro(props: { plan: AdventurePlan; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const teaser = /^.*?[.!?](?=\s|$)/.exec(props.plan.teaser)?.[0] ?? props.plan.teaser

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const q = gsap.utils.selector(root)
      // Start values are set before the first paint. The timeline plays once the painting decodes, or after a short wait.
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", overwrite: "auto" } })
      // The painting settles slowly behind the rest. What the guest reads and presses is in within half a second.
      tl.from(q("figure"), { autoAlpha: 0, y: 24, scale: 0.97, duration: 0.45 })
        .from(q('[data-intro="art"]'), { scale: 1.08, duration: 1.2, ease: "power2.out" }, 0)
        .from(q('[data-intro="shade"]'), { autoAlpha: 0, duration: 0.4 }, 0.08)
        .from(q('[data-intro="title"]'), { autoAlpha: 0, y: 14, duration: 0.35 }, 0.12)
        .from(q('[data-intro="players"]'), { autoAlpha: 0, y: 8, duration: 0.3 }, 0.18)
        .from(q('[data-intro="teaser"]'), { autoAlpha: 0, y: 12, duration: 0.3 }, 0.22)
        .from(q('[data-intro="rest"] > *'), { autoAlpha: 0, y: 16, duration: 0.3, stagger: 0.05 }, 0.26)
        .from(q('[data-intro="sign-in"] h2, [data-intro="sign-in"] button'), { autoAlpha: 0, y: 8, duration: 0.25, stagger: 0.05 }, 0.3)
        .eventCallback("onComplete", () => {
          gsap.set(q('figure, [data-intro], [data-intro="rest"] > *, [data-intro="sign-in"] h2, [data-intro="sign-in"] button'), { clearProps: "transform,opacity,visibility" })
        })
      let live = true
      const start = () => {
        if (live && !tl.isActive() && tl.progress() === 0) tl.play()
      }
      const timer = setTimeout(start, ART_WAIT_MS)
      const art = q('[data-intro="art"]')[0] as HTMLImageElement | undefined
      if (art) art.decode().then(start, start)
      else start()
      return () => {
        live = false
        clearTimeout(timer)
      }
    },
    { scope: root }
  )

  return (
    <div ref={root} className="mx-auto min-h-screen w-full max-w-6xl px-4 pt-20 pb-12 sm:px-6 md:px-8 md:pt-24">
      <div className="grid gap-6 md:grid-cols-[minmax(260px,340px)_1fr] md:items-start md:gap-8 lg:gap-10">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 md:sticky md:top-24 md:mx-0 md:max-w-none">
          <ModuleCover id={props.plan.id} title={props.plan.title} players={props.plan.party} className="border border-white/15" />
          <p data-intro="teaser" className="pl-1 text-left text-white/80">
            {teaser}
          </p>
        </div>
        <div data-intro="rest" className="mx-auto w-full min-w-0 max-w-sm md:mx-0 md:max-w-none">
          {props.children}
        </div>
      </div>
    </div>
  )
}
