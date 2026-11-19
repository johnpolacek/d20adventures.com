import { Label as BaseLabel } from "@ui-sdk/react/label"
import type { ComponentProps } from "react"
import { cn } from "./utils"

type LabelProps = Omit<ComponentProps<typeof BaseLabel>, "className"> & { className?: string }

function Label({ className, ...props }: LabelProps) {
  return (
    <BaseLabel
      className={cn("flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50", className)}
      {...props}
    />
  )
}

export { Label }
