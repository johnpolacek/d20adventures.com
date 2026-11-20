import { Textarea as BaseTextarea } from "@ui-sdk/react/textarea"
import type { ComponentProps } from "react"
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
      className={cn(
        "border-white/20 placeholder:text-white/70 placeholder:italic focus-visible:border-primary-400 focus-visible:ring-primary-400/50 aria-invalid:ring-red-700/40 aria-invalid:border-red-700 bg-zinc-800/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
