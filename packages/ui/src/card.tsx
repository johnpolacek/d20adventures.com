import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "./utils"

// The cards the site and the app draw, by job:
// panel     a dark box for a form or a page section (contact, admin, practice setup)
// frame     the near-black box with a thick black ring: a menu, a modal step, a featured adventure
// quiet     a softer frame around a notice or a form
// feature   the centred spotlight a step opens with (choose your party, choose a character)
// pick      a frame you choose, an adventure or a premade hero. `selected` holds it lit.
// portrait  a hero's card: art on top, name below
// inset     a quiet box inside another, as in a setting's locations
// accent    the primary-coloured box (practice adventure)
const cardVariants = cva("flex flex-col rounded-xl border text-white", {
  variants: {
    variant: {
      panel: "gap-6 py-6 bg-black/70 border-white/20",
      frame: "gap-0 overflow-hidden bg-black/80 border-white/20 ring-[6px] ring-black",
      quiet: "gap-0 rounded-lg bg-black/50 border-white/10 ring-8 ring-black/30",
      feature: "gap-0 p-8 sm:p-10 text-center rounded-2xl border-none bg-gradient-to-tl from-black/80 to-black/60 ring-8 ring-black/20",
      pick: "gap-0 p-0 overflow-hidden cursor-pointer bg-black/80 border-white/20 ring-[6px] ring-black scale-95 transition-[scale,background-color,box-shadow] duration-150 ease-snap hover:scale-100 hover:bg-black/90 hover:ring-8 hover:ring-primary-500 active:scale-[0.97] data-[selected]:scale-100 data-[selected]:ring-8 data-[selected]:ring-primary-500",
      portrait: "gap-0 p-0 items-center overflow-hidden rounded-lg font-display bg-black border-white/10 ring-8 ring-black/30 transition-[scale,box-shadow] duration-150 ease-snap",
      inset: "gap-6 py-6 bg-black/20 border-white/10",
      accent: "gap-6 py-8 bg-primary-800 border-2 border-primary-700",
    },
    // A portrait you can click grows and lights up under the pointer.
    interactive: { true: "cursor-pointer hover:scale-105 hover:ring-primary-400/80 active:scale-100", false: "" },
  },
  defaultVariants: { variant: "panel", interactive: false },
})

type CardProps = React.ComponentProps<"div"> & VariantProps<typeof cardVariants> & { selected?: boolean }

function Card({ className, variant, interactive, selected, ...props }: CardProps) {
  return <div data-slot="card" data-variant={variant ?? "panel"} data-selected={selected ? "" : undefined} className={cn(cardVariants({ variant, interactive }), className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-display font-bold text-xl", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-white/60 text-sm", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6 grow", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
