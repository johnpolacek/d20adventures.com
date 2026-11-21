// GSAP for the site and the desktop app, registered once: import it from here. And the one answer to whether motion is
// reduced, so every animation asks the same question.
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

gsap.registerPlugin(useGSAP)

/** The reader asked their system for less motion. True where there is no window. */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia === "undefined") return true
  return matchMedia("(prefers-reduced-motion: reduce)").matches
}

export { gsap, useGSAP }
