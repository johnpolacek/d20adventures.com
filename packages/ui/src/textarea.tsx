import { Textarea as BaseTextarea } from "@ui-sdk/react/textarea"
import type { ComponentProps } from "react"
import { fieldClass } from "./input"
import { cn } from "./utils"

type TextareaProps = Omit<ComponentProps<typeof BaseTextarea>, "className"> & {
  className?: string
  /** Drops the default look, for a field styled entirely by its caller. */
  plain?: boolean
}

function Textarea({ className, plain, ...props }: TextareaProps) {
  if (plain) return <BaseTextarea className={className} {...props} />
  return (
    <BaseTextarea
      className={cn(fieldClass, "flex field-sizing-content min-h-16 py-2", className)}
      {...props}
    />
  )
}

export { Textarea }
