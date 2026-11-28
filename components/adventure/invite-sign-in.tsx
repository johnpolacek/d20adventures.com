"use client"

import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { served } from "@d20/stage/served"
import { type ReactNode, useRef, useState } from "react"
import { ModuleCover, playersLine } from "@d20/ui/adventure/module-cover"
import { Button } from "@d20/ui/button"
import { siteLabel } from "@d20/ui/site"
import { Heading } from "@d20/ui/typography/heading"
import type { AdventurePlan } from "@/types/adventure-plan"

// How long the intro waits for the cover painting before it enters without it.
const ART_WAIT_MS = 400

// A signed-out guest's invite: the adventure's stage banner and cover over a clean sign-in panel.
export function InviteSignIn(props: { plan: AdventurePlan; redirectUrl: string }) {
  const rememberRedirect = () => {
    if (props.redirectUrl && typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterSignIn", props.redirectUrl)
    }
  }

  return (
    <LobbyIntro plan={props.plan}>
      <div
        data-intro="sign-in"
        className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b10]/95 shadow-[0_0_0_5px_rgba(0,0,0,0.78),0_24px_60px_rgba(0,0,0,0.85)]"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 stage-grain opacity-40" />
        <div className="relative p-5 sm:p-6">
          <div className="rounded-xl border border-white/10 bg-black/45 p-6 text-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
            <div className={siteLabel}>Table Invite</div>
            <Heading variant="h2" className="mt-2">
              Sign in to Choose Your Hero
            </Heading>
            <p className="mx-auto mt-2 max-w-md font-serif text-sm leading-relaxed text-zinc-300/90">
              Create a free account or sign in to claim an open seat and join this adventure.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
              <SignInButton mode="modal">
                <Button size="default" variant="epic" className="scale-100 hover:scale-[1.02]" onClick={rememberRedirect}>
                  Sign in to Join
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="default" variant="outline" onClick={rememberRedirect}>
                  Create Account
                </Button>
              </SignUpButton>
            </div>
          </div>
        </div>
      </div>
    </LobbyIntro>
  )
}

// An adventure's lobby shell: a cinematic stage banner with the opening scene art, overlapping module cover,
// title, first sentence, and optional party medallions on the right — over the hero gallery or lobby body below.
export function LobbyIntro(props: { plan: AdventurePlan; bannerRight?: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const teaser = /^.*?[.!?](?=\s|$)/.exec(props.plan.teaser)?.[0] ?? props.plan.teaser
  const sceneSrc = props.plan.start ? served(`/stage/art/${props.plan.id}/${props.plan.start}.webp`) : null
  const coverSrc = served(`/stage/covers/${props.plan.id}.jpg`)
  const [sceneFailed, setSceneFailed] = useState(false)
  const bannerBg = sceneSrc && !sceneFailed ? sceneSrc : coverSrc

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const q = gsap.utils.selector(root)
      // Start values are set before the first paint. The timeline plays once the cover decodes, or after a short wait.
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", overwrite: "auto" } })
      tl.from(q("figure"), { autoAlpha: 0, y: 20, scale: 0.97, duration: 0.42 })
        .from(q('[data-intro="art"]'), { scale: 1.07, duration: 1.1, ease: "power2.out" }, 0)
        .from(q('[data-intro="shade"]'), { autoAlpha: 0, duration: 0.35 }, 0.06)
        .from(q('[data-intro="title"]'), { autoAlpha: 0, y: 10, duration: 0.32 }, 0.1)
        .from(q('[data-intro="players"]'), { autoAlpha: 0, y: 6, duration: 0.28 }, 0.14)
        .from(q('[data-intro="meta"]'), { autoAlpha: 0, y: 12, duration: 0.34 }, 0.12)
        .from(q('[data-intro="medallions"]'), { autoAlpha: 0, y: 12, duration: 0.34 }, 0.18)
        .from(q('[data-intro="rest"] > *'), { autoAlpha: 0, y: 16, duration: 0.32, stagger: 0.05 }, 0.22)
        .from(q('[data-intro="sign-in"] h2, [data-intro="sign-in"] button'), { autoAlpha: 0, y: 8, duration: 0.25, stagger: 0.05 }, 0.26)
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
    <div ref={root} className="min-h-screen w-full bg-[#07070b] text-white">
      {/* Cinematic Stage Banner */}
      <section className="relative overflow-hidden border-b border-white/10 pt-16 sm:pt-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <img
            src={bannerBg}
            alt=""
            onError={() => {
              if (!sceneFailed) setSceneFailed(true)
            }}
            className="h-full w-full object-cover object-[50%_38%] opacity-40 saturate-110"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07070b]/92 via-[#07070b]/68 to-[#07070b]/88" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#07070b]/35 via-transparent to-[#07070b]" />
          <div className="absolute inset-0 stage-grain opacity-30" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-8">
          <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-7 lg:grid-cols-[164px_minmax(0,1fr)_auto]">
            <ModuleCover
              id={props.plan.id}
              title={props.plan.title}
              players={props.plan.party}
              className="border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)]"
            />
            <div data-intro="meta" className="min-w-0">
              <div className={siteLabel}>
                Adventure Lobby · <span className="whitespace-nowrap">{playersLine(props.plan.party)}</span>
              </div>
              <Heading variant="h1" className="mt-1.5 text-2xl sm:text-3xl lg:text-4xl [text-shadow:0_2px_18px_rgba(0,0,0,0.9)]">
                {props.plan.title}
              </Heading>
              <p className="mt-2 max-w-[54ch] font-serif text-sm leading-relaxed text-zinc-200/85 sm:text-base">
                {teaser}
              </p>
            </div>
            {props.bannerRight && (
              <div data-intro="medallions" className="col-span-2 border-t border-white/10 pt-4 lg:col-span-1 lg:border-t-0 lg:pt-0">
                {props.bannerRight}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Gallery & Lobby Controls */}
      <div data-intro="rest" className="mx-auto w-full max-w-6xl px-4 pt-7 pb-16 sm:px-6 md:px-8">
        {props.children}
      </div>
    </div>
  )
}
