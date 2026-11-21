import {
  Select as BaseSelect,
  SelectContent as BaseSelectContent,
  SelectItem as BaseSelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel as BaseSelectLabel,
  SelectTrigger as BaseSelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { popupMotionClass, popupSurface } from "./dialog"
import { fieldClass } from "./input"
import { cn } from "./utils"

type WithClass<T> = Omit<T, "className"> & { className?: string }
type WithNodes<T> = Omit<T, "className" | "children"> & { className?: string; children?: ReactNode }

const Select = BaseSelect

function SelectTrigger({ className, children, ...props }: WithNodes<ComponentProps<typeof BaseSelectTrigger>>) {
  return (
    <BaseSelectTrigger
      className={cn(
        fieldClass,
        "flex h-9 w-fit items-center justify-between gap-2 whitespace-nowrap data-placeholder:text-white/50 data-placeholder:italic [&_svg:not([class*='text-'])]:text-white/50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 opacity-50" />
    </BaseSelectTrigger>
  )
}

function SelectContent({ className, sideOffset = 4, ...props }: WithClass<ComponentProps<typeof BaseSelectContent>>) {
  return (
    <BaseSelectContent
      sideOffset={sideOffset}
      className={cn(
        popupSurface,
        "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto p-1",
        popupMotionClass,
        className
      )}
      {...props}
    />
  )
}

function SelectLabel({ className, ...props }: WithClass<ComponentProps<typeof BaseSelectLabel>>) {
  return <BaseSelectLabel className={cn("px-2 py-1.5 text-sm font-medium", className)} {...props} />
}

function SelectItem({ className, children, ...props }: WithNodes<ComponentProps<typeof BaseSelectItem>>) {
  return (
    <BaseSelectItem
      className={cn(
        "data-highlighted:bg-white/10 data-highlighted:text-white [&_svg:not([class*='text-'])]:text-white/60 relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <SelectItemText className="flex items-center gap-2">{children}</SelectItemText>
      <SelectItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
        <CheckIcon className="size-4" />
      </SelectItemIndicator>
    </BaseSelectItem>
  )
}

export { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue }
