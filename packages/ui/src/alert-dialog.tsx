import {
  AlertDialog as BaseAlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent as BaseAlertDialogContent,
  AlertDialogDescription as BaseAlertDialogDescription,
  AlertDialogTitle as BaseAlertDialogTitle,
  AlertDialogTrigger as BaseAlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog"
import type { ComponentProps } from "react"
import { buttonVariants } from "./button"
import { backdropClass, popupMotionClass } from "./dialog"
import { cn } from "./utils"

type WithClass<T> = Omit<T, "className"> & { className?: string }

const AlertDialog = BaseAlertDialog
const AlertDialogTrigger = BaseAlertDialogTrigger

function AlertDialogContent({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogContent>>) {
  return (
    <>
      <AlertDialogBackdrop className={backdropClass} />
      <BaseAlertDialogContent
        className={cn(
          "fixed left-[50%] top-[50%] m-0 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-primary-500 ring-[6px] ring-black/70 bg-black p-6 text-white shadow-lg sm:rounded-lg",
          popupMotionClass,
          className
        )}
        {...props}
      />
    </>
  )
}

function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogTitle>>) {
  return <BaseAlertDialogTitle className={cn("text-lg font-display text-white", className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogDescription>>) {
  return <BaseAlertDialogDescription className={cn("text-sm text-zinc-300", className)} {...props} />
}

/** Closes the dialog as its answer. Runs onClick first. */
function AlertDialogAction({ className, ...props }: WithClass<ComponentProps<typeof AlertDialogClose>>) {
  return <AlertDialogClose value="confirm" className={cn(buttonVariants(), className)} {...props} />
}

function AlertDialogCancel({ className, ...props }: WithClass<ComponentProps<typeof AlertDialogClose>>) {
  return <AlertDialogClose className={cn(buttonVariants({ variant: "ghost" }), "mt-2 hover:bg-zinc-800/50 hover:text-white sm:mt-0", className)} {...props} />
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger }
