"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { type ReactNode, useRef } from "react"
import { ModuleCover } from "@/components/adventure/module-cover"
import AccountRequired from "@/components/nav/account-required"
import type { AdventurePlan } from "@/types/adventure-plan"

gsap.registerPlugin(useGSAP)

// How long the intro waits for the cover painting before it enters without it.
const ART_WAIT_MS = 700

// A signed-out guest's invite: the adventure's cover, its first sentence and sign in, with nothing to scroll past.
export function InviteSignIn(props: { plan: AdventurePlan; redirectUrl: string }) {
  return (
    <LobbyIntro plan={props.plan}>
      <div data-intro="sign-in">
        <AccountRequired redirectUrl={props.redirectUrl} />
      </div>
    </LobbyIntro>
  )
}

// An adventure's lobby on any screen: its cover and first sentence over what follows, in one narrow column.
// Each piece enters in turn. Only transforms and opacity move, so nothing shifts the layout.
export function LobbyIntro(props: { plan: AdventurePlan; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const teaser = /^.*?[.!?](?=\s|$)/.exec(props.plan.teaser)?.[0] ?? props.plan.teaser

  useGSAP(
    () => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const q = gsap.utils.selector(root)
      // Start values are set before the first paint. The timeline plays once the painting decodes, or after a short wait.
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", overwrite: "auto" } })
      tl.from(q("figure"), { autoAlpha: 0, y: 24, scale: 0.97, duration: 0.9 })
        .from(q('[data-intro="art"]'), { scale: 1.08, duration: 1.6, ease: "power2.out" }, 0)
        .from(q('[data-intro="shade"]'), { autoAlpha: 0, duration: 0.8 }, 0.2)
        .from(q('[data-intro="title"]'), { autoAlpha: 0, y: 14, duration: 0.8 }, 0.4)
        .from(q('[data-intro="players"]'), { autoAlpha: 0, y: 8, duration: 0.6 }, 0.65)
        .from(q('[data-intro="teaser"]'), { autoAlpha: 0, y: 12, duration: 0.7 }, 0.8)
        .from(q('[data-intro="rest"] > *'), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.12 }, 0.95)
        .from(q('[data-intro="sign-in"] h2, [data-intro="sign-in"] button'), { autoAlpha: 0, y: 8, duration: 0.5, stagger: 0.1 }, 1.1)
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
    <div ref={root} className="flex min-h-screen flex-col items-center gap-5 px-4 pt-20 pb-10">
      <ModuleCover id={props.plan.id} title={props.plan.title} players={props.plan.party} className="max-w-sm" />
      <p data-intro="teaser" className="w-full max-w-sm pl-2 text-left text-white/80">
        {teaser}
      </p>
      <div data-intro="rest" className="w-full max-w-sm">
        {props.children}
      </div>
    </div>
  )
}
