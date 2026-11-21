import { SparklesIcon } from "@heroicons/react/24/outline"
import { Button as BaseButton } from "@ui-sdk/react/button"
import { cva } from "class-variance-authority"
import type { ComponentProps, CSSProperties, ReactNode } from "react"
import { emboss } from "./graphics/styles"
import { textShadow } from "./typography/styles"
import { cn } from "./utils"

// "plain" adds no classes at all: for a control with a look of its own, like a stage card or a map pin.
export type ButtonVariant = "epic" | "brick" | "emboss" | "outline" | "ghost" | "ai" | "sparkle" | "destructive" | "plain"
// lg and sm add nothing today. Callers pass them, so they stay accepted.
export type ButtonSize = "default" | "lg" | "sm" | "icon" | "xs"

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className" | "style" | "children"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

const outline =
  "bg-transparent border-2 bg-blue-950/70 hover:bg-blue-950/80 border-blue-600/90 text-base px-3 py-1 disabled:opacity-100 disabled:saturate-0 disabled:brightness-50"

// Class names for elements styled like a shadcn button, outside Button itself.
export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 disabled:pointer-events-none disabled:opacity-50 disabled:border-transparent select-none",
  {
    variants: {
      variant: {
        default: "bg-primary-400 text-white shadow hover:bg-primary-400/90",
        destructive: "bg-red-700 text-white shadow-sm hover:bg-red-700/90",
        outline,
        secondary: "bg-zinc-800 text-white shadow-sm hover:bg-zinc-800/80",
        ghost: "hover:bg-zinc-800 hover:text-white",
        link: "text-primary-300 underline-offset-4 hover:underline",
        sparkle: cn(outline, "scale-90 sm:scale-100 -left-1 sm:left-0"),
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        xs: "h-7 rounded-md px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export const baseButtonClass =
  "inline-flex gap-1 items-center justify-center transition-[scale,color,background-color,border-color,opacity,filter,box-shadow] ease-snap duration-150 text-blue-50 hover:text-white hover:scale-105 active:scale-100 disabled:bg-zinc-600 disabled:opacity-50 disabled:pointer-events-none data-disabled:opacity-50 data-disabled:pointer-events-none px-3 rounded-md py-1 disabled:border-transparent select-none"
export const epicButtonClass = cn(
  baseButtonClass,
  "px-8 py-3 bg-blue-600 font-bold brightness-110 saturate-[1.2] scale-105 active:scale-100 hover:scale-110 border-[rgba(0,0,0,.66)] disabled:opacity-90 border-4 rounded-full font-display tracking-widest bg-[url('/images/app/backgrounds/buried.png')]"
)
export const aiButtonClass = cn(
  baseButtonClass,
  "bg-black/10 hover:bg-black/20 hover:scale-100 mix-blend-hard-light text-lg sm:text-2xl border-double border-8 px-6 rounded-full border-white/20 hover:border-white/30 font-mono"
)
export const brickButtonClass =
  "font-serif bg-blue-600 saturate-[1.2] brightness-110 rounded-2xl border-4 border-blue-900 text-white ml-[2px] px-2 py-[2px] rounded text-sm transition-[scale,filter] ease-snap duration-150 hover:scale-105 active:scale-95 bg-[url('/images/app/backgrounds/buried.png')]"

export const epicButtonStyle = {
  ...textShadow,
  boxShadow: "-4px -8px 0px 0px #0006 inset, 4px 4px 0px 0px #FFF7 inset, -4px -8px 36px 0px rgba(0,0,0,.5) inset, -3px -3px 6px 1px rgba(255,255,255,0.5) inset",
}
// A small epic button's bevel is half as deep, so the shine along its top stays thin.
export const epicSmallButtonStyle = {
  ...textShadow,
  boxShadow: "-2px -4px 0px 0px #0006 inset, 2px 2px 0px 0px #FFF7 inset, -2px -4px 18px 0px rgba(0,0,0,.5) inset, -2px -2px 4px 0px rgba(255,255,255,0.5) inset",
}
// The full bevel and outline at two thirds, so a small button reads like a big one shrunk down.
export const epicReducedButtonStyle = {
  textShadow: Array(6).fill("0 0 1.3px #000").join(", "),
  boxShadow: "-2.6px -5.3px 0px 0px #0006 inset, 2.6px 2.6px 0px 0px #FFF7 inset, -2.6px -5.3px 24px 0px rgba(0,0,0,.5) inset, -2px -2px 4px 0.7px rgba(255,255,255,0.5) inset",
}

const outlineClass = "bg-transparent bg-blue-950/70 hover:bg-blue-950/80 border-2 border-blue-200/20 text-base px-3 py-1.5 select-none"

const variantClasses: Record<ButtonVariant, string> = {
  epic: epicButtonClass,
  brick: brickButtonClass,
  emboss: emboss.className,
  ai: aiButtonClass,
  outline: outlineClass,
  sparkle: cn(outlineClass, "text-[11px] sm:text-xs"),
  ghost: "bg-transparent border-2 border-transparent px-2 py-1",
  plain: "",
  destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
}

const sizeClasses: Partial<Record<ButtonSize, string>> = {
  icon: "h-9 w-9",
  xs: "px-5 py-1 text-xs",
}

/** The class names of a button, for an element that only looks like one. */
export function buttonClassName(variant?: ButtonVariant, size?: ButtonSize, className?: string) {
  if (variant === "plain") return cn(size && sizeClasses[size], className)
  return cn(baseButtonClass, variant && variantClasses[variant], size && sizeClasses[size], className)
}

/** The inline style of a button, for an element that only looks like one. */
export function buttonStyle(variant?: ButtonVariant, size?: ButtonSize): CSSProperties | undefined {
  if (variant === "epic") return size === "xs" ? epicSmallButtonStyle : epicButtonStyle
  if (variant === "emboss") return emboss.style
  if (variant === "ai") return { boxShadow: "0px 0px 10px 2px rgba(0,0,0,.5) inset" }
  return undefined
}

export function Button({ variant, size, className, style, children, ...props }: ButtonProps) {
  return (
    <BaseButton {...props} className={buttonClassName(variant, size, className)} style={style ?? buttonStyle(variant, size)}>
      {variant === "sparkle" && <SparklesIcon className="w-4 h-4 text-accent-200" />}
      {children}
    </BaseButton>
  )
}
