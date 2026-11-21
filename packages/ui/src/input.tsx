import { Input as BaseInput } from "@ui-sdk/react/input"
import type { ComponentProps } from "react"
import { cn } from "./utils"

/** The look of every text field: Input, Textarea, a Select's trigger, and a field styled by hand. */
export const fieldClass =
  "w-full min-w-0 rounded-md border border-white/20 bg-black/30 px-3 py-1.5 text-base text-white shadow-2xs outline-none transition-[color,border-color,box-shadow] duration-150 placeholder:text-white/50 placeholder:italic selection:bg-primary-400 selection:text-white focus-visible:border-primary-400 focus-visible:ring-[3px] focus-visible:ring-primary-400/50 aria-invalid:border-red-700 aria-invalid:ring-red-700/40 disabled:cursor-not-allowed disabled:opacity-50"

type InputProps = Omit<ComponentProps<typeof BaseInput>, "className"> & {
  className?: string
  /** Drops the default look, for a field styled entirely by its caller. */
  plain?: boolean
}

function Input({ className, plain, ...props }: InputProps) {
  if (plain) return <BaseInput className={className} {...props} />
  return (
    <BaseInput
      className={cn(fieldClass, "flex h-9 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white", className)}
      {...props}
    />
  )
}

export { Input }
