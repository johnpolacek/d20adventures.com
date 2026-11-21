// The stage's motion, played by GSAP. Everywhere else a part's `enter-*` or `exit-*` class is a CSS animation
// (components/theme.css). Inside a root marked `data-stage-motion` those animations are switched off, and the one
// controller here plays each class as it appears: on a part put on the page, and on a part given the class later.
//
// A part goes mount, initial state, intro, settled, outro, end state, unmount. The controller owns the middle five:
// - A part comes in from its motion's start and is handed back to its own CSS once it is at rest.
// - A part told to leave goes from wherever it is. Told to come back, it returns from wherever it got to.
// - Each end is announced as an `animationend` on the part, which is what Presence, Swap and the prompt card listen
//   for, so they work the same under either engine.
// - Reduced motion plays nothing: a part is simply there, and Presence takes a leaving one away at once.
//
// The movement is written as the part's own `transform`, after any it already has. Tailwind's `translate`, `scale` and
// `rotate` are separate properties and are left alone, so a part centred with `-translate-x-1/2` stays centred, and
// its `transform` holds only how far it has still to go.

import { CustomEase } from "gsap/CustomEase"
import { gsap, prefersReducedMotion } from "../motion"

gsap.registerPlugin(CustomEase)

type Move = {
  /** How far from rest, in px. A function reads it from the part. */
  x?: number | ((el: Element) => number)
  y?: number
  scale?: number
  blur?: number
  /** False for a move that leaves the part's opacity alone. */
  fade?: boolean
  seconds?: number
  ease?: string
}

// Where each class comes in from. The six `enter-*` match their keyframes in components/theme.css.
const ARRIVE: Record<string, Move> = {
  "enter-fade": {},
  "enter-rise": { y: 8 },
  "enter-drop": { y: -8 },
  "enter-left": { x: -12 },
  "enter-right": { x: 12 },
  "enter-pop": { scale: 0.96 },
  // A dialogue plate slides in from its side.
  "plate-in": { x: (el) => parseFloat(getComputedStyle(el).getPropertyValue("--plate-from")) || -70, seconds: 0.5 },
  "gm-musing-in": { y: 4, blur: 6, seconds: 0.45, ease: "power1.out" },
  // A die that has landed, with a small jump in size.
  "die-land": { scale: 1.16, fade: false, seconds: 0.34, ease: "back.out(2.6)" },
}
// Where each class goes out to.
const LEAVE: Record<string, Move> = {
  "exit-fade": {},
  "exit-rise": { y: 6 },
  "exit-drop": { y: -6 },
  "exit-left": { x: -10 },
  "exit-right": { x: 10 },
  "exit-pop": { scale: 0.97 },
  "gm-musing-out": { y: -4, blur: 6, seconds: 0.35, ease: "power1.in" },
}
const ANY = [...Object.keys(ARRIVE), ...Object.keys(LEAVE)].map((c) => `.${c}`).join(",")

type Tokens = { in: number; out: number; step: number }
let tokens: Tokens | undefined
// The app's own motion values, read once from its CSS, with its two curves registered as `snap` and `snap-in`.
function motionTokens(): Tokens {
  if (tokens) return tokens
  const css = getComputedStyle(document.documentElement)
  const seconds = (name: string, fallback: number) => {
    const raw = css.getPropertyValue(name).trim()
    const n = parseFloat(raw)
    return Number.isFinite(n) ? (raw.endsWith("ms") ? n / 1000 : n) : fallback
  }
  const curve = (name: string, fallback: string) => /cubic-bezier\(([^)]+)\)/.exec(css.getPropertyValue(name))?.[1] ?? fallback
  CustomEase.create("snap", curve("--ease-snap", "0.2,0.8,0.2,1"))
  CustomEase.create("snap-in", curve("--ease-in-snap", "0.4,0,1,1"))
  tokens = { in: seconds("--motion-in", 0.16), out: seconds("--motion-out", 0.11), step: seconds("--motion-step", 0.028) }
  return tokens
}

type Part = HTMLElement | SVGElement

