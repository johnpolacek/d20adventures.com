import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent as BaseDrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@ui-sdk/react/drawer"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

/** The sheet with its backdrop. The drawer places and moves it. Give it a size through `className`. */
function DrawerContent({ className, ...props }: Omit<ComponentProps<typeof BaseDrawerContent>, "className" | "children"> & { className?: string; children?: ReactNode }) {
  return (
    <>
      <DrawerBackdrop className="bg-black/60" />
      <BaseDrawerContent
        className={cn(
          "flex flex-col border-white/15 bg-black/95 text-white shadow-2xl outline-hidden data-[side=bottom]:rounded-t-xl data-[side=bottom]:border-t data-[side=left]:border-r data-[side=right]:border-l data-[side=top]:rounded-b-xl data-[side=top]:border-b",
          className
        )}
        {...props}
      />
    </>
  )
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger }
