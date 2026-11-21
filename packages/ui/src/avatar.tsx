import { Avatar as BaseAvatar, AvatarFallback as BaseAvatarFallback, AvatarImage as BaseAvatarImage } from "@ui-sdk/react/avatar"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

type WithNodes<T> = Omit<T, "className" | "children"> & { className?: string; children?: ReactNode }

function Avatar({ className, ...props }: WithNodes<ComponentProps<typeof BaseAvatar>>) {
  return <BaseAvatar className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} {...props} />
}

// UI SDK keeps the image out until it loads and the fallback in until then. The image fades in once it arrives.
function AvatarImage({ className, ...props }: Omit<ComponentProps<typeof BaseAvatarImage>, "className"> & { className?: string }) {
  return <BaseAvatarImage className={cn("aspect-square size-full transition-opacity duration-150 data-[loading-status=loading]:opacity-0", className)} {...props} />
}

function AvatarFallback({ className, ...props }: WithNodes<ComponentProps<typeof BaseAvatarFallback>>) {
  return <BaseAvatarFallback className={cn("bg-zinc-800 flex size-full items-center justify-center rounded-full", className)} {...props} />
}

export { Avatar, AvatarImage, AvatarFallback }