// One part's time away from rest.
function flight(el: Part) {
  const s = el.style
  // How far the part is from rest.
  const now = { x: 0, y: 0, scale: 1, blur: 0, alpha: 1 }
  // The part's own inline styles, kept while it is away and given back at rest.
  let held: { transform: string; opacity: string; filter: string; transition: string } | undefined
  let base = ""
  let rest = 1
  let fades = true
  let tween: gsap.core.Tween | undefined
  const hold = () => {
    if (held) return
    held = { transform: s.transform, opacity: s.opacity, filter: s.filter, transition: s.transition }
    const css = getComputedStyle(el)
    base = css.transform === "none" ? "" : `${css.transform} `
    rest = Number(css.opacity)
    now.x = now.y = now.blur = 0
    now.scale = 1
    now.alpha = rest
    // A transition of the part's own would chase every frame written here.
    s.transition = "none"
  }
  const write = () => {
    const moved = now.x || now.y ? `translate(${now.x}px, ${now.y}px) ` : ""
    const scaled = now.scale === 1 ? "" : `scale(${now.scale})`
    s.transform = `${base}${moved}${scaled}`.trim() || (held?.transform ?? "")
    if (fades) s.opacity = String(now.alpha)
    s.filter = now.blur ? `blur(${now.blur}px)` : (held?.filter ?? "")
  }
  const settle = () => {
    tween?.kill()
    tween = undefined
    if (!held) return
    s.transform = held.transform
    s.opacity = held.opacity
    s.filter = held.filter
    s.transition = held.transition
    held = undefined
  }
  const from = (move: Move) => ({ x: typeof move.x === "function" ? move.x(el) : (move.x ?? 0), y: move.y ?? 0, scale: move.scale ?? 1, blur: move.blur ?? 0 })
  return {
    /** Comes in to rest: from the move's start when at rest, or from wherever a leaving part got to. */
    enter(move: Move, seconds: number, delay: number, done: () => void) {
      const fresh = !held
      hold()
      tween?.kill()
      if (fresh) {
        fades = move.fade !== false
        Object.assign(now, from(move), fades ? { alpha: 0 } : null)
      }
      write()
      tween = gsap.to(now, {
        x: 0,
        y: 0,
        scale: 1,
        blur: 0,
        alpha: rest,
        duration: move.seconds ?? seconds,
        ease: move.ease ?? "snap",
        delay: fresh ? delay : 0,
        onUpdate: write,
        onComplete: () => {
          settle()
          done()
        },
      })
    },
    /** Goes out from wherever it is, and stays as it ends: it is about to be taken away. */
    exit(move: Move, seconds: number, done: () => void) {
      hold()
      tween?.kill()
      fades = true
      tween = gsap.to(now, { ...from(move), alpha: 0, duration: move.seconds ?? seconds, ease: move.ease ?? "snap-in", onUpdate: write, onComplete: done })
    },
    settle,
  }
}

const has = (was: string | null | undefined, name: string) => Boolean(was) && was!.split(/\s+/).includes(name)
const named = (el: Element, moves: Record<string, Move>) => {
  for (const name of el.classList) if (name in moves) return name
}
const ended = (el: Element, animationName: string) => el.dispatchEvent(new AnimationEvent("animationend", { bubbles: true, animationName }))

/** Plays the stage's motion inside `root` until the function it returns is called. */
export function stageMotion(root: HTMLElement): () => void {
  const t = motionTokens()
  const flying = new Map<Element, ReturnType<typeof flight>>()
  // Parts that have come in, so one moved in the page does not come in again.
  const arrived = new WeakSet<Element>()
  const of = (el: Element) => {
    let f = flying.get(el)
    if (!f) flying.set(el, (f = flight(el as Part)))
    return f
  }
  // `was` is the part's class before a change to it. A part new to the page has none.
  const consider = (el: Element, was?: string | null) => {
    const leave = named(el, LEAVE)
    const arrive = named(el, ARRIVE)
    if (prefersReducedMotion()) return
    if (leave) {
      if (was !== undefined && has(was, leave)) return
      of(el).exit(LEAVE[leave], t.out, () => ended(el, leave))
    } else if (arrive) {
      if (was === undefined ? arrived.has(el) : has(was, arrive)) return
      arrived.add(el)
      const index = Number(getComputedStyle(el).getPropertyValue("--i")) || 0
      of(el).enter(ARRIVE[arrive], t.in, Math.min(index, 8) * t.step, () => {
        flying.delete(el)
        ended(el, arrive)
      })
    }
  }
  const scan = (el: Element) => {
    if (el.matches(ANY)) consider(el)
    for (const inner of el.querySelectorAll(ANY)) consider(inner)
  }
  const watch = new MutationObserver((records) => {
    let removed = false
    for (const record of records) {
      if (record.type === "attributes") consider(record.target as Element, record.oldValue)
      else {
        for (const node of record.addedNodes) if (node instanceof Element) scan(node)
        removed ||= record.removedNodes.length > 0
      }
    }
    if (!removed) return
    for (const [el, f] of flying) {
      if (el.isConnected) continue
      f.settle()
      flying.delete(el)
    }
  })
  watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true })
  scan(root)
  return () => {
    watch.disconnect()
    for (const f of flying.values()) f.settle()
    flying.clear()
  }
}
