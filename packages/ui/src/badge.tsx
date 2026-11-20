import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "./utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-primary-400 focus-visible:ring-primary-400/50 focus-visible:ring-[3px] aria-invalid:ring-red-700/40 aria-invalid:border-red-700 transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-400 text-white [a&]:hover:bg-primary-400/90",
        secondary: "border-transparent bg-zinc-800 text-white [a&]:hover:bg-zinc-800/90",
        destructive: "border-transparent bg-red-700 text-white [a&]:hover:bg-red-700/90 focus-visible:ring-red-700/40",
        outline: "text-white [a&]:hover:bg-zinc-800 [a&]:hover:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
