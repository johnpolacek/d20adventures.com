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
  "fixed inset-0 bg-black/80 transition-opacity duration-150 ease-snap data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none"
/** The surface of every small popup: menu, select, hover card, toast and tooltip. */
export const popupSurface = "rounded-lg border border-white/20 bg-black/90 text-white shadow-lg ring-4 ring-black outline-hidden"
/** The surface of a modal, plain or alert. */
export const dialogSurface = "rounded-lg border border-white/20 bg-black p-6 text-white shadow-lg ring-[6px] ring-black/70"
/** A modal's title and description, plain or alert. */
export const dialogTitleClass = "font-display text-xl leading-tight text-accent-300"
export const dialogDescriptionClass = "text-sm text-white/70"
export const dialogHeaderClass = "flex flex-col gap-2 text-center sm:text-left"
export const dialogFooterClass = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"

export const popupMotionClass = "transition-[opacity,scale] duration-150 ease-snap data-starting-style:scale-[.96] data-starting-style:opacity-0 data-ending-style:scale-[.97] data-ending-style:opacity-0 data-ending-style:duration-100 motion-reduce:transition-none"

function DialogContent({ className, closeClassName, children, ...props }: WithNodes<ComponentProps<typeof BaseDialogContent>> & { closeClassName?: string }) {
  return (
    <>
      <DialogBackdrop className={backdropClass} />
      <BaseDialogContent
        className={cn(
          dialogSurface,
          "fixed top-[50%] left-[50%] m-0 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 sm:max-w-lg",
          popupMotionClass,
          className
        )}
        {...props}
      >
        {children}
        <BaseDialogClose
          aria-label="Close"
          className={cn(
            "absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            closeClassName
          )}
        >
          <XIcon aria-hidden="true" />
        </BaseDialogClose>
      </BaseDialogContent>
    </>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn(dialogHeaderClass, className)} {...props} />
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn(dialogFooterClass, className)} {...props} />
}

function DialogTitle({ className, ...props }: WithClass<ComponentProps<typeof BaseDialogTitle>>) {
  return <BaseDialogTitle className={cn(dialogTitleClass, className)} {...props} />
}

function DialogDescription({ className, ...props }: WithClass<ComponentProps<typeof BaseDialogDescription>>) {
  return <BaseDialogDescription className={cn(dialogDescriptionClass, className)} {...props} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger }
