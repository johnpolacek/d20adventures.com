"use client"

import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast"
import { XIcon } from "lucide-react"

// A collapsed stack at the top centre of the window: the newest toast in front, the ones behind peeking out under it,
// all of them fanned out on hover or focus.
const stack = `
[data-slot="toast-region"][data-d20] {
  position: fixed; inset: 16px auto auto 50%; translate: -50% 0; margin: 0; padding: 0; border: 0; background: none;
  overflow: visible; width: min(356px, calc(100vw - 32px)); height: var(--toast-front-height);
}
[data-slot="toast-region"][data-d20][data-expanded] { height: calc(var(--toast-stack-height) + (var(--toast-count) - 1) * 8px); }
[data-d20] [data-slot="toast"] {
  --y: calc(var(--toast-index) * 8px);
  position: absolute; inset-inline: 0; top: 0; z-index: calc(100 - var(--toast-index)); overflow: hidden;
  height: var(--toast-height);
  translate: var(--toast-swipe-x, 0px) calc(var(--y) + var(--toast-swipe-y, 0px));
  scale: calc(1 - var(--toast-index) * 0.05);
  transition-property: translate, scale, opacity, height; transition-duration: 220ms; transition-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1); user-select: none;
}
[data-d20] [data-slot="toast"]:not([data-front], [data-expanded]) { height: var(--toast-front-height); }
[data-d20] [data-slot="toast"][data-expanded] { --y: calc(var(--toast-offset) + var(--toast-index) * 8px); scale: 1; }
[data-d20] [data-slot="toast"][data-starting-style] { transition: none; }
[data-d20] [data-slot="toast"][data-starting-style][data-front] { --y: -100%; }
[data-d20] [data-slot="toast"]:is([data-starting-style]:not([data-front]), [data-ending-style]) { opacity: 0; }
[data-d20] [data-slot="toast"][data-swiping] { transition: none; }
@media (prefers-reduced-motion: reduce) { [data-d20] [data-slot="toast"] { transition-property: opacity; } }
`

/** Where toasts show. Place it once, near the root. Call `toast`, `toast.success` or `toast.error` from anywhere. */
function Toaster() {
  return (
    <>
      <style href="d20-toast" precedence="default">
        {stack}
      </style>
      <ToastRegion data-d20="" side="top" align="center">
        {() => (
          <Toast className="flex items-start gap-3 rounded-lg border border-white/20 bg-black/90 p-4 pr-10 font-sans text-sm text-white shadow-lg ring-4 ring-black data-[type=error]:border-red-700/60 data-[type=error]:text-red-200 data-[type=success]:border-emerald-600/50">
            <div className="flex flex-col gap-0.5">
              <ToastTitle className="font-medium" />
              <ToastDescription className="text-white/70" />
            </div>
            <ToastClose aria-label="Close" className="absolute top-3 right-3 opacity-60 transition-opacity hover:opacity-100">
              <XIcon className="size-4" />
            </ToastClose>
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Toaster, toast }
