import { Button as BaseButton } from "@ui-sdk/react/button"
import type { ComponentProps, CSSProperties, ReactNode } from "react"
import { emboss } from "./graphics/styles"
import { textShadow } from "./typography/styles"
import { cn } from "./utils"

// One button, in a rank of looks. Pick the lowest rank that reads.
//   epic         the one call of a screen: start, continue, sign in
//   primary      the main action of a panel or form, and the default
//   outline      a secondary action, or one choice among several (with `active`)
//   ghost        a quiet action: back, cancel, later
//   destructive  delete, leave, ban
//   emboss       the nav's sign-in and sign-up
//   plain        no look at all, for a control with one of its own, like a stage card or a map pin
export type ButtonVariant = "epic" | "primary" | "outline" | "ghost" | "destructive" | "emboss" | "plain"
export type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon"

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className" | "style" | "children"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Chosen, for a button that is one choice among several. */
  active?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

// Disabled keeps its colour, dimmed and desaturated, so it reads as not yet rather than broken.
const disabled =
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-[.7] data-disabled:pointer-events-none data-disabled:opacity-60 data-disabled:saturate-[.7]"
const base = cn(
  "inline-flex select-none items-center justify-center gap-1.5 transition-[scale,color,background-color,border-color,opacity,filter,box-shadow] duration-150 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/70",
  disabled
)

// The plain controls: one face, one border, one press.
const control = "rounded-md border-2 font-sans font-medium leading-tight not-disabled:active:scale-[0.97]"

const looks: Record<Exclude<ButtonVariant, "plain">, string> = {
  epic: "rounded-full border-[rgba(0,0,0,.66)] bg-action-600 bg-[url('/images/app/backgrounds/buried.png')] font-display font-bold tracking-widest text-action-50 brightness-110 saturate-[1.2] scale-105 not-disabled:hover:scale-110 not-disabled:hover:text-white not-disabled:active:scale-100",
  primary: cn(control, "stage-stone"),
  outline: cn(control, "border-action-200/20 bg-action-950/70 text-action-50 not-disabled:hover:border-action-200/35 not-disabled:hover:bg-action-950/90 not-disabled:hover:text-white"),
  ghost: cn(control, "border-transparent bg-transparent text-action-50/80 not-disabled:hover:bg-white/5 not-disabled:hover:text-white"),
  destructive: cn(control, "border-red-400/50 bg-red-950/70 text-red-100 not-disabled:hover:border-red-400/80 not-disabled:hover:bg-red-800/80 not-disabled:hover:text-white"),
  emboss: emboss.className,
}

// The chosen state of a choice, in the primary colour of selection.
const chosen: Partial<Record<ButtonVariant, string>> = {
  outline: "border-primary-400 bg-primary-600 text-white not-disabled:hover:border-primary-300 not-disabled:hover:bg-primary-600",
  ghost: "bg-white/10 text-white",
}

const controlSizes: Record<ButtonSize, string> = {
  xs: "min-h-7 px-2.5 py-0.5 text-xs",
  sm: "min-h-8 px-3 py-1 text-sm",
  default: "min-h-9 px-4 py-1.5 text-sm",
  lg: "min-h-11 px-6 py-2 text-base",
  icon: "size-9 p-0",
}

const epicSizes: Record<ButtonSize, string> = {
  xs: "border-2 px-4 py-1 text-xs",
  sm: "border-[3px] px-6 py-2 text-sm",
  default: "border-4 px-8 py-3 text-base",
  lg: "border-4 px-10 py-4 text-lg",
  icon: "border-2 size-10 p-0",
}

export const epicButtonStyle = {
  ...textShadow,
  boxShadow: "-4px -8px 0px 0px #0006 inset, 4px 4px 0px 0px #FFF7 inset, -4px -8px 36px 0px rgba(0,0,0,.5) inset, -3px -3px 6px 1px rgba(255,255,255,0.5) inset",
}
// The full bevel and outline at two thirds, so a small button reads like a big one shrunk down.
export const epicReducedButtonStyle = {
  textShadow: Array(6).fill("0 0 1.3px #000").join(", "),
  boxShadow: "-2.6px -5.3px 0px 0px #0006 inset, 2.6px 2.6px 0px 0px #FFF7 inset, -2.6px -5.3px 24px 0px rgba(0,0,0,.5) inset, -2px -2px 4px 0.7px rgba(255,255,255,0.5) inset",
}
// The smallest epic button's bevel is half as deep, so the shine along its top stays thin.
export const epicSmallButtonStyle = {
  ...textShadow,
  boxShadow: "-2px -4px 0px 0px #0006 inset, 2px 2px 0px 0px #FFF7 inset, -2px -4px 18px 0px rgba(0,0,0,.5) inset, -2px -2px 4px 0px rgba(255,255,255,0.5) inset",
}

/** The class names of a button, for an element that only looks like one. */
export function buttonClassName(variant: ButtonVariant = "primary", size?: ButtonSize, className?: string, active?: boolean) {
  if (variant === "plain") return cn(size && controlSizes[size], className)
  const sizes = variant === "epic" ? epicSizes : variant === "emboss" ? undefined : controlSizes
  return cn(base, looks[variant], sizes?.[size ?? "default"], active && chosen[variant], className)
}

/** The inline style of a button, for an element that only looks like one. */
export function buttonStyle(variant: ButtonVariant = "primary", size?: ButtonSize): CSSProperties | undefined {
  if (variant === "epic") return size === "xs" || size === "icon" ? epicSmallButtonStyle : size === "sm" ? epicReducedButtonStyle : epicButtonStyle
  if (variant === "emboss") return emboss.style
  return undefined
}

export function Button({ variant = "primary", size, active, className, style, children, ...props }: ButtonProps) {
  return (
    <BaseButton {...props} className={buttonClassName(variant, size, className, active)} style={style ?? buttonStyle(variant, size)}>
      {children}
    </BaseButton>
  )
}

/** One choice among several: the outline button, filled with the selection colour when chosen. */
export function Option({ active, size = "sm", ...rest }: Omit<ButtonProps, "variant">) {
  return <Button variant="outline" type="button" size={size} active={active} {...rest} />
}
