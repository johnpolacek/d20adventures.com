import { Collapsible as BaseCollapsible, CollapsiblePanel as BaseCollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

const Collapsible = BaseCollapsible

// The panel animates its measured height. It stays mounted until the close finishes.
function CollapsiblePanel({ className, ...props }: Omit<ComponentProps<typeof BaseCollapsiblePanel>, "className" | "children"> & { className?: string; children?: ReactNode }) {
  return (
    <BaseCollapsiblePanel
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-snap data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel }
