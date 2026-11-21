import type { ComponentProps } from "react"
import { cn } from "./utils"

// The website's surfaces as class strings and small parts, so screens outside Next (the desktop app) share its look.

/** A small mono label over a field or a group. */
export const siteLabel = "font-mono text-xs uppercase tracking-label text-primary-200"
const chipTones = {
  dark: "bg-black/80 text-white",
  amber: "bg-accent-500/90 font-semibold text-black",
  primary: "bg-primary-800/80 text-primary-100",
}

/** A mono tag, as over the art of an adventure card. */
export function Chip({ tone = "dark", className, ...rest }: ComponentProps<"span"> & { tone?: keyof typeof chipTones }) {
  return <span {...rest} className={cn("inline-block rounded px-2 py-1 font-mono text-3xs", chipTones[tone], className)} />
}

/** A section's heading: amber display type on a dark plate. */
export function SectionPlate({ className, ...rest }: ComponentProps<"h2">) {
  return (
    <div className="text-center">
      <h2 {...rest} className={cn("my-4 inline-block rounded bg-black/50 px-8 py-2 text-center font-display text-lg font-bold tracking-wide text-accent-400/90", className)} />
    </div>
  )
}

/** The rough white rule under an image header. */
export function Rule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("h-px w-full overflow-hidden bg-[url('/images/app/art/texture-line.png')] opacity-50", className)} />
}
