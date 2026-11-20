import { HoverCard as BaseHoverCard, HoverCardContent as BaseHoverCardContent, HoverCardTrigger as BaseHoverCardTrigger } from "@ui-sdk/react/hover-card"
import type { ComponentProps } from "react"
import { popupMotionClass } from "./dialog"
import { cn } from "./utils"

const HoverCard = BaseHoverCard
const HoverCardTrigger = BaseHoverCardTrigger

function HoverCardContent({ className, align = "center", sideOffset = 4, ...props }: Omit<ComponentProps<typeof BaseHoverCardContent>, "className"> & { className?: string }) {
  return (
    <BaseHoverCardContent
      align={align}
      sideOffset={sideOffset}
      className={cn("bg-black text-white w-64 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden", popupMotionClass, className)}
      {...props}
    />
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
