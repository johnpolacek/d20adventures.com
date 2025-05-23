import React, { ReactElement, forwardRef } from "react"
import { cn } from "@/lib/utils"
import { emboss } from "../graphics/styles"
import { textShadow } from "../typography/styles"
import { cva } from "class-variance-authority"
import { SparklesIcon } from "@heroicons/react/24/outline"

export interface ButtonProps {
  id?: string
  children: React.ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
  type?: "button" | "submit" | "reset"
  className?: string
  size?: "default" | "lg" | "sm" | "icon"
  variant?: "epic" | "brick" | "emboss" | "outline" | "ghost" | "ai" | "sparkle" | "destructive"
  disabled?: boolean
  ariaLabel?: string
  asChild?: boolean
  style?: React.CSSProperties
  formAction?: (formData: FormData) => Promise<void>
  role?: string
}

const outline =
  "bg-transparent border-2 bg-blue-950/70 hover:bg-blue-950/80 border-blue-600/90 text-base px-3 py-1 bg-transparent bg-blue-950/70 hover:bg-blue-950/80 border-2 border-blue-600/90 text-base px-3 py-1 disabled:opacity-100 disabled:saturate-0 disabled:brightness-50"

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:border-transparent select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline,
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        sparkle: cn(outline, "scale-90 sm:scale-100 -left-1 sm:left-0"),
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export const baseButtonClass =
  "inline-flex gap-1 items-center justify-center transition-all ease-in-out duration-500 text-blue-50 hover:text-white hover:scale-105 active:scale-100 disabled:bg-gray-600 disabled:opacity-50 disabled:pointer-events-none px-3 rounded-md py-1 disabled:border-transparent select-none"
export const epicButtonClass = cn(
  baseButtonClass,
  "px-8 py-3 bg-blue-600 font-bold brightness-110 saturate-[1.2] scale-105 active:scale-100 hover:scale-110 border-[rgba(0,0,0,.66)] disabled:opacity-90 border-4 rounded-full font-display tracking-widest bg-[url('/images/app/backgrounds/buried.png')]"
)
export const aiButtonClass = cn(
  baseButtonClass,
  "bg-black/10 hover:bg-black/20 hover:scale-100 mix-blend-hard-light text-lg sm:text-2xl border-double border-8 px-6 rounded-full border-white/20 hover:border-white/30 font-mono"
)

export const epicButtonStyle = {
  ...textShadow,
  boxShadow: "-4px -8px 0px 0px #0006 inset, 4px 4px 0px 0px #FFF7 inset, -4px -8px 36px 0px rgba(0,0,0,.5) inset, -3px -3px 6px 1px rgba(255,255,255,0.5) inset",
}
export const brickButtonClass =
  "font-serif bg-blue-600 saturate-[1.2] brightness-110 rounded-2xl border-4 border-blue-900 text-white ml-[2px] px-2 py-[2px] rounded text-sm transition-all ease-in-out hover:scale-105 active:scale-95 bg-[url('/images/app/backgrounds/buried.png')]"

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ id, ariaLabel, role, children, formAction, onClick, type = "button", className = "transition-all ease-in-out", size = "base", variant = "", disabled, asChild, style }, ref) => {
    let sizeClass = ""
    if (size === "large") {
      sizeClass = "text-3xl py-6"
    } else if (size === "small") {
      sizeClass = "text-lg py-2"
    } else if (size === "icon") {
      sizeClass = "h-9 w-9"
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buttonStyle: any

    let variantClass = ""
    if (variant === "epic") {
      variantClass = epicButtonClass
      buttonStyle = epicButtonStyle
    }
    if (variant === "brick") {
      variantClass = brickButtonClass
    }
    if (variant === "emboss") {
      variantClass = emboss.className
      buttonStyle = emboss.style
    }
    if (variant === "ai") {
      variantClass = aiButtonClass
      buttonStyle = { boxShadow: "0px 0px 10px 2px rgba(0,0,0,.5) inset" }
    }

    if (variant === "outline" || variant === "sparkle") {
      variantClass = "bg-transparent bg-blue-950/70 hover:bg-blue-950/80 border-2 border-blue-200/20 text-base px-3 py-1.5 select-none"
    }

    if (variant === "sparkle") {
      variantClass = cn(variantClass, "text-[11px] sm:text-xs")
    }

    if (variant === "ghost") {
      variantClass = "bg-transparent border-2 border-transparent px-2 py-1"
    }

    if (variant === "destructive") {
      variantClass = "bg-red-600 text-white shadow-sm hover:bg-red-700"
    }

    if (asChild && React.isValidElement(children)) {
      // Type assertion to HTMLButtonElement
      return React.cloneElement(children as ReactElement<ButtonProps>, {
        ariaLabel,
        onClick,
        className: cn(baseButtonClass, sizeClass, variantClass, className),
        style: style || buttonStyle,
        disabled,
        type,
      })
    }

    return (
      <button
        ref={ref}
        id={id}
        role={role}
        formAction={formAction}
        aria-label={ariaLabel}
        disabled={disabled}
        type={type}
        onClick={onClick}
        className={cn(baseButtonClass, variantClass, sizeClass, className)}
        style={style || buttonStyle}
      >
        {variant === "sparkle" && <SparklesIcon className="w-4 h-4 text-amber-200" />}
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"

export { Button }
