import { type ClassValue, clsx } from "clsx"
import type { AnimationEvent, CSSProperties } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** What a Presence hands the part it wraps with `asChild`: its motion's class, its stagger, and the end of its exit. */
export type MotionProps = { className?: string; style?: CSSProperties; onAnimationEnd?: (e: AnimationEvent<HTMLElement>) => void }

/** A part's class names with its own entrance. A Presence around the part hands it a motion of its own, and that one is kept instead. */
export function entrance(enter: string, className?: string) {
  return className && /(?:^|\s)(?:enter|exit)-/.test(className) ? className : cn(enter, className)
}

/** The style that makes a part with an `enter-*` class wait its turn in a row or list. */
export const staggered = (index: number) => ({ "--i": Math.min(index, 8) }) as CSSProperties
