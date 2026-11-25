import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel as BaseAccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

// The panel animates its measured height, as the collapsible's does. It stays mounted until the close finishes.
function AccordionPanel({ className, ...props }: Omit<ComponentProps<typeof BaseAccordionPanel>, "className" | "children"> & { className?: string; children?: ReactNode }) {
  return (
    <BaseAccordionPanel
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden transition-[height] duration-300 ease-snap data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel }
