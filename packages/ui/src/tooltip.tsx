import { Tooltip as BaseTooltip, TooltipContent as BaseTooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import type { ComponentProps, ReactElement, ReactNode } from "react"
import { popupSurface } from "./dialog"
import { cn } from "./utils"

const Tooltip = BaseTooltip

/** A small dark label over its trigger. */
export const tooltipClass = cn(
  popupSurface,
  "max-w-64 origin-(--transform-origin) px-2 py-1 font-sans text-xs transition-[opacity,scale] duration-100 ease-snap data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-[.97] data-ending-style:opacity-0 motion-reduce:transition-none"
)

function TooltipContent({ className, sideOffset = 6, ...props }: Omit<ComponentProps<typeof BaseTooltipContent>, "className" | "children"> & { className?: string; children?: ReactNode }) {
  return <BaseTooltipContent sideOffset={sideOffset} className={cn(tooltipClass, className)} {...props} />
}

/**
 * The common case in one part: `children` is the element to label, and `label` is the text. It replaces a `title`
 * attribute. The element keeps its own tag and props, rendered through the trigger.
 */
function Tip({ label, children, side }: { label: ReactNode; children: ReactElement; side?: ComponentProps<typeof BaseTooltipContent>["side"] }) {
  if (!label) return children
  return (
    <BaseTooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </BaseTooltip>
  )
}

export { Tip, Tooltip, TooltipContent, TooltipTrigger }
