import {
  Dialog as BaseDialog,
  DialogBackdrop,
  DialogClose as BaseDialogClose,
  DialogContent as BaseDialogContent,
  DialogDescription as BaseDialogDescription,
  DialogTitle as BaseDialogTitle,
  DialogTrigger as BaseDialogTrigger,
} from "@ui-sdk/react/dialog"
import { XIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

type WithClass<T> = Omit<T, "className"> & { className?: string }
type WithNodes<T> = Omit<T, "className" | "children"> & { className?: string; children?: ReactNode }

const Dialog = BaseDialog
const DialogTrigger = BaseDialogTrigger
const DialogClose = BaseDialogClose

export const backdropClass =
  "fixed inset-0 bg-black/80 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none"
export const popupMotionClass = "transition-[opacity,scale] duration-200 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none"

function DialogContent({ className, children, ...props }: WithNodes<ComponentProps<typeof BaseDialogContent>>) {
  return (
    <>
      <DialogBackdrop className={backdropClass} />
      <BaseDialogContent
        className={cn(
          "bg-background fixed top-[50%] left-[50%] m-0 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg",
          popupMotionClass,
          className
        )}
        {...props}
      >
        {children}
        <BaseDialogClose
          aria-label="Close"
          className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon aria-hidden="true" />
        </BaseDialogClose>
      </BaseDialogContent>
    </>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

function DialogTitle({ className, ...props }: WithClass<ComponentProps<typeof BaseDialogTitle>>) {
  return <BaseDialogTitle className={cn("text-lg leading-none font-semibold", className)} {...props} />
}

function DialogDescription({ className, ...props }: WithClass<ComponentProps<typeof BaseDialogDescription>>) {
  return <BaseDialogDescription className={cn("text-muted-foreground text-sm", className)} {...props} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger }
