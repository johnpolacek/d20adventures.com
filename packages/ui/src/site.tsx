import type { ComponentProps } from "react"
import { Button, type ButtonProps } from "./button"
import { cn } from "./utils"

// The website's surfaces as class strings and small parts, so screens outside Next (the desktop app) share its look.

/** A small mono label over a field or a group. */
export const siteLabel = "font-mono text-xs uppercase tracking-wider text-primary-200"
/** A small secondary control, the outline button without its hover growth. Add padding and a text size. */
export const siteOutline =
  "inline-flex items-center justify-center rounded-md border-2 border-blue-200/20 bg-blue-950/70 text-blue-50 transition-[color,background-color,border-color,scale] duration-150 ease-snap select-none hover:bg-blue-950/90 hover:text-white disabled:pointer-events-none disabled:opacity-50"
/** A text field. */
export const siteField =
  "w-full min-w-0 rounded-md border border-white/20 bg-transparent px-3 py-2 text-base text-white outline-none transition-[color,border-color,box-shadow] duration-150 placeholder:text-white/50 placeholder:italic focus-visible:border-primary-400 focus-visible:ring-[3px] focus-visible:ring-primary-400/50 disabled:opacity-50"

/** One choice among several: the outline control, filled with the primary colour when chosen. */
export function Option({ active, className, ...rest }: Omit<ButtonProps, "variant" | "size"> & { active?: boolean }) {
  return <Button variant="plain" type="button" {...rest} className={cn(siteOutline, "px-3 py-1.5 text-sm active:scale-[0.97]", active && "border-primary-400 bg-primary-600 text-white hover:bg-primary-600", className)} />
}

const chipTones = {
  dark: "bg-black/80 text-white",
  amber: "bg-amber-500/90 font-semibold text-black",
  primary: "bg-primary-800/80 text-primary-100",
}

/** A mono tag, as over the art of an adventure card. */
export function Chip({ tone = "dark", className, ...rest }: ComponentProps<"span"> & { tone?: keyof typeof chipTones }) {
  return <span {...rest} className={cn("inline-block rounded px-2 py-1 font-mono text-xxs", chipTones[tone], className)} />
}

/** A section's heading: amber display type on a dark plate. */
export function SectionPlate({ className, ...rest }: ComponentProps<"h2">) {
  return (
    <div className="text-center">
      <h2 {...rest} className={cn("my-4 inline-block rounded bg-black/50 px-8 py-2 text-center font-display text-lg font-bold tracking-wider text-amber-400/90", className)} />
    </div>
  )
}

/** The rough white rule under an image header. */
export function Rule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("h-px w-full overflow-hidden bg-[url('/images/app/art/texture-line.png')] opacity-50", className)} />
}
