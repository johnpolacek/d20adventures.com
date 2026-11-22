"use client"

import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { SplitText } from "gsap/SplitText"
import { useRouter } from "next/navigation"
import { createContext, type ReactNode, useCallback, useContext, useRef } from "react"

gsap.registerPlugin(SplitText)

// The motion of an adventure's page. Every element enters from a blank page, rests, and leaves when the page's own
// links are followed.
//
//   intro    the cover settles slowly behind everything, the title arrives a letter at a time, then the badges, the
//            buttons and each line of the body in turn
//   settled  temporary styles are cleared and CSS owns the page
//   outro    Play and the link to the demo send everything off before the router moves
//
// Elements are marked `data-enter` with their kind. The title and the cover are the header's own, found as the first
// heading and the first picture. Until this takes over, a marked element is hidden by CSS (globals.css), which shows
// it again by itself after two seconds, so a page whose script never arrives is still read. Back and forward, and the
// site's own header, change pages without an outro, and the next page enters as usual.

type Leave = (href: string) => void
const Motion = createContext<Leave | null>(null)

/** Sends the page off, then goes to `href`. Null outside an adventure's page. */
export const useAdventureLeave = () => useContext(Motion)

// How long the intro waits for the cover and the title's typeface before it enters without them.
const READY_MS = 450
// After a link is followed, how long the page stays gone before it comes back, should the next one never arrive.
const RETURN_MS = 6000

const kinds = (root: HTMLElement) => {
  const all = (kind: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-enter="${kind}"]`)).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
  return { art: root.querySelector<HTMLImageElement>("img"), title: root.querySelector<HTMLElement>("h2"), badges: all("badge"), actions: all("action"), lines: all("line") }
}

export function AdventureMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const intro = useRef<gsap.core.Timeline | null>(null)
  const split = useRef<SplitText | null>(null)
  const leaving = useRef(false)

  const { contextSafe } = useGSAP(
    () => {
      const el = root.current
      if (!el) return
      const settle = () => {
        const k = kinds(el)
        split.current?.revert()
        split.current = null
        gsap.set([k.art, k.title, ...el.querySelectorAll("[data-enter]")], { clearProps: "transform,transformOrigin,opacity,visibility,filter" })
        el.dataset.introState = "settled"
        intro.current = null
      }
      // The CSS has already given the page back, or the reader wants no motion: it is simply there.
      const first = el.querySelector<HTMLElement>("[data-enter]")
      const shown = first ? getComputedStyle(first).visibility === "visible" : true
      if (prefersReducedMotion() || (el.dataset.introState === "pending" && shown)) return settle()

      const k = kinds(el)
      const body = [...k.badges, ...k.actions, ...k.lines]
      // Start values first, then the CSS lets go, so nothing is seen at rest before it enters.
      gsap.set(k.title, { autoAlpha: 0 })
      gsap.set(k.badges, { autoAlpha: 0, y: 8, scale: 0.9 })
      gsap.set(k.actions, { autoAlpha: 0, y: 18, scale: 0.92 })
      gsap.set(k.lines, { autoAlpha: 0, y: 16 })
      gsap.set(k.art, { scale: 1.08, transformOrigin: "50% 60%" })
      el.dataset.introState = "running"

      let live = true
      const play = () => {
        if (!live || intro.current) return
        const tl = gsap.timeline({ defaults: { ease: "power3.out", overwrite: "auto" }, onComplete: settle })
        intro.current = tl
        // The painting settles slowly behind the rest. What the reader presses is in within about half a second.
        tl.to(k.art, { scale: 1, duration: 1.6, ease: "power2.out" }, 0)
        if (k.title) {
          // Letters, kept in their words so a long title breaks where it would at rest.
          split.current = SplitText.create(k.title, { type: "words,chars", aria: "auto" })
          tl.set(k.title, { autoAlpha: 1 }, 0).from(split.current.chars, { autoAlpha: 0, yPercent: 60, duration: 0.5, ease: "back.out(1.6)", stagger: 0.022 }, 0.05)
        }
        tl.to(k.badges, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.8)", stagger: 0.05 }, 0.25)
          .to(k.actions, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.5)", stagger: 0.07 }, 0.36)
          .to(k.lines, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.07 }, 0.48)
      }
      const timer = setTimeout(play, READY_MS)
      const art = k.art?.decode ? k.art.decode().catch(() => {}) : Promise.resolve()
      Promise.all([art, document.fonts.ready]).then(play, play)

      return () => {
        live = false
        clearTimeout(timer)
        intro.current?.kill()
        intro.current = null
        // Whatever comes next finds a page it can read: a hidden route shown again, or a second setup in development.
        split.current?.revert()
        split.current = null
        gsap.set([k.art, k.title, ...body], { clearProps: "transform,transformOrigin,opacity,visibility,filter" })
        el.dataset.introState = "settled"
      }
    },
    { scope: root }
  )

  const leave = useCallback<Leave>(
    (href) => {
      const el = root.current
      if (leaving.current) return
      if (!el || prefersReducedMotion()) return router.push(href)
      leaving.current = true
      contextSafe(() => {
        // An intro still playing is stopped where it stands, and the outro goes on from there.
        intro.current?.kill()
        intro.current = null
        el.dataset.introState = "leaving"
        const k = kinds(el)
        const body = [...k.badges, ...k.actions, ...k.lines]
        const back = () => {
          // The next page never came: this one returns, readable and whole.
          leaving.current = false
          split.current?.revert()
          split.current = null
          gsap.to([k.title, ...body], { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out", overwrite: true, clearProps: "transform,opacity,visibility" })
          gsap.to(k.art, { filter: "brightness(1)", scale: 1, duration: 0.4, overwrite: true, clearProps: "transform,transformOrigin,filter" })
          el.dataset.introState = "settled"
        }
        gsap
          .timeline({ defaults: { ease: "power2.in", overwrite: true } })
          // Last in, first out: the body goes from the bottom up, then the title, and the painting dims behind them.
          .to([...body].reverse(), { autoAlpha: 0, y: -12, duration: 0.2, stagger: 0.03 }, 0)
          .to(split.current?.chars ?? k.title, { autoAlpha: 0, y: -14, duration: 0.22, stagger: 0.008 }, 0.06)
          // From a named start: with no filter set, GSAP would begin the dimming at black.
          .fromTo(k.art, { filter: "brightness(1)" }, { filter: "brightness(0.55)", scale: 1.03, duration: 0.45, ease: "power1.inOut" }, 0)
          .call(() => router.push(href), [], 0.3)
          .call(back, [], RETURN_MS / 1000)
      })()
    },
    [router, contextSafe]
  )

  return (
    <Motion.Provider value={leave}>
      <div ref={root} data-intro-state="pending" className="relative z-10 overflow-x-clip">
        <noscript>
          <style>{`[data-intro-state] [data-enter],[data-intro-state] h2{visibility:visible!important;animation:none!important}`}</style>
        </noscript>
        {children}
      </div>
    </Motion.Provider>
  )
}
