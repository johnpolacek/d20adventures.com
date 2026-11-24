"use client"

import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { useRef } from "react"

// A press of the home page's Become a Playtester marks the visit. When the playtest page then opens signed in, its card
// rises with the old title, "Become" scrambles into "You’re", and a glint crosses the gold. Any other visit opens still.

const KEY = "d20:playtest-arrival"
// Sign up can wait on an emailed code, so the mark keeps a while.
const FRESH_MS = 15 * 60_000
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const LOWER = "abcdefghijklmnopqrstuvwxyz"
// Noise changes this many times a second.
const SCRAMBLE_RATE = 20

export function markArrival() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {}
}

function takeArrival(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return at > 0 && Date.now() - at < FRESH_MS
  } catch {
    return false
  }
}

// The same time always draws the same noise, so a replay looks the same.
function noise(char: string, i: number, tick: number): string {
  if (char.toLowerCase() === char.toUpperCase()) return " "
  const x = Math.sin(i * 12.9898 + tick * 78.233) * 43758.5453
  const pool = char === char.toUpperCase() ? UPPER : LOWER
  return pool[Math.floor((x - Math.floor(x)) * 26)]!
}

// Goes inside the card. The heading carries data-arrival-heading, and the word that changes data-arrival-word.
export function Arrival({ joined }: { joined: boolean }) {
  const marker = useRef<HTMLSpanElement>(null)
  // Read once per mount, so a development double setup still plays.
  const arrived = useRef<boolean | null>(null)

  useGSAP(() => {
    if (!joined) return
    if (arrived.current === null) arrived.current = takeArrival()
    if (!arrived.current || prefersReducedMotion()) return
    const card = marker.current?.closest("article")
    const heading = card?.querySelector<HTMLElement>("[data-arrival-heading]")
    const word = heading?.querySelector<HTMLElement>("[data-arrival-word]")
    if (!card || !heading || !word) return

    const target = word.textContent ?? ""
    const from = "Become"
    // The word holds its width while it changes, and the rest of the line slides as the width eases between the two.
    gsap.set(word, { display: "inline-block", whiteSpace: "nowrap" })
    const toWidth = word.offsetWidth
    word.textContent = from
    const fromWidth = word.offsetWidth
    const gold = getComputedStyle(heading).backgroundImage
    const length = Array.from(target).length
    const state = { progress: 0 }

    // The card's own CSS fade would ease every opacity GSAP writes, so it is off before the first.
    gsap.set(card, { transition: "none" })
    const tl = gsap.timeline({ defaults: { overwrite: "auto" } })
    tl.set(word, { width: fromWidth })
      .from(card, { autoAlpha: 0, y: 28, scale: 0.98, duration: 0.55, ease: "power3.out" })
      // Noise first, then the new letters land left to right.
      .to(
        state,
        {
          progress: 1,
          duration: 0.7,
          ease: "none",
          onUpdate: () => {
            const shown = Math.floor(Math.max(0, (state.progress - 0.2) / 0.8) * length)
            const tick = Math.floor(state.progress * 0.7 * SCRAMBLE_RATE)
            word.textContent = Array.from(target, (char, i) => (i < shown ? char : noise(char, i, tick))).join("")
          },
        },
        "+=0.35"
      )
      .to(word, { width: toWidth, duration: 0.7, ease: "power2.inOut" }, "<")
      .set(heading, {
        backgroundImage: `linear-gradient(100deg, transparent 38%, rgba(255,250,230,0.95) 50%, transparent 62%), ${gold}`,
        backgroundSize: "300% 100%, 100% 100%",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "100% 0%, 0% 0%",
      })
      .to(heading, { backgroundPosition: "0% 0%, 0% 0%", duration: 0.9, ease: "power2.inOut" }, "-=0.15")
      .to(heading, { scale: 1.03, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1, transformOrigin: "left center" }, "<")
      .eventCallback("onComplete", () => {
        word.textContent = target
        gsap.set(word, { clearProps: "display,whiteSpace,width" })
        gsap.set(heading, { clearProps: "backgroundImage,backgroundSize,backgroundRepeat,backgroundPosition,transform,transformOrigin" })
        gsap.set(card, { clearProps: "transition,transform,opacity,visibility" })
      })

    return () => {
      word.textContent = target
    }
  })

  return <span ref={marker} hidden />
}
