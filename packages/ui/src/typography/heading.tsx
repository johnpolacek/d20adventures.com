import type * as React from "react"
import { cn } from "../utils"

// The heading levels of the site and the desktop app. Each level is one size and one colour:
//   h1  a page's title
//   h2  a section of a page
//   h3  a part of a section
//   h4  a panel or card's heading, in white
//   h5  a small heading inside a panel, in white
//   h6  a label over a group, in small mono capitals
// Titles and sections are gold. The stage HUD sets its own type and does not use these.
export const headingClasses = {
  h1: "font-display text-4xl font-bold leading-tight tracking-wide text-accent-300 sm:text-5xl",
  h2: "font-display text-2xl font-bold leading-tight text-accent-300 sm:text-3xl",
  h3: "font-display text-xl font-bold leading-snug text-accent-300 sm:text-2xl",
  h4: "font-display text-lg font-bold leading-snug text-white",
  h5: "font-display text-base font-bold leading-snug text-white",
  h6: "font-mono text-2xs font-normal uppercase tracking-label text-primary-200",
} as const

export type HeadingVariant = keyof typeof headingClasses

interface HeadingProps extends Omit<React.HTMLAttributes<HTMLHeadingElement>, "className"> {
  /** The look. The tag is the same level unless `as` says otherwise. */
  variant: HeadingVariant
  as?: HeadingVariant
  className?: string
}

export function Heading({ className, variant, as, ...props }: HeadingProps) {
  const Tag = as || variant
  return <Tag className={cn("text-balance", headingClasses[variant], className)} {...props} />
}
