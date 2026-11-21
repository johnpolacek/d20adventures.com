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
import { buttonClassName, buttonStyle, type ButtonVariant } from "./button"
import { backdropClass, dialogDescriptionClass, dialogFooterClass, dialogHeaderClass, dialogSurface, dialogTitleClass, popupMotionClass } from "./dialog"
import { cn } from "./utils"

type WithClass<T> = Omit<T, "className"> & { className?: string }

const AlertDialog = BaseAlertDialog
const AlertDialogTrigger = BaseAlertDialogTrigger

function AlertDialogContent({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogContent>>) {
  return (
    <>
      <AlertDialogBackdrop className={backdropClass} />
      <BaseAlertDialogContent
        className={cn(dialogSurface, "fixed left-[50%] top-[50%] m-0 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 sm:max-w-lg", popupMotionClass, className)}
        {...props}
      />
    </>
  )
}

function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(dialogHeaderClass, className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(dialogFooterClass, className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogTitle>>) {
  return <BaseAlertDialogTitle className={cn(dialogTitleClass, className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: WithClass<ComponentProps<typeof BaseAlertDialogDescription>>) {
  return <BaseAlertDialogDescription className={cn(dialogDescriptionClass, className)} {...props} />
}

type CloseProps = WithClass<ComponentProps<typeof AlertDialogClose>> & { variant?: ButtonVariant }

/** Closes the dialog as its answer. Runs onClick first. A primary button unless told otherwise, `destructive` for a delete. */
function AlertDialogAction({ className, variant = "primary", ...props }: CloseProps) {
  return <AlertDialogClose value="confirm" className={buttonClassName(variant, undefined, className)} style={buttonStyle(variant)} {...props} />
}

function AlertDialogCancel({ className, variant = "ghost", ...props }: CloseProps) {
  return <AlertDialogClose className={buttonClassName(variant, undefined, className)} style={buttonStyle(variant)} {...props} />
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger }
