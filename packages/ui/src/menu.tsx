import { Menu, MenuContent as BaseMenuContent, MenuItem as BaseMenuItem, MenuSeparator as BaseMenuSeparator, MenuTrigger } from "@ui-sdk/react/menu"
import type { ComponentProps, ReactNode } from "react"
import { popupMotionClass } from "./dialog"
import { cn } from "./utils"

type WithNodes<T> = Omit<T, "className" | "children"> & { className?: string; children?: ReactNode }

function MenuContent({ className, sideOffset = 6, ...props }: WithNodes<ComponentProps<typeof BaseMenuContent>>) {
  return (
    <BaseMenuContent
      sideOffset={sideOffset}
      className={cn("min-w-40 origin-(--transform-origin) rounded-xl border border-white/20 bg-black/90 p-1 text-white shadow-lg ring-4 ring-black outline-hidden", popupMotionClass, className)}
      {...props}
    />
  )
}

function MenuItem({ className, ...props }: WithNodes<ComponentProps<typeof BaseMenuItem>>) {
  return (
    <BaseMenuItem
      className={cn("flex w-full cursor-default items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm outline-hidden select-none data-disabled:opacity-50 data-highlighted:bg-white/10", className)}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: Omit<ComponentProps<typeof BaseMenuSeparator>, "className"> & { className?: string }) {
  return <BaseMenuSeparator className={cn("my-1 h-px bg-white/10", className)} {...props} />
}

export { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger }
