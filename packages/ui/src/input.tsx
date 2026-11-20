import { Input as BaseInput } from "@ui-sdk/react/input"
import type { ComponentProps } from "react"
import { cn } from "./utils"

type InputProps = Omit<ComponentProps<typeof BaseInput>, "className"> & {
  className?: string
  /** Drops the default look, for a field styled entirely by its caller. */
  plain?: boolean
}

function Input({ className, plain, ...props }: InputProps) {
  if (plain) return <BaseInput className={className} {...props} />
  return (
    <BaseInput
      className={cn(
        "border-white/20 file:text-white placeholder:text-white/60 selection:bg-primary-400 selection:text-white flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-2xs transition-[color,box-shadow] outline-hidden file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-primary-400 focus-visible:ring-primary-400/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-red-700/40 aria-invalid:border-red-700",
        className
      )}
      {...props}
    />
  )
}

export { Input }
