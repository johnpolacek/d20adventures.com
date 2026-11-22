"use client"

import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { type ReactNode, useRef } from "react"

// How an adventure's page arrives: the cover fades in against the black page, then the title, then everything under
// it, whose buttons grow very slightly into place. Nothing else moves, and nothing plays when the page is left.
//
// The cover and the title are the header's own, found as the first picture and the first heading. What is under them
// is marked `data-enter="rest"`, and its buttons `data-enter="action"`. Until this takes over, the title and the rest
// are hidden by CSS (globals.css), which shows them again by itself after two seconds, so a page whose script never
// arrives is still read.

// How long the page waits for the cover before going on without it.
const COVER_MS = 1200

export function AdventureMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = root.current
      if (!el) return
      const art = el.querySelector<HTMLImageElement>("img")
      const title = el.querySelector<HTMLElement>("h2")
      const rest = el.querySelector<HTMLElement>('[data-enter="rest"]')
      const actions = el.querySelectorAll<HTMLElement>('[data-enter="action"]')
      const all = [art, title, rest, ...actions]
      const settle = () => {
        gsap.set(all, { clearProps: "transform,opacity,visibility" })
        el.dataset.introState = "settled"
      }
      // The CSS has already given the page back, or the reader wants no motion: it is simply there.
      const shown = rest ? getComputedStyle(rest).visibility === "visible" : true
      if (prefersReducedMotion() || (el.dataset.introState === "pending" && shown)) return settle()

      // Start values first, then the CSS lets go, so nothing is seen at rest before it fades in.
      gsap.set([art, title, rest], { autoAlpha: 0 })
      gsap.set(actions, { scale: 0.94 })
      el.dataset.introState = "running"

      let tl: gsap.core.Timeline | null = null
      let live = true
      const play = () => {
        if (!live || tl) return
        tl = gsap
          .timeline({ defaults: { ease: "power1.out", overwrite: "auto" }, onComplete: settle })
          .to(art, { autoAlpha: 1, duration: 0.9 }, 0)
          .to(title, { autoAlpha: 1, duration: 0.6 }, 0.6)
          .to(rest, { autoAlpha: 1, duration: 0.6 }, 1.05)
          .to(actions, { scale: 1, duration: 0.7, ease: "power2.out" }, 1.05)
      }
      const timer = setTimeout(play, COVER_MS)
      if (art?.decode) art.decode().then(play, play)
      else play()

      return () => {
        live = false
        clearTimeout(timer)
        tl?.kill()
        // Whatever comes next finds a page it can read: a second setup in development, or a route shown again.
        settle()
      }
    },
    { scope: root }
  )

  return (
    <div ref={root} data-intro-state="pending" className="relative z-10">
      <noscript>
        <style>{`[data-intro-state] [data-enter],[data-intro-state] h2{visibility:visible!important;animation:none!important}`}</style>
      </noscript>
      {children}
    </div>
  )
}
